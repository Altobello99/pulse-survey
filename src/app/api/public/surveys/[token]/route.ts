function publicSurveysDisabled() {
  return Response.json(
    {
      error:
        "Public survey links are disabled. Please sign in with your Clutch Google account to complete this survey.",
    },
    { status: 404 }
  );
}

export async function GET() {
  return publicSurveysDisabled();
}

export async function POST() {
  return publicSurveysDisabled();
}
