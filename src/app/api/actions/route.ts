import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role === "employee") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const where: any = {};
  if (session.user.role === "manager") {
    where.createdById = session.user.id;
  }

  const actions = await prisma.actionItem.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { team: true, createdBy: { select: { name: true } } },
  });

  return Response.json({ data: actions });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role === "employee") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { title, description, priority, dueDate, teamId, sourceSurveyId } = body;

  if (!title) {
    return Response.json({ error: "Title is required" }, { status: 400 });
  }

  const action = await prisma.actionItem.create({
    data: {
      title,
      description,
      priority: priority || "medium",
      dueDate: dueDate ? new Date(dueDate) : null,
      createdById: session.user.id,
      teamId: teamId || session.user.teamId,
      sourceSurveyId,
    },
  });

  return Response.json({ data: action }, { status: 201 });
}
