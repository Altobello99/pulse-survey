export const COMMENT_SENTIMENTS = ["positive", "neutral", "negative", "mixed"] as const;
export const COMMENT_BASE_SEVERITIES = ["critical", "high", "medium", "low"] as const;
export const COMMENT_SEVERITIES = [
  "critical",
  "high",
  "medium",
  "low",
  "needs_review",
] as const;

export const COMMENT_THEMES = [
  "Leadership",
  "Communication",
  "Safety",
  "Culture",
  "Workload",
  "Career Growth",
  "Compensation & Benefits",
  "Tools & Processes",
  "Facilities",
  "Customer Experience",
  "Harassment & Discrimination",
  "Legal & Compliance",
  "Fraud & Security",
  "Other",
] as const;

export const COMMENT_CONFIDENCE_THRESHOLD = 0.75;

export type CommentSentiment = (typeof COMMENT_SENTIMENTS)[number];
export type CommentBaseSeverity = (typeof COMMENT_BASE_SEVERITIES)[number];
export type CommentSeverity = (typeof COMMENT_SEVERITIES)[number];
export type CommentTheme = (typeof COMMENT_THEMES)[number];

export type SerializedCommentAnalysis = {
  sentiment: CommentSentiment;
  severity: CommentSeverity;
  suggestedSeverity: CommentBaseSeverity;
  themes: string[];
  confidence: number;
  reason: string;
  model: string;
  analyzedAt: string;
};

export const COMMENT_SEVERITY_RANK: Record<CommentSeverity | "pending", number> = {
  critical: 0,
  high: 1,
  needs_review: 2,
  medium: 3,
  low: 4,
  pending: 5,
};

export function parseCommentThemes(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((theme): theme is string => typeof theme === "string")
      : [];
  } catch {
    return [];
  }
}
