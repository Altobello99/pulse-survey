import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncBambooEmployees } from "@/lib/bamboohr";

const TORONTO_TIME_ZONE = "America/Toronto";
const SIX_AM_TORONTO_UTC_SCHEDULES = new Set(["0 10 * * *", "0 11 * * *"]);

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isSixAmToronto()) {
    return Response.json({
      data: {
        skipped: true,
        reason: "Scheduled BambooHR sync only runs at 6:00 AM America/Toronto.",
        torontoTime: getTorontoTimeLabel(),
      },
    });
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

  const schedule = request.headers.get("x-vercel-cron-schedule");
  return Boolean(schedule && SIX_AM_TORONTO_UTC_SCHEDULES.has(schedule));
}

function isSixAmToronto() {
  return getTorontoHour() === 6;
}

function getTorontoHour() {
  const hour = new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO_TIME_ZONE,
    hour: "numeric",
    hourCycle: "h23",
  }).format(new Date());

  return Number(hour);
}

function getTorontoTimeLabel() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());
}
