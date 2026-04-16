import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Export survey results as CSV (anonymized)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { surveyId } = await params;
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: {
      questions: { orderBy: { order: "asc" } },
      responses: {
        include: {
          answers: true,
          department: { select: { name: true } },
        },
      },
    },
  });

  if (!survey) return Response.json({ error: "Not found" }, { status: 404 });

  // Build CSV header
  const headers = [
    "Response #",
    "Department",
    "Submitted Hour",
    ...survey.questions.map((q) => q.text),
  ];

  // Build rows (anonymized - no userId, no precise time)
  const rows = survey.responses.map((resp, idx) => {
    const vals: string[] = [
      String(idx + 1),
      resp.department?.name || "Anonymous",
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
