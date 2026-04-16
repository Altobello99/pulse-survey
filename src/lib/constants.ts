export const COLORS = {
  primary: "#0d9488",
  secondary: "#2563eb",
  positive: "#10b981",
  neutral: "#f59e0b",
  negative: "#ef4444",
  chartPalette: ["#0d9488", "#2563eb", "#8b5cf6", "#ec4899", "#f97316"],
};

// Minimum responses required before team-level results are shown.
// At 1000+ employees, 5 is safe; raise to 10 if teams are large.
export const ANONYMITY_THRESHOLD = 5;

// Minimum department-level responses before sentiment/themes are shown per department.
export const DEPT_ANONYMITY_THRESHOLD = 3;

export const SURVEY_STATUSES = ["draft", "active", "closed"] as const;
export const QUESTION_TYPES = ["rating", "multiple_choice", "free_text"] as const;
export const ROLES = ["admin", "manager", "employee"] as const;
export const FEEDBACK_CATEGORIES = ["suggestion", "concern", "praise", "other"] as const;
export const ACTION_STATUSES = ["open", "in_progress", "completed"] as const;
export const PRIORITIES = ["low", "medium", "high"] as const;
