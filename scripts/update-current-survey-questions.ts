import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

type QuestionInput = {
  section: string;
  text: string;
  type: "rating" | "multiple_choice" | "free_text";
  required?: boolean;
  options?: string[];
};

const surveyTitle = "Employee Pulse Survey";

const questions: QuestionInput[] = [
  {
    section: "Engagement & Alignment",
    text: "Do you clearly understand Clutch's business priorities?",
    type: "rating",
  },
  {
    section: "Engagement & Alignment",
    text: "How confident do you feel your work directly contributes to Clutch's business goals?",
    type: "rating",
  },
  {
    section: "Communication & Collaboration",
    text: "How well do you feel your team and other teams collaborate to achieve shared goals?",
    type: "rating",
  },
  {
    section: "Total Rewards & Recognition",
    text: "Do you feel recognized for your contributions directly to business results?",
    type: "rating",
  },
  {
    section: "Work Safety",
    text: "Do you feel safe performing your job?",
    type: "rating",
  },
  {
    section: "Facility Experience",
    text: "Are your tools, technology, and systems easy to use and supportive of productivity?",
    type: "rating",
  },
  {
    section: "Learning",
    text: "Do you have access to adequate learning resources and tools to perform your job effectively?",
    type: "rating",
  },
  {
    section: "Growth & Development",
    text: "Do you see a clear opportunity to grow and develop your career at Clutch?",
    type: "rating",
  },
  {
    section: "Manager Support",
    text: "How would you rate your working relationship with your manager?",
    type: "rating",
  },
  {
    section: "Senior Leadership Visibility",
    text: "Are you satisfied with the frequency and transparency of communication from senior leadership?",
    type: "rating",
  },
  {
    section: "Belonging & Advocacy",
    text: "Do you have a best friend at work?",
    type: "multiple_choice",
    options: ["Yes", "No", "Prefer not to say"],
  },
  {
    section: "Belonging & Advocacy",
    text: "On a scale of 0 to 10, how likely are you to recommend our company as a place to work?",
    type: "rating",
    options: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
  },
  {
    section: "Ending Questions",
    text: "What one thing would help you or your team drive better results?",
    type: "free_text",
    required: false,
  },
];

async function main() {
  const survey = await prisma.survey.findFirst({
    where: { title: surveyTitle, status: "active" },
    orderBy: { createdAt: "desc" },
    include: { questions: { orderBy: { order: "asc" } } },
  });

  if (!survey) throw new Error(`Active survey not found: ${surveyTitle}`);

  const desiredByText = new Map(questions.map((question) => [question.text, question]));

  for (const existing of survey.questions) {
    if (desiredByText.has(existing.text)) continue;
    if (existing.text === "What one thing would help you or your team drive better results this quarter?") {
      continue;
    }
    if (existing.text.toLowerCase().includes("workload")) {
      await prisma.answer.deleteMany({ where: { questionId: existing.id } });
      await prisma.question.delete({ where: { id: existing.id } });
      console.log(`Removed question: ${existing.text}`);
    }
  }

  for (const [order, question] of questions.entries()) {
    const existing = survey.questions.find((item) => item.text === question.text) ||
      (question.text === "What one thing would help you or your team drive better results?"
        ? survey.questions.find(
            (item) =>
              item.text === "What one thing would help you or your team drive better results this quarter?"
          )
        : undefined);
    const data = {
      section: question.section,
      text: question.text,
      type: question.type,
      required: question.required ?? true,
      order,
      options: question.options ? JSON.stringify(question.options) : null,
    };

    if (existing) {
      await prisma.question.update({ where: { id: existing.id }, data });
    } else {
      await prisma.question.create({ data: { ...data, surveyId: survey.id } });
      console.log(`Added question: ${question.text}`);
    }
  }

  console.log(`Updated ${questions.length} questions for ${surveyTitle}.`);
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
