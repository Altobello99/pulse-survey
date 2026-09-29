import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  buildResultsData,
  ResultsAccessError,
  type ResultsFilters,
  writeResultsAudit,
} from "@/lib/results-analytics";
import {
  createResultsPdf,
  createResultsPowerPoint,
  createResultsWorkbook,
  type ResultsExportData,
} from "@/lib/results-exports";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { surveyId } = await params;
  const format = request.nextUrl.searchParams.get("format") || "xlsx";
  if (!new Set(["xlsx", "pptx", "pdf"]).has(format)) {
    return Response.json({ error: "Unsupported export format" }, { status: 400 });
  }

  try {
    const filters = parseFilters(request.nextUrl.searchParams);
    const result = await buildResultsData(surveyId, session.user, filters);
    if (result.locked || !("metrics" in result)) {
      return Response.json({ error: "Results have not been released." }, { status: 403 });
    }

    const data = result as ResultsExportData;
    const file =
      format === "pdf"
        ? await createResultsPdf(data)
        : format === "pptx"
          ? await createResultsPowerPoint(data)
          : await createResultsWorkbook(data);
    const fileName = `${slug(data.scope.label)}-pulse-survey-results.${format}`;
    const contentType =
      format === "pdf"
        ? "application/pdf"
        : format === "pptx"
          ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    await writeResultsAudit({
      surveyId,
      user: session.user,
      action: "download_results",
      scopeKey: data.scope.key,
      format,
      metadata: filters,
    });

    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof ResultsAccessError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Unable to export results", error);
    return Response.json({ error: "Unable to create the selected report." }, { status: 500 });
  }
}

function parseFilters(params: URLSearchParams): ResultsFilters {
  const scope = params.get("scope");
  return {
    scope:
      scope === "company" || scope === "organization" || scope === "direct" || scope === "leadership"
        ? scope
        : undefined,
    departmentIds: values(params, "department"),
    locations: values(params, "location"),
    divisions: values(params, "division"),
    teamIds: values(params, "team"),
    viewAsEmail: params.get("viewAs"),
  };
}

function values(params: URLSearchParams, key: string) {
  return params
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "results"
  );
}
