import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ actionId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role === "employee") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { actionId } = await params;
  const body = await request.json();
  const { title, description, status, priority, dueDate } = body;

  const updateData: any = {};
  if (title !== undefined) updateData.title = title;
  if (description !== undefined) updateData.description = description;
  if (status !== undefined) updateData.status = status;
  if (priority !== undefined) updateData.priority = priority;
  if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;

  const action = await prisma.actionItem.update({
    where: { id: actionId },
    data: updateData,
  });

  return Response.json({ data: action });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ actionId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role === "employee") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { actionId } = await params;
  await prisma.actionItem.delete({ where: { id: actionId } });
  return Response.json({ data: { deleted: true } });
}
