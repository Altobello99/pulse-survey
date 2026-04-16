import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const where: any = {};
  if (session.user.role === "manager") {
    where.departmentId = session.user.departmentId;
  }
  // Employees can see addressed feedback only
  if (session.user.role === "employee") {
    where.status = "addressed";
  }

  const feedback = await prisma.feedback.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { department: true, team: true },
  });

  return Response.json({ data: feedback });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { message, category, includeDepartment } = body;

  if (!message || message.trim().length < 10) {
    return Response.json({ error: "Message must be at least 10 characters" }, { status: 400 });
  }

  const feedback = await prisma.feedback.create({
    data: {
      message,
      category: category || "other",
      departmentId: includeDepartment ? session.user.departmentId : null,
      teamId: includeDepartment ? session.user.teamId : null,
    },
  });

  return Response.json({ data: feedback }, { status: 201 });
}
