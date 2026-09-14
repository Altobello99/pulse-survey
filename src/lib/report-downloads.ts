export const REPORT_DOWNLOADS = [
  {
    type: "department-site",
    label: "Department by Site",
    description: "Production totals by site plus every individual department and site combination.",
    featured: true,
  },
  {
    type: "leader-breakdown",
    label: "Breakdown by Leader",
    description: "BambooHR leader groups with participation, overall ratings, and question-level averages.",
    featured: true,
  },
  {
    type: "company-question-averages",
    label: "Company Question Averages",
    description: "A concise list of actual averages and scales for every scored survey question.",
    featured: true,
  },
  {
    type: "executive-summary",
    label: "Executive Summary",
    description: "Cover sheet, top metrics, participation, sentiment, and chart data.",
    featured: false,
  },
  {
    type: "participation",
    label: "Participation Report",
    description: "Completion and response rates by company, department, team, and location.",
    featured: false,
  },
  {
    type: "question-results",
    label: "Question-by-Question Results",
    description: "Ratings, distributions, choices, and response totals for each question.",
    featured: false,
  },
  {
    type: "department-breakdown",
    label: "Department Breakdown",
    description: "Department-level results with anonymity suppression under 3 responses.",
    featured: false,
  },
  {
    type: "team-location-breakdown",
    label: "Team and Location Breakdown",
    description: "Team and location reports with chart-ready tables and suppression rules.",
    featured: false,
  },
  {
    type: "manager-scoped",
    label: "Manager-Scoped Report",
    description: "Manager-level participation and outcomes where manager mapping exists.",
    featured: false,
  },
  {
    type: "comments-themes",
    label: "AI Comment Triage & Anonymous Comments",
    description: "Admin-only comments with severity, sentiment, themes, confidence, and grouped AI triage totals.",
    featured: false,
  },
  {
    type: "completion-tracker",
    label: "Completion Tracker",
    description: "Employee-level completion status plus completion counts by group.",
    featured: false,
  },
  {
    type: "non-completion",
    label: "Non-Completion List",
    description: "Employees who have not completed the survey for reminder follow-up.",
    featured: false,
  },
] as const;

export type ReportDownloadType = (typeof REPORT_DOWNLOADS)[number]["type"];
