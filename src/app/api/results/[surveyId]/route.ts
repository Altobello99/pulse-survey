import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  buildResultsData,
  ResultsAccessError,
  type ResultsFilters,
} from "@/lib/results-analytics";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { surveyId } = await params;

  try {
    const filters = parseResultsFilters(request.nextUrl.searchParams);
    return Response.json({ data: await buildResultsData(surveyId, session.user, filters) });
  } catch (error) {
    if (error instanceof ResultsAccessError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Unable to load results", error);
    return Response.json({ error: "Unable to load survey results" }, { status: 500 });
  }
}

export function parseResultsFilters(searchParams: URLSearchParams): ResultsFilters {
  const scope = searchParams.get("scope");
  return {
    scope:
      scope === "company" ||
      scope === "organization" ||
      scope === "direct" ||
      scope === "leadership"
        ? scope
        : undefined,
    departmentIds: values(searchParams, "department"),
    locations: values(searchParams, "location"),
    divisions: values(searchParams, "division"),
    teamIds: values(searchParams, "team"),
    viewAsEmail: searchParams.get("viewAs"),
  };
}

function values(params: URLSearchParams, key: string) {
  return params
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}
