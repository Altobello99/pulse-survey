import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScopedResponseWhere } from "@/lib/access";

// Export survey results as CSV (anonymized)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { surveyId } = await params;
  const responseWhere = await getScopedResponseWhere(session.user, surveyId, {
    departmentId: request.nextUrl.searchParams.get("departmentId"),
    teamId: request.nextUrl.searchParams.get("teamId"),
    location: request.nextUrl.searchParams.get("location"),
  });

  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: {
      questions: { orderBy: { order: "asc" } },
    },
  });

  if (!survey) return Response.json({ error: "Not found" }, { status: 404 });

  const responses = await prisma.surveyResponse.findMany({
    where: responseWhere,
    include: {
      answers: true,
      department: { select: { name: true } },
      team: { select: { name: true } },
    },
  });

  // Build CSV header
  const headers = [
    "Response #",
    "Department",
    "Team",
    "Location",
    "Submitted Hour",
    ...survey.questions.map((q) => (q.section ? `${q.section}: ${q.text}` : q.text)),
  ];

  // Build rows (anonymized - no userId, no precise time)
  const rows = responses.map((resp, idx) => {
    const vals: string[] = [
      String(idx + 1),
      resp.department?.name || "Anonymous",
      resp.team?.name || "",
      resp.location || "",
      new Date(resp.submittedAt).toISOString().replace(/:\d{2}\.\d{3}Z/, ":00"),
    ];

    for (const q of survey.questions) {
      const answer = resp.answers.find((a) => a.questionId === q.id);
      if (!answer) {
        vals.push("");
      } else if (q.type === "rating") {
        vals.push(String(answer.ratingValue ?? ""));
      } else if (q.type === "multiple_choice") {
        vals.push(answer.choiceValue || "");
      } else {
        vals.push(answer.textValue || "");
      }
    }
    return vals;
  });

  // Generate CSV
  function escapeCsv(val: string) {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  }

  const csv = [
    headers.map(escapeCsv).join(","),
    ...rows.map((r) => r.map(escapeCsv).join(",")),
  ].join("\n");

  const filename = `${survey.title.replace(/[^a-zA-Z0-9]/g, "_")}_results.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
