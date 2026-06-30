export const REPORT_DOWNLOADS = [
  {
    type: "executive-summary",
    label: "Executive Summary",
    description: "Cover sheet, top metrics, participation, sentiment, and chart data.",
  },
  {
    type: "participation",
    label: "Participation Report",
    description: "Completion and response rates by company, department, team, and location.",
  },
  {
    type: "question-results",
    label: "Question-by-Question Results",
    description: "Ratings, distributions, choices, and response totals for each question.",
  },
  {
    type: "department-breakdown",
    label: "Department Breakdown",
    description: "Department-level results with anonymity suppression under 3 responses.",
  },
  {
    type: "team-location-breakdown",
    label: "Team and Location Breakdown",
    description: "Team and location reports with chart-ready tables and suppression rules.",
  },
  {
    type: "manager-scoped",
    label: "Manager-Scoped Report",
    description: "Manager-level participation and outcomes where manager mapping exists.",
  },
  {
    type: "comments-themes",
    label: "Anonymous Comments and Themes",
    description: "Admin-only raw comments plus grouped AI themes when analysis is available.",
  },
  {
    type: "completion-tracker",
    label: "Completion Tracker",
    description: "Employee-level completion status plus completion counts by group.",
  },
  {
    type: "non-completion",
    label: "Non-Completion List",
    description: "Employees who have not completed the survey for reminder follow-up.",
  },
] as const;

export type ReportDownloadType = (typeof REPORT_DOWNLOADS)[number]["type"];
