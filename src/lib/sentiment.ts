import anthropic from "./anthropic";

interface SentimentResult {
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  score: number;
  themes: string[];
  insights: string[];
  summary: string;
}

export async function analyzeSentiment(
  surveyTitle: string,
  questionText: string,
  responses: string[]
): Promise<SentimentResult> {
  const numberedResponses = responses
    .map((r, i) => `${i + 1}. "${r}"`)
    .join("\n");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    temperature: 0,
    system:
      "You are an expert organizational psychologist analyzing employee survey responses. Always respond with valid JSON only, no markdown.",
    messages: [
      {
        role: "user",
        content: `Analyze these anonymous employee survey responses and provide:
1. Overall sentiment: "positive", "neutral", "negative", or "mixed"
2. Sentiment score: a number from -1.0 (very negative) to 1.0 (very positive)
3. Key themes: an array of 3-7 recurring themes
4. Actionable insights: an array of 3-5 specific, constructive recommendations
5. Summary: a 2-3 sentence overview

Respond in JSON format with keys: sentiment, score, themes, insights, summary.

Survey: "${surveyTitle}"
Question: "${questionText}"
Responses:
${numberedResponses}`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  try {
    return JSON.parse(text) as SentimentResult;
  } catch {
    return {
      sentiment: "neutral",
      score: 0,
      themes: ["unable to parse"],
      insights: ["Analysis could not be completed"],
      summary: "Sentiment analysis encountered an error during processing.",
    };
  }
}
