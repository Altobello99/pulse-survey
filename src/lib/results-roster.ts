import { prisma } from "@/lib/prisma";
import { surveyRosterEmployeeWhere } from "@/lib/access";

export async function ensureSurveyRosterSnapshot(surveyId: string) {
  const existing = await prisma.surveyRosterSnapshot.count({ where: { surveyId } });
  if (existing > 0) return existing;
  return captureSurveyRosterSnapshot(surveyId);
}

export async function captureSurveyRosterSnapshot(
  surveyId: string,
  options: { replace?: boolean } = {}
) {
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    select: { id: true, startDate: true },
  });
  if (!survey) throw new Error("Survey not found");

  const employees = await prisma.user.findMany({
    where: surveyRosterEmployeeWhere(survey.startDate),
    select: {
      id: true,
      email: true,
      role: true,
      jobTitle: true,
      hireDate: true,
      managerEmail: true,
      departmentId: true,
      department: { select: { name: true } },
      teamId: true,
      team: { select: { name: true } },
      location: true,
      division: true,
    },
  });

  await prisma.$transaction(async (tx) => {
    if (options.replace) {
      await tx.surveyRosterSnapshot.deleteMany({ where: { surveyId } });
    }

    await tx.surveyRosterSnapshot.createMany({
      data: employees.map((employee) => ({
        surveyId,
        userId: employee.id,
        email: employee.email.trim().toLowerCase(),
        role: employee.role,
        jobTitle: employee.jobTitle,
        hireDate: employee.hireDate,
        managerEmail: employee.managerEmail?.trim().toLowerCase() || null,
        departmentId: employee.departmentId,
        departmentName: employee.department.name,
        teamId: employee.teamId,
        teamName: employee.team?.name || null,
        location: employee.location,
        division: employee.division,
        eligible: true,
      })),
      skipDuplicates: true,
    });
  });

  return prisma.surveyRosterSnapshot.count({ where: { surveyId } });
}
