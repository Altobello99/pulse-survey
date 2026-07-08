import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ANONYMITY_THRESHOLD } from "@/lib/constants";
import { departmentedBambooEmployeeWhere } from "@/lib/access";

// Cross-tab analytics: slice survey results by department, tenure bracket, and job level
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const surveyId = req.nextUrl.searchParams.get("surveyId");
  if (!surveyId) return Response.json({ error: "Missing surveyId" }, { status: 400 });

  const responses = await prisma.surveyResponse.findMany({
    where: { surveyId },
    include: {
      answers: true,
      department: { select: { name: true } },
    },
  });

  // Get all users for tenure + level data (linked by department/team, not by response)
  const users = await prisma.user.findMany({
    where: departmentedBambooEmployeeWhere,
    select: { departmentId: true, teamId: true, hireDate: true, jobLevel: true },
  });

  // Calculate tenure brackets from user pool
  function tenureBracket(hireDate: Date | null): string {
    if (!hireDate) return "Unknown";
    const years = (Date.now() - new Date(hireDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (years < 1) return "< 1 year";
    if (years < 3) return "1-3 years";
    if (years < 5) return "3-5 years";
    return "5+ years";
  }

  // Department breakdown
  const byDepartment: Record<string, { ratings: number[]; count: number }> = {};
  for (const resp of responses) {
    const dept = resp.department?.name || "Anonymous";
    if (!byDepartment[dept]) byDepartment[dept] = { ratings: [], count: 0 };
    byDepartment[dept].count++;
    for (const a of resp.answers) {
      if (a.ratingValue !== null) byDepartment[dept].ratings.push(a.ratingValue);
    }
  }

  const departmentData = Object.entries(byDepartment)
    .filter(([_, d]) => d.count >= ANONYMITY_THRESHOLD)
    .map(([name, d]) => ({
      name,
      count: d.count,
      avgRating: d.ratings.length
        ? Math.round((d.ratings.reduce((s, v) => s + v, 0) / d.ratings.length) * 10) / 10
        : null,
    }));

  // Job level breakdown (from user pool, not linked to responses directly)
  const levelCounts: Record<string, number> = {};
  for (const u of users) {
    const level = u.jobLevel || "Unspecified";
    levelCounts[level] = (levelCounts[level] || 0) + 1;
  }

  // Tenure bracket distribution
  const tenureCounts: Record<string, number> = {};
  for (const u of users) {
    const bracket = tenureBracket(u.hireDate);
    tenureCounts[bracket] = (tenureCounts[bracket] || 0) + 1;
  }

  return Response.json({
    data: {
      departmentData,
      levelDistribution: Object.entries(levelCounts).map(([level, count]) => ({ level, count })),
      tenureDistribution: Object.entries(tenureCounts).map(([bracket, count]) => ({ bracket, count })),
      totalResponses: responses.length,
    },
  });
}
