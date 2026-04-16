import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ANONYMITY_THRESHOLD } from "@/lib/constants";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role === "employee") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { surveyId } = await params;

  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: {
      questions: { orderBy: { order: "asc" } },
      sentimentAnalyses: { orderBy: { analyzedAt: "desc" }, take: 1 },
    },
  });
  if (!survey) return Response.json({ error: "Not found" }, { status: 404 });

  // Filter responses based on role
  const responseFilter: any = { surveyId };
  if (session.user.role === "manager") {
    // Check team size for anonymity
    const teamSize = session.user.teamId
      ? await prisma.user.count({ where: { teamId: session.user.teamId } })
      : 0;

    if (teamSize >= ANONYMITY_THRESHOLD && session.user.teamId) {
      responseFilter.teamId = session.user.teamId;
    } else {
      responseFilter.departmentId = session.user.departmentId;
    }
  }

  const responses = await prisma.surveyResponse.findMany({
    where: responseFilter,
    include: { answers: true },
  });

  // Aggregate results per question
  const questionResults = survey.questions.map((q) => {
    const qAnswers = responses.flatMap((r) =>
      r.answers.filter((a) => a.questionId === q.id)
    );

    if (q.type === "rating") {
      const ratings = qAnswers.map((a) => a.ratingValue).filter((v): v is number => v !== null);
      const avg = ratings.length ? ratings.reduce((s, v) => s + v, 0) / ratings.length : 0;
      const distribution = [1, 2, 3, 4, 5].map((v) => ({
        rating: v,
        count: ratings.filter((r) => r === v).length,
      }));
      return { ...q, resultType: "rating" as const, average: Math.round(avg * 10) / 10, distribution, total: ratings.length };
    }

    if (q.type === "multiple_choice") {
      const choices = qAnswers.map((a) => a.choiceValue).filter((v): v is string => v !== null);
      const options: string[] = q.options ? JSON.parse(q.options) : [];
      const distribution = options.map((opt) => ({
        option: opt,
        count: choices.filter((c) => c === opt).length,
      }));
      return { ...q, resultType: "multiple_choice" as const, distribution, total: choices.length };
    }

    // free_text
    const texts = qAnswers.map((a) => a.textValue).filter((v): v is string => v !== null && v.trim() !== "");
    return { ...q, resultType: "free_text" as const, responses: texts, total: texts.length };
  });

  // Participation stats
  const totalEmployees = await prisma.user.count({
    where: session.user.role === "manager"
      ? { departmentId: session.user.departmentId }
      : {},
  });

  const completions = await prisma.surveyCompletion.count({
    where: { surveyId },
  });

  // DETAILED ADMIN BREAKDOWN: department-level and team-level stats
  // Protecting anonymity: teams with fewer than threshold responses are hidden
  let departmentBreakdown: any[] = [];
  if (session.user.role === "admin") {
    const departments = await prisma.department.findMany({
      include: { _count: { select: { users: true } } },
    });

    departmentBreakdown = await Promise.all(
      departments.map(async (dept) => {
        const deptResponses = responses.filter((r) => r.departmentId === dept.id);
        const deptCompletions = await prisma.surveyCompletion.count({
          where: { surveyId, user: { departmentId: dept.id } },
        });

        // Average ratings for this department
        const ratings = deptResponses.flatMap((r) =>
          r.answers.filter((a) => a.ratingValue !== null).map((a) => a.ratingValue!)
        );
        const avgRating = ratings.length
          ? Math.round((ratings.reduce((s, v) => s + v, 0) / ratings.length) * 10) / 10
          : 0;

        return {
          id: dept.id,
          name: dept.name,
          employeeCount: dept._count.users,
          responses: deptResponses.length,
          completions: deptCompletions,
          participationRate: dept._count.users
            ? Math.round((deptCompletions / dept._count.users) * 100)
            : 0,
          avgRating,
        };
      })
    );
  }

  return Response.json({
    data: {
      survey: {
        ...survey,
        allowAnonymous: survey.allowAnonymous,
        publicToken: survey.publicToken,
      },
      questionResults,
      participationRate: totalEmployees ? Math.round((completions / totalEmployees) * 100) : 0,
      totalResponses: responses.length,
      totalEmployees,
      completions,
      sentiment: survey.sentimentAnalyses[0] || null,
      departmentBreakdown,
    },
  });
}
