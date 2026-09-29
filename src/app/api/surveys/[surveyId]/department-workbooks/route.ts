import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  buildAllDepartmentWorkbooksZip,
  buildMasterDepartmentWorkbook,
  buildSingleDepartmentWorkbook,
  departmentWorkbookOptions,
  loadDepartmentWorkbookReportData,
  workbookFilename,
} from "@/lib/department-workbook-reports";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { surveyId } = await params;
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") || "options";

  try {
    const data = await loadDepartmentWorkbookReportData(surveyId);
    if (!data) return Response.json({ error: "Survey not found" }, { status: 404 });

    if (mode === "options") {
      return Response.json({
        data: {
          surveyTitle: data.survey.title,
          departments: departmentWorkbookOptions(data),
        },
      });
    }

    if (mode === "master") {
      const workbook = await buildMasterDepartmentWorkbook(data);
      return workbookResponse(
        workbook,
        workbookFilename(data.survey.title, "master"),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
    }

    if (mode === "department") {
      const departmentId = url.searchParams.get("departmentId") || "";
      const department = data.departments.find((item) => item.id === departmentId);
      if (!department) {
        return Response.json({ error: "Department not found" }, { status: 404 });
      }
      const workbook = await buildSingleDepartmentWorkbook(data, departmentId);
      if (!workbook) {
        return Response.json({ error: "Department not found" }, { status: 404 });
      }
      return workbookResponse(
        workbook,
        workbookFilename(data.survey.title, "department", department.name),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
    }

    if (mode === "all-departments") {
      const archive = await buildAllDepartmentWorkbooksZip(data);
      return workbookResponse(
        archive,
        workbookFilename(data.survey.title, "all-departments"),
        "application/zip"
      );
    }

    return Response.json({ error: "Unknown workbook mode" }, { status: 400 });
  } catch (error) {
    console.error("Department workbook generation failed", error);
    return Response.json(
      { error: "The workbook could not be generated. Please try again." },
      { status: 500 }
    );
  }
}

function workbookResponse(buffer: Buffer, filename: string, contentType: string) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": contentType,
    },
  });
}
