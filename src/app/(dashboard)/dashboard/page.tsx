import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function DashboardRedirect() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  switch (session.user.role) {
    case "admin":
      redirect("/admin");
    case "manager":
      redirect("/manager");
    default:
      redirect("/surveys");
  }
}
