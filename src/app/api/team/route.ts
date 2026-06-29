import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScopedEmployeeWhere } from "@/lib/access";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role === "employee") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const members = await prisma.user.findMany({
    where: await getScopedEmployeeWhere(session.user),
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      jobTitle: true,
      location: true,
      team: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });

  return Response.json({ data: members });
}
