import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getResultsCatalog, ResultsAccessError } from "@/lib/results-analytics";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return Response.json(
      { data: await getResultsCatalog(session.user) },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  } catch (error) {
    if (error instanceof ResultsAccessError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Unable to load results catalog", error);
    return Response.json({ error: "Unable to load results" }, { status: 500 });
  }
}
