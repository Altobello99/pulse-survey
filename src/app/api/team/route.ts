import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role === "employee") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const members = await prisma.user.findMany({
    where: { departmentId: session.user.departmentId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      team: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });

  return Response.json({ data: members });
}
