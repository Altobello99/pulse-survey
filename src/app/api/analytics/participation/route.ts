import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role === "employee") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const surveys = await prisma.survey.findMany({
    where: { status: { in: ["active", "closed"] } },
    orderBy: { startDate: "asc" },
    select: {
      id: true,
      title: true,
      startDate: true,
      status: true,
      _count: { select: { completions: true } },
    },
  });

  const totalEmployees = await prisma.user.count({
    where: session.user.role === "manager"
      ? { departmentId: session.user.departmentId }
      : {},
  });

  const data = surveys.map((s) => ({
    id: s.id,
    title: s.title,
    date: s.startDate,
    status: s.status,
    completions: s._count.completions,
    total: totalEmployees,
    rate: totalEmployees ? Math.round((s._count.completions / totalEmployees) * 100) : 0,
  }));

  return Response.json({ data });
}
