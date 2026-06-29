import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncBambooEmployees } from "@/lib/bamboohr";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return runSync();
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return runSync();
}

async function runSync() {
  try {
    const result = await syncBambooEmployees();
    return Response.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "BambooHR sync failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

function isAuthorizedCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret) return auth === `Bearer ${secret}`;

  return request.headers.get("x-vercel-cron-schedule") === "0 10 * * *";
}
