import {
  COMMENT_SENTIMENTS,
  parseCommentThemes,
  type CommentSentiment,
} from "@/lib/comment-analysis-types";

type CommentAnalysisSummaryInput = {
  sentiment: string;
  themes: string;
};

export type SurveySentimentSummary = {
  sentiment: CommentSentiment;
  score: number;
  themes: string;
  insights: string;
  summary: string;
  analyzedComments: number;
  distribution: Record<CommentSentiment, number>;
};

export function summarizeCommentAnalyses(
  analyses: CommentAnalysisSummaryInput[]
): SurveySentimentSummary | null {
  const distribution = Object.fromEntries(
    COMMENT_SENTIMENTS.map((sentiment) => [sentiment, 0])
  ) as Record<CommentSentiment, number>;
  const themeCounts = new Map<string, number>();

  for (const analysis of analyses) {
    if (!COMMENT_SENTIMENTS.includes(analysis.sentiment as CommentSentiment)) continue;
    distribution[analysis.sentiment as CommentSentiment] += 1;
    for (const theme of parseCommentThemes(analysis.themes)) {
      themeCounts.set(theme, (themeCounts.get(theme) || 0) + 1);
    }
  }

  const analyzedComments = Object.values(distribution).reduce(
    (total, count) => total + count,
    0
  );
  if (analyzedComments === 0) return null;

  const score = round(
    (distribution.positive - distribution.negative) / analyzedComments,
    2
  );
  const sentiment = overallSentiment(distribution, score);
  const themes = [...themeCounts.entries()]
    .filter(([theme]) => theme !== "Other")
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([theme]) => theme);
  const percentages = percentageDistribution(distribution, analyzedComments);

  const insights = themes.length
    ? [`Most common themes: ${themes.slice(0, 3).join(", ")}.`]
    : ["No recurring comment theme has emerged yet."];

  return {
    sentiment,
    score,
    themes: JSON.stringify(themes),
    insights: JSON.stringify(insights),
    summary: `Based on ${analyzedComments} analyzed anonymous comments: ${percentages.positive}% positive, ${percentages.neutral}% neutral, ${percentages.mixed}% mixed, and ${percentages.negative}% negative.`,
    analyzedComments,
    distribution,
  };
}

function overallSentiment(
  distribution: Record<CommentSentiment, number>,
  score: number
): CommentSentiment {
  if (score >= 0.1) return "positive";
  if (score <= -0.1) return "negative";

  const directionalComments = distribution.positive + distribution.negative;
  if (
    distribution.mixed > 0 &&
    distribution.mixed >= directionalComments &&
    distribution.mixed > distribution.neutral
  ) {
    return "mixed";
  }
  return "neutral";
}

function round(value: number, places: number) {
  const multiplier = 10 ** places;
  return Math.round(value * multiplier) / multiplier;
}

function percentageDistribution(
  distribution: Record<CommentSentiment, number>,
  total: number
) {
  const percentages = COMMENT_SENTIMENTS.map((sentiment, index) => {
    const exact = (distribution[sentiment] / total) * 100;
    return {
      sentiment,
      index,
      value: Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });
  let pointsRemaining =
    100 - percentages.reduce((sum, percentage) => sum + percentage.value, 0);

  for (const percentage of [...percentages].sort(
    (left, right) => right.remainder - left.remainder || left.index - right.index
  )) {
    if (pointsRemaining === 0) break;
    percentage.value += 1;
    pointsRemaining -= 1;
  }

  return Object.fromEntries(
    percentages.map(({ sentiment, value }) => [sentiment, value])
  ) as Record<CommentSentiment, number>;
}
