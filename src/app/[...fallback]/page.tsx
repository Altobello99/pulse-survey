import { redirect } from "next/navigation";

export default function FallbackPage() {
  redirect("/dashboard");
}
