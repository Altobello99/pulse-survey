import "dotenv/config";
import { surveyRosterEmployeeWhere } from "../src/lib/access";
import { prisma } from "../src/lib/prisma";

type PlannedUpdate = {
  id: string;
  fromDepartmentId: string;
  toDepartmentId: string;
};

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const surveyId = args.find((arg) => arg !== "--apply");
  const survey = surveyId
    ? await prisma.survey.findUnique({
        where: { id: surveyId },
        select: { id: true, title: true, startDate: true },
      })
    : await prisma.survey.findFirst({
        where: { status: { in: ["active", "closed"] } },
        orderBy: { startDate: "desc" },
        select: { id: true, title: true, startDate: true },
      });

  if (!survey) throw new Error("Survey not found");

  const [departments, employees, responses, completions] = await Promise.all([
    prisma.department.findMany({ select: { id: true, name: true } }),
    prisma.user.findMany({
      where: surveyRosterEmployeeWhere(survey.startDate),
      select: {
        managerEmail: true,
        location: true,
        departmentId: true,
      },
    }),
    prisma.surveyResponse.findMany({
      where: { surveyId: survey.id },
      select: {
        id: true,
        managerEmail: true,
        location: true,
        departmentId: true,
      },
    }),
    prisma.surveyCompletion.findMany({
      where: {
        surveyId: survey.id,
        user: surveyRosterEmployeeWhere(survey.startDate),
      },
      select: { user: { select: { departmentId: true } } },
    }),
  ]);

  const departmentNames = new Map(
    departments.map((department) => [department.id, department.name])
  );
  const departmentsByManagerAndLocation = new Map<string, Set<string>>();

  for (const employee of employees) {
    if (!employee.managerEmail) continue;
    const key = demographicKey(employee.managerEmail, employee.location);
    const departmentIds = departmentsByManagerAndLocation.get(key) || new Set<string>();
    departmentIds.add(employee.departmentId);
    departmentsByManagerAndLocation.set(key, departmentIds);
  }

  const updates: PlannedUpdate[] = [];
  const projectedResponseCounts = new Map<string, number>();
  let unresolved = 0;

  for (const response of responses) {
    const candidates = response.managerEmail
      ? departmentsByManagerAndLocation.get(
          demographicKey(response.managerEmail, response.location)
        )
      : undefined;
    const targetDepartmentId = candidates?.size === 1
      ? [...candidates][0]
      : response.departmentId;

    if (candidates && candidates.size > 1 && !candidates.has(response.departmentId)) {
      unresolved += 1;
    }

    projectedResponseCounts.set(
      targetDepartmentId,
      (projectedResponseCounts.get(targetDepartmentId) || 0) + 1
    );

    if (targetDepartmentId !== response.departmentId) {
      updates.push({
        id: response.id,
        fromDepartmentId: response.departmentId,
        toDepartmentId: targetDepartmentId,
      });
    }
  }

  if (apply && updates.length > 0) {
    const updatesByDepartment = new Map<string, string[]>();
    for (const update of updates) {
      const responseIds = updatesByDepartment.get(update.toDepartmentId) || [];
      responseIds.push(update.id);
      updatesByDepartment.set(update.toDepartmentId, responseIds);
    }

    await prisma.$transaction(
      [...updatesByDepartment].map(([departmentId, responseIds]) =>
        prisma.surveyResponse.updateMany({
          where: { id: { in: responseIds }, surveyId: survey.id },
          data: { departmentId },
        })
      )
    );
  }

  const completionCounts = new Map<string, number>();
  for (const completion of completions) {
    const departmentId = completion.user.departmentId;
    completionCounts.set(
      departmentId,
      (completionCounts.get(departmentId) || 0) + 1
    );
  }

  const changes = [...groupChanges(updates, departmentNames)].map(([change, count]) => ({
    change,
    count,
  }));
  const departmentsBelowThreshold = [...completionCounts]
    .filter(
      ([departmentId, completionCount]) =>
        completionCount >= 3 &&
        (projectedResponseCounts.get(departmentId) || 0) < 3
    )
    .map(([departmentId, completionCount]) => ({
      department: departmentNames.get(departmentId) || departmentId,
      completions: completionCount,
      projectedResponses: projectedResponseCounts.get(departmentId) || 0,
    }))
    .sort((left, right) => left.department.localeCompare(right.department));

  console.log(
    JSON.stringify(
      {
        mode: apply ? "applied" : "dry-run",
        survey: { id: survey.id, title: survey.title },
        responses: responses.length,
        correctedResponses: updates.length,
        unresolvedResponses: unresolved,
        changes,
        departmentsBelowThreshold,
      },
      null,
      2
    )
  );
}

function demographicKey(managerEmail: string, location: string | null) {
  return `${managerEmail.trim().toLowerCase()}|${(location || "").trim().toLowerCase()}`;
}

function groupChanges(
  updates: PlannedUpdate[],
  departmentNames: Map<string, string>
) {
  const groups = new Map<string, number>();
  for (const update of updates) {
    const from = departmentNames.get(update.fromDepartmentId) || update.fromDepartmentId;
    const to = departmentNames.get(update.toDepartmentId) || update.toDepartmentId;
    const label = `${from} -> ${to}`;
    groups.set(label, (groups.get(label) || 0) + 1);
  }
  return [...groups].sort((left, right) => right[1] - left[1]);
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Response demographic reconciliation failed"
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
