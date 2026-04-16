import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // Clear existing data
  await prisma.answer.deleteMany();
  await prisma.surveyResponse.deleteMany();
  await prisma.surveyCompletion.deleteMany();
  await prisma.sentimentAnalysis.deleteMany();
  await prisma.question.deleteMany();
  await prisma.actionItem.deleteMany();
  await prisma.feedback.deleteMany();
  await prisma.survey.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();
  await prisma.department.deleteMany();

  const hash = await bcrypt.hash("password123", 10);

  // Departments
  const engineering = await prisma.department.create({ data: { name: "Engineering" } });
  const marketing = await prisma.department.create({ data: { name: "Marketing" } });
  const customerSuccess = await prisma.department.create({ data: { name: "Customer Success" } });

  // Teams
  const frontend = await prisma.team.create({ data: { name: "Frontend", departmentId: engineering.id } });
  const backend = await prisma.team.create({ data: { name: "Backend", departmentId: engineering.id } });
  const content = await prisma.team.create({ data: { name: "Content", departmentId: marketing.id } });
  const growth = await prisma.team.create({ data: { name: "Growth", departmentId: marketing.id } });
  const support1 = await prisma.team.create({ data: { name: "Support Tier 1", departmentId: customerSuccess.id } });
  const support2 = await prisma.team.create({ data: { name: "Support Tier 2", departmentId: customerSuccess.id } });

  // Users
  const admin = await prisma.user.create({
    data: { email: "admin@pulsesurvey.com", name: "Sarah Admin", passwordHash: hash, role: "admin", departmentId: engineering.id, teamId: frontend.id },
  });

  const engManager = await prisma.user.create({
    data: { email: "eng.manager@pulsesurvey.com", name: "James Chen", passwordHash: hash, role: "manager", departmentId: engineering.id, teamId: frontend.id },
  });
  const mktManager = await prisma.user.create({
    data: { email: "mkt.manager@pulsesurvey.com", name: "Maria Lopez", passwordHash: hash, role: "manager", departmentId: marketing.id, teamId: content.id },
  });
  const csManager = await prisma.user.create({
    data: { email: "cs.manager@pulsesurvey.com", name: "David Kim", passwordHash: hash, role: "manager", departmentId: customerSuccess.id, teamId: support1.id },
  });

  const employees = await Promise.all([
    prisma.user.create({ data: { email: "alice@pulsesurvey.com", name: "Alice Johnson", passwordHash: hash, role: "employee", departmentId: engineering.id, teamId: frontend.id } }),
    prisma.user.create({ data: { email: "bob@pulsesurvey.com", name: "Bob Smith", passwordHash: hash, role: "employee", departmentId: engineering.id, teamId: frontend.id } }),
    prisma.user.create({ data: { email: "carol@pulsesurvey.com", name: "Carol Williams", passwordHash: hash, role: "employee", departmentId: engineering.id, teamId: backend.id } }),
    prisma.user.create({ data: { email: "dan@pulsesurvey.com", name: "Dan Brown", passwordHash: hash, role: "employee", departmentId: engineering.id, teamId: backend.id } }),
    prisma.user.create({ data: { email: "emma@pulsesurvey.com", name: "Emma Davis", passwordHash: hash, role: "employee", departmentId: marketing.id, teamId: content.id } }),
    prisma.user.create({ data: { email: "frank@pulsesurvey.com", name: "Frank Miller", passwordHash: hash, role: "employee", departmentId: marketing.id, teamId: content.id } }),
    prisma.user.create({ data: { email: "grace@pulsesurvey.com", name: "Grace Wilson", passwordHash: hash, role: "employee", departmentId: marketing.id, teamId: growth.id } }),
    prisma.user.create({ data: { email: "henry@pulsesurvey.com", name: "Henry Taylor", passwordHash: hash, role: "employee", departmentId: customerSuccess.id, teamId: support1.id } }),
    prisma.user.create({ data: { email: "iris@pulsesurvey.com", name: "Iris Anderson", passwordHash: hash, role: "employee", departmentId: customerSuccess.id, teamId: support1.id } }),
    prisma.user.create({ data: { email: "jack@pulsesurvey.com", name: "Jack Thomas", passwordHash: hash, role: "employee", departmentId: customerSuccess.id, teamId: support2.id } }),
    prisma.user.create({ data: { email: "kate@pulsesurvey.com", name: "Kate Martinez", passwordHash: hash, role: "employee", departmentId: customerSuccess.id, teamId: support2.id } }),
  ]);

  const allUsers = [admin, engManager, mktManager, csManager, ...employees];

  // Survey 1: Closed with full data
  const survey1 = await prisma.survey.create({
    data: {
      title: "Q1 Employee Engagement Pulse",
      description: "Quarterly pulse survey to measure overall engagement and satisfaction",
      status: "closed",
      frequency: "monthly",
      startDate: new Date("2026-01-15"),
      endDate: new Date("2026-01-31"),
      createdById: admin.id,
      questions: {
        create: [
          { text: "How satisfied are you with your work-life balance?", type: "rating", order: 0 },
          { text: "I feel valued and recognized for my contributions.", type: "rating", order: 1 },
          { text: "How would you rate communication within your team?", type: "rating", order: 2 },
          { text: "What is your preferred way to receive feedback?", type: "multiple_choice", order: 3, options: JSON.stringify(["1:1 meetings", "Written feedback", "Team retrospectives", "Instant messages"]) },
          { text: "What is one thing we could do to improve your work experience?", type: "free_text", order: 4 },
        ],
      },
    },
    include: { questions: true },
  });

  // Survey 2: Closed with data
  const survey2 = await prisma.survey.create({
    data: {
      title: "Weekly Check-in: March Week 4",
      description: "Quick weekly pulse to check team morale",
      status: "closed",
      frequency: "weekly",
      startDate: new Date("2026-03-23"),
      endDate: new Date("2026-03-29"),
      createdById: admin.id,
      questions: {
        create: [
          { text: "How are you feeling about your workload this week?", type: "rating", order: 0 },
          { text: "Do you have the tools and resources you need?", type: "rating", order: 1 },
          { text: "What best describes your current work environment?", type: "multiple_choice", order: 2, options: JSON.stringify(["Fully remote", "Hybrid", "In-office", "Flexible"]) },
          { text: "Any blockers or concerns you'd like to share?", type: "free_text", order: 3 },
        ],
      },
    },
    include: { questions: true },
  });

  // Survey 3: Active
  const survey3 = await prisma.survey.create({
    data: {
      title: "April Pulse Survey",
      description: "Monthly engagement check-in for April",
      status: "active",
      frequency: "monthly",
      startDate: new Date("2026-04-01"),
      endDate: new Date("2026-04-30"),
      createdById: admin.id,
      questions: {
        create: [
          { text: "How motivated do you feel at work this month?", type: "rating", order: 0 },
          { text: "I feel my manager supports my professional growth.", type: "rating", order: 1 },
          { text: "How well does your team collaborate?", type: "rating", order: 2 },
          { text: "Which area would you most like to see improved?", type: "multiple_choice", order: 3, options: JSON.stringify(["Career development", "Team communication", "Work-life balance", "Benefits & perks"]) },
          { text: "What would make this a great month at work?", type: "free_text", order: 4 },
        ],
      },
    },
    include: { questions: true },
  });

  // Survey 4: Draft
  await prisma.survey.create({
    data: {
      title: "Remote Work Satisfaction",
      description: "Deep dive into remote work experience and preferences",
      status: "draft",
      frequency: "one-time",
      startDate: new Date("2026-05-01"),
      endDate: new Date("2026-05-15"),
      createdById: admin.id,
      questions: {
        create: [
          { text: "How productive do you feel working remotely?", type: "rating", order: 0 },
          { text: "What is your ideal work arrangement?", type: "multiple_choice", order: 1, options: JSON.stringify(["Fully remote", "3 days office / 2 remote", "2 days office / 3 remote", "Fully in-office"]) },
          { text: "What challenges do you face with remote work?", type: "free_text", order: 2 },
        ],
      },
    },
  });

  // Generate responses for surveys 1 and 2
  const freeTextResponses1 = [
    "More flexible hours would be amazing. Sometimes I need to handle personal errands during the day.",
    "Better career development paths. I feel stuck in my current role without clear progression.",
    "More team bonding activities, even virtual ones. We used to have fun game nights before.",
    "I wish we had better documentation for our internal tools. Onboarding new people is painful.",
    "The new project management tool is great! More investments in tooling like this please.",
    "Regular skip-level meetings would help leadership understand ground-level challenges better.",
    "Our health benefits could be improved. Dental coverage is particularly lacking.",
    "I love the learning stipend! More support for conference attendance would be great.",
    "The open office layout is too noisy. Need more quiet focus areas or better noise-canceling headphones.",
    "Recognition for small wins, not just big launches. Day-to-day effort matters too.",
    "Cross-team collaboration feels siloed. Maybe monthly cross-department lunch-and-learns?",
    "The recent all-hands was really inspiring. More transparency about company direction helps.",
  ];

  const freeTextResponses2 = [
    "The sprint was overloaded this week. We need to be more realistic about capacity.",
    "No major blockers, but the CI pipeline has been slow. Affects deployment velocity.",
    "Would appreciate more async communication. Too many meetings eating into focus time.",
    "Everything's going well! The new standup format is much more efficient.",
    "Need clarity on Q2 priorities. Hard to plan when goals keep shifting.",
    "Internet issues at the co-working space are impacting my productivity.",
    "The hackathon last week was energizing. More innovation time would be great.",
    "Client feedback has been positive. Feels good to see our work making an impact.",
    "Would love to see more mentorship opportunities for junior team members.",
    "Team morale is high after the successful launch. Let's keep this momentum going!",
  ];

  const feedbackOptions1 = ["1:1 meetings", "Written feedback", "Team retrospectives", "Instant messages"];
  const envOptions = ["Fully remote", "Hybrid", "In-office", "Flexible"];

  // Responses for Survey 1
  for (let i = 0; i < 12; i++) {
    const user = allUsers[i % allUsers.length];
    const response = await prisma.surveyResponse.create({
      data: {
        surveyId: survey1.id,
        departmentId: user.departmentId,
        teamId: user.teamId,
        answers: {
          create: [
            { questionId: survey1.questions[0].id, ratingValue: [3, 4, 4, 5, 3, 4, 2, 4, 5, 3, 4, 3][i] },
            { questionId: survey1.questions[1].id, ratingValue: [4, 3, 5, 4, 3, 2, 4, 5, 3, 4, 4, 3][i] },
            { questionId: survey1.questions[2].id, ratingValue: [3, 4, 4, 3, 5, 4, 3, 4, 4, 3, 5, 4][i] },
            { questionId: survey1.questions[3].id, choiceValue: feedbackOptions1[i % 4] },
            { questionId: survey1.questions[4].id, textValue: freeTextResponses1[i] },
          ],
        },
      },
    });

    await prisma.surveyCompletion.create({
      data: { userId: user.id, surveyId: survey1.id },
    });
  }

  // Responses for Survey 2
  for (let i = 0; i < 10; i++) {
    const user = allUsers[i % allUsers.length];
    await prisma.surveyResponse.create({
      data: {
        surveyId: survey2.id,
        departmentId: user.departmentId,
        teamId: user.teamId,
        answers: {
          create: [
            { questionId: survey2.questions[0].id, ratingValue: [3, 4, 2, 4, 5, 3, 4, 3, 4, 5][i] },
            { questionId: survey2.questions[1].id, ratingValue: [4, 4, 3, 5, 4, 3, 4, 4, 5, 4][i] },
            { questionId: survey2.questions[2].id, choiceValue: envOptions[i % 4] },
            { questionId: survey2.questions[3].id, textValue: freeTextResponses2[i] },
          ],
        },
      },
    });

    await prisma.surveyCompletion.create({
      data: { userId: user.id, surveyId: survey2.id },
    });
  }

  // Partial responses for Survey 3 (active)
  for (let i = 0; i < 5; i++) {
    const user = allUsers[i];
    const improveOptions = ["Career development", "Team communication", "Work-life balance", "Benefits & perks"];
    await prisma.surveyResponse.create({
      data: {
        surveyId: survey3.id,
        departmentId: user.departmentId,
        teamId: user.teamId,
        answers: {
          create: [
            { questionId: survey3.questions[0].id, ratingValue: [4, 3, 5, 4, 3][i] },
            { questionId: survey3.questions[1].id, ratingValue: [5, 4, 4, 3, 4][i] },
            { questionId: survey3.questions[2].id, ratingValue: [4, 4, 5, 3, 4][i] },
            { questionId: survey3.questions[3].id, choiceValue: improveOptions[i % 4] },
            { questionId: survey3.questions[4].id, textValue: [
              "More cross-team projects to learn from other departments.",
              "Regular team retrospectives focused on process improvement.",
              "A mentorship matching program for career growth.",
              "Better async communication norms to reduce meeting fatigue.",
              "Celebrating small wins more often to boost team morale.",
            ][i] },
          ],
        },
      },
    });

    await prisma.surveyCompletion.create({
      data: { userId: user.id, surveyId: survey3.id },
    });
  }

  // Sentiment analyses for closed surveys
  await prisma.sentimentAnalysis.create({
    data: {
      surveyId: survey1.id,
      questionId: survey1.questions[4].id,
      sentiment: "mixed",
      score: 0.35,
      themes: JSON.stringify(["work-life balance", "career development", "team bonding", "tooling", "recognition", "benefits"]),
      insights: JSON.stringify([
        "Employees value flexibility - consider implementing flexible hours policy",
        "Career development paths need to be more clearly defined and communicated",
        "Investment in tooling and documentation is appreciated and should continue",
        "Recognition programs should celebrate day-to-day contributions, not just milestones",
        "Cross-department collaboration could be improved through structured programs",
      ]),
      summary: "Overall sentiment is cautiously positive. Employees appreciate recent tooling improvements and company transparency, but express concerns about career progression clarity and work-life balance. There is strong appetite for more team bonding and cross-functional collaboration.",
    },
  });

  await prisma.sentimentAnalysis.create({
    data: {
      surveyId: survey2.id,
      questionId: survey2.questions[3].id,
      sentiment: "positive",
      score: 0.52,
      themes: JSON.stringify(["meeting efficiency", "sprint planning", "innovation time", "mentorship", "team morale"]),
      insights: JSON.stringify([
        "Sprint capacity planning needs recalibration - teams report overloading",
        "Reduce meeting load and promote async communication patterns",
        "The hackathon format was well-received - allocate regular innovation time",
        "Mentorship programs would help with junior developer retention",
      ]),
      summary: "Team morale is generally high following a successful product launch. The main areas of concern are around workload management and meeting overload. Employees are energized by innovation opportunities and positive client feedback.",
    },
  });

  // Feedback
  const feedbackItems = [
    { message: "The new onboarding process is much better than before. New hires are ramping up faster.", category: "praise", sentiment: "positive", status: "reviewed", departmentId: engineering.id },
    { message: "We need better mental health support. The current EAP is hard to navigate and not well communicated.", category: "concern", sentiment: "negative", status: "addressed", departmentId: null },
    { message: "Could we get a quarterly tech talk series where teams share what they've been working on? Would help break silos.", category: "suggestion", sentiment: "positive", status: "new", departmentId: marketing.id },
    { message: "The recent office renovation is great but the open floor plan makes focused work difficult. Need more phone booths.", category: "concern", sentiment: "negative", status: "reviewed", departmentId: engineering.id },
    { message: "Shoutout to the customer success team for handling the outage communication so well last week!", category: "praise", sentiment: "positive", status: "new", departmentId: customerSuccess.id },
    { message: "The performance review process feels outdated. Can we move to continuous feedback instead of annual reviews?", category: "suggestion", sentiment: "neutral", status: "new", departmentId: null },
    { message: "I appreciate the transparency in the last all-hands about company financials. More of this please.", category: "praise", sentiment: "positive", status: "reviewed", departmentId: null },
    { message: "The parking situation at HQ is getting worse. Can we get subsidized transit passes or more remote days?", category: "concern", sentiment: "negative", status: "addressed", departmentId: engineering.id, teamId: backend.id },
  ];

  for (const fb of feedbackItems) {
    await prisma.feedback.create({ data: fb as any });
  }

  // Action items
  const actionItems = [
    { title: "Schedule monthly 1:1 career development chats", description: "Set up recurring 30-min sessions with each direct report to discuss career goals and growth plans", status: "in_progress", priority: "high", dueDate: new Date("2026-04-15"), createdById: engManager.id, teamId: frontend.id },
    { title: "Set up weekly async standup", description: "Move daily standups to async format using Slack to reduce meeting fatigue", status: "open", priority: "medium", dueDate: new Date("2026-04-20"), createdById: engManager.id, teamId: frontend.id },
    { title: "Research remote collaboration tools", description: "Evaluate Miro, FigJam, and other tools for better remote brainstorming sessions", status: "completed", priority: "low", dueDate: new Date("2026-03-30"), createdById: mktManager.id, teamId: content.id },
    { title: "Plan team building activity", description: "Organize a virtual escape room or game night for Q2 kickoff", status: "open", priority: "medium", dueDate: new Date("2026-04-25"), createdById: csManager.id, teamId: support1.id },
    { title: "Create mentorship program proposal", description: "Draft a proposal for a structured mentorship program pairing senior and junior team members", status: "in_progress", priority: "high", dueDate: new Date("2026-04-30"), createdById: engManager.id, teamId: backend.id },
    { title: "Update team documentation", description: "Review and update onboarding docs and runbooks based on new team member feedback", status: "completed", priority: "medium", dueDate: new Date("2026-03-15"), createdById: csManager.id, teamId: support2.id },
  ];

  for (const action of actionItems) {
    await prisma.actionItem.create({ data: action });
  }

  console.log("Seeding complete!");
  console.log("\nDemo credentials (all use password: password123):");
  console.log("  Admin:    admin@pulsesurvey.com");
  console.log("  Manager:  eng.manager@pulsesurvey.com");
  console.log("  Employee: alice@pulsesurvey.com");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
