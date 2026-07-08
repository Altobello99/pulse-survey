import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { activeBambooEmployeeWhere } from "@/lib/access";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: activeBambooEmployeeWhere,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: { select: { name: true } },
      team: { select: { name: true } },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return Response.json({ data: users });
}
