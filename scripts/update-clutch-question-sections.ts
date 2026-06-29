import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const surveyTitle = "Clutch Employee Pulse";

const groupedQuestions = [
  {
    section: "Engagement & Alignment",
    text: "Do you clearly understand Clutch's business priorities?",
  },
  {
    section: "Engagement & Alignment",
    text: "How confident do you feel your work directly contributes to Clutch's business goals?",
  },
  {
    section: "Communication & Collaboration",
    text: "How well do you feel your team and other teams collaborate to achieve shared goals?",
  },
  {
    section: "Total Rewards & Recognition",
    text: "Do you feel recognized for your contributions directly to business results?",
  },
  {
    section: "Work Safety",
    text: "Do you feel safe performing your job?",
  },
  {
    section: "Facility Experience",
    text: "Are your tools, technology, and systems easy to use and supportive of productivity?",
  },
  {
    section: "Workload",
    text: "Do you have a manageable and sustainable workload?",
  },
  {
    section: "Learning",
    text: "Do you have access to adequate learning resources and tools to perform your job effectively?",
  },
  {
    section: "Growth & Development",
    text: "Do you see a clear opportunity to grow and develop your career at Clutch?",
  },
  {
    section: "Manager Support",
    text: "How would you rate your working relationship with your manager?",
  },
  {
    section: "Senior Leadership Visibility",
    text: "Are you satisfied with the frequency and transparency of communication from senior leadership?",
  },
  {
    section: "Ending Questions",
    text: "What one thing would help you or your team drive better results this quarter?",
  },
];

async function main() {
  const survey = await prisma.survey.findFirst({
    where: { title: surveyTitle },
    orderBy: { createdAt: "desc" },
    include: { questions: { orderBy: { order: "asc" } } },
  });

  if (!survey) {
    throw new Error(`Survey not found: ${surveyTitle}`);
  }

  if (survey.questions.length !== groupedQuestions.length) {
    throw new Error(
      `Expected ${groupedQuestions.length} questions, found ${survey.questions.length}. Refusing to update by order.`
    );
  }

  for (const [index, question] of survey.questions.entries()) {
    const update = groupedQuestions[index];
    await prisma.question.update({
      where: { id: question.id },
      data: {
        section: update.section,
        text: update.text,
        order: index,
      },
    });
  }

  console.log(`Updated ${groupedQuestions.length} question sections for ${survey.title}.`);
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
