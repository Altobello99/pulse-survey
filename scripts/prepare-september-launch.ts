import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const surveyTitle = "Employee Pulse Survey";
// September falls in Eastern Daylight Time (UTC-4). These UTC instants render
// as the requested Toronto start and end times throughout the application.
const launchStart = new Date("2026-09-01T04:00:00.000Z");
const launchEnd = new Date("2026-09-19T03:59:59.999Z");
const demoCutoff = new Date("2026-06-01T00:00:00.000Z");

const demoFeedbackMessages = [
  "The new onboarding process is much better than before. New hires are ramping up faster.",
  "We need better mental health support. The current EAP is hard to navigate and not well communicated.",
  "Could we get a quarterly tech talk series where teams share what they've been working on? Would help break silos.",
  "The recent office renovation is great but the open floor plan makes focused work difficult. Need more phone booths.",
  "Shoutout to the customer success team for handling the outage communication so well last week!",
  "The performance review process feels outdated. Can we move to continuous feedback instead of annual reviews?",
  "I appreciate the transparency in the last all-hands about company financials. More of this please.",
  "The parking situation at HQ is getting worse. Can we get subsidized transit passes or more remote days?",
];

const demoActionTitles = [
  "Schedule monthly 1:1 career development chats",
  "Set up weekly async standup",
  "Research remote collaboration tools",
  "Plan team building activity",
  "Create mentorship program proposal",
  "Update team documentation",
];

async function main() {
  const survey = await prisma.survey.findFirst({
    where: { title: surveyTitle, status: "active" },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { responses: true, completions: true } } },
  });

  if (!survey) throw new Error(`Active survey not found: ${surveyTitle}`);
  if (survey._count.responses > 0 || survey._count.completions > 0) {
    throw new Error("Launch preparation stopped because the survey already has submissions.");
  }

  const demoFeedbackWhere = {
    message: { in: demoFeedbackMessages },
    createdAt: { lt: demoCutoff },
  };
  const demoActionsWhere = {
    title: { in: demoActionTitles },
    createdAt: { lt: demoCutoff },
  };
  const [feedbackCount, actionCount] = await Promise.all([
    prisma.feedback.count({ where: demoFeedbackWhere }),
    prisma.actionItem.count({ where: demoActionsWhere }),
  ]);

  if (![0, demoFeedbackMessages.length].includes(feedbackCount)) {
    throw new Error(`Expected 0 or ${demoFeedbackMessages.length} demo feedback records, found ${feedbackCount}.`);
  }
  if (![0, demoActionTitles.length].includes(actionCount)) {
    throw new Error(`Expected 0 or ${demoActionTitles.length} demo action records, found ${actionCount}.`);
  }

  const [updatedSurvey, deletedFeedback, deletedActions] = await prisma.$transaction([
    prisma.survey.update({
      where: { id: survey.id },
      data: {
        status: "active",
        startDate: launchStart,
        endDate: launchEnd,
      },
    }),
    prisma.feedback.deleteMany({ where: demoFeedbackWhere }),
    prisma.actionItem.deleteMany({ where: demoActionsWhere }),
  ]);

  const torontoDateTime = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    dateStyle: "full",
    timeStyle: "long",
  });
  console.log(`Launch start: ${torontoDateTime.format(updatedSurvey.startDate)}`);
  console.log(`Launch end: ${torontoDateTime.format(updatedSurvey.endDate)}`);
  console.log(`Removed ${deletedFeedback.count} demo feedback records.`);
  console.log(`Removed ${deletedActions.count} demo action records.`);
}

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
