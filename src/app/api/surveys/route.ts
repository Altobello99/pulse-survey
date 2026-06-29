import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const surveys = await prisma.survey.findMany({
    include: {
      questions: { orderBy: { order: "asc" } },
      _count: { select: { responses: true, completions: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const completions = await prisma.surveyCompletion.findMany({
    where: { userId: session.user.id },
    select: { surveyId: true },
  });
  const completedIds = new Set(completions.map((c) => c.surveyId));

  // Employees see active surveys and closed/completed survey states, but never results.
  if (session.user.role === "employee") {
    const now = new Date();
    const filtered = surveys.filter(
      (s) =>
        s.status === "active" ||
        s.status === "closed" ||
        new Date(s.endDate) < now
    );

    return Response.json({
      data: filtered.map((s) => ({
        ...s,
        completed: completedIds.has(s.id),
      })),
    });
  }

  return Response.json({
    data: surveys.map((s) => ({
      ...s,
      completed: completedIds.has(s.id),
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { title, description, frequency, startDate, endDate, status, questions } = body;

  if (!title || !startDate || !endDate) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const survey = await prisma.survey.create({
    data: {
      title,
      description,
      frequency,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: status || "draft",
      createdById: session.user.id,
      questions: {
        create: (questions || []).map((q: any, i: number) => ({
          text: q.text,
          section: q.section?.trim() || null,
          type: q.type,
          required: q.required ?? true,
          order: i,
          options: q.options ? JSON.stringify(q.options) : null,
        })),
      },
    },
    include: { questions: true },
  });

  return Response.json({ data: survey }, { status: 201 });
}
