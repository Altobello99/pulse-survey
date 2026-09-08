import "dotenv/config";
import { backfillCommentAnalyses } from "../src/lib/comment-analysis";
import { prisma } from "../src/lib/prisma";

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const surveyId = args.find((arg) => arg !== "--force");
  const result = await backfillCommentAnalyses(surveyId, { force });
  console.log(JSON.stringify(result));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Comment analysis backfill failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
