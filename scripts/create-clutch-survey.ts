import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

type QuestionInput = {
  text: string;
  type: "rating" | "free_text";
  required?: boolean;
};

const surveyTitle = "Clutch Employee Pulse";
const previousSurveyTitles = [surveyTitle, "Safety & Leadership Behaviours Pulse"];

const questions: QuestionInput[] = [
  {
    text: "Do you clearly understand Clutch's business priorities?",
    type: "rating",
  },
  {
    text: "How confident do you feel your work directly contributes to Clutch's business goals?",
    type: "rating",
  },
  {
    text: "How well do you feel your team and other teams collaborate to achieve shared goals?",
    type: "rating",
  },
  {
    text: "Do you feel recognized for your contributions directly to business results?",
    type: "rating",
  },
  {
    text: "Do you feel safe performing your job?",
    type: "rating",
  },
  {
    text: "Are your tools, technology, and systems easy to use and supportive of productivity?",
    type: "rating",
  },
  {
    text: "Do you have a manageable and sustainable workload?",
    type: "rating",
  },
  {
    text: "Do you have access to adequate learning resources and tools to perform your job effectively?",
    type: "rating",
  },
  {
    text: "Do you see a clear opportunity to grow and develop your career at Clutch?",
    type: "rating",
  },
  {
    text: "How would you rate your working relationship with your manager?",
    type: "rating",
  },
  {
    text: "Are you satisfied with the frequency and transparency of communication from senior leadership?",
    type: "rating",
  },
  {
    text: "What one thing would help you or your team drive better results this quarter?",
    type: "free_text",
    required: false,
  },
];

async function removeSurvey(title: string) {
  const survey = await prisma.survey.findFirst({ where: { title } });
  if (!survey) return false;

  await prisma.answer.deleteMany({ where: { surveyResponse: { surveyId: survey.id } } });
  await prisma.surveyResponse.deleteMany({ where: { surveyId: survey.id } });
  await prisma.surveyCompletion.deleteMany({ where: { surveyId: survey.id } });
  await prisma.sentimentAnalysis.deleteMany({ where: { surveyId: survey.id } });
  await prisma.anonymousToken.deleteMany({ where: { surveyId: survey.id } });
  await prisma.question.deleteMany({ where: { surveyId: survey.id } });
  await prisma.survey.delete({ where: { id: survey.id } });

  return true;
}

async function main() {
  const admin =
    (await prisma.user.findUnique({ where: { email: "admin@pulsesurvey.com" } })) ||
    (await prisma.user.findFirst({ where: { role: "admin" }, orderBy: { createdAt: "asc" } }));

  if (!admin) throw new Error("Admin user not found. Seed or import an admin first.");

  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 14);
  endDate.setHours(23, 59, 59, 999);

  for (const title of previousSurveyTitles) {
    const removed = await removeSurvey(title);
    if (removed) console.log(`Removed existing survey: ${title}`);
  }

  const survey = await prisma.survey.create({
    data: {
      title: surveyTitle,
      description:
        "A short anonymous pulse survey for Clutch employees. Google sign-in is used only to confirm access and prevent duplicate submissions; responses are stored without name, email, Google ID, or user ID.",
      status: "active",
      frequency: "monthly",
      startDate,
      endDate,
      createdById: admin.id,
      questions: {
        create: questions.map((question, order) => ({
          text: question.text,
          type: question.type,
          required: question.required ?? true,
          order,
        })),
      },
    },
    include: { _count: { select: { questions: true } } },
  });

  console.log("Survey created successfully!");
  console.log(`Title: ${survey.title}`);
  console.log(`Status: ${survey.status}`);
  console.log(`Questions: ${survey._count.questions}`);
  console.log(`Dates: ${survey.startDate.toISOString()} to ${survey.endDate.toISOString()}`);
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
