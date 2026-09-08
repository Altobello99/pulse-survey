import "dotenv/config";
import { backfillCommentAnalyses } from "../src/lib/comment-analysis";
import { prisma } from "../src/lib/prisma";

async function main() {
  const surveyId = process.argv[2];
  const result = await backfillCommentAnalyses(surveyId);
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
