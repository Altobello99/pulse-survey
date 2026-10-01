import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import PptxGenJS from "pptxgenjs";
import XlsxPopulate, { type Sheet } from "xlsx-populate";
import JSZip from "jszip";

const COLORS = {
  navy: "0F172A",
  teal: "0D9488",
  tealDark: "0F766E",
  tealLight: "CCFBF1",
  blue: "2563EB",
  green: "10B981",
  amber: "F59E0B",
  red: "EF4444",
  slate: "475569",
  muted: "94A3B8",
  line: "E2E8F0",
  panel: "F8FAFC",
  white: "FFFFFF",
};

export type ResultsExportData = {
  locked: boolean;
  survey: { title: string; startDate: string; endDate: string };
  scope: {
    label: string;
    key: string;
    type: "company" | "organization" | "direct" | "leadership";
  };
  metrics: {
    eligibleEmployees: number;
    completions: number;
    participationRate: number;
    averageRating: number | null;
    favorablePercent: number | null;
    friendYesPercent: number | null;
    commentCount: number | null;
    enps: number | null;
  };
  benchmarks: {
    company: { participationRate: number; averageRating: number | null; favorablePercent: number | null };
    parent: { participationRate: number; averageRating: number | null; favorablePercent: number | null } | null;
  };
  questions: Array<{
    order: number;
    section: string | null;
    question: string;
    responses: number | null;
    average: number | null;
    scaleMax: number;
    favorablePercent: number | null;
    isEnps: boolean;
  }>;
  hierarchy: Array<{
    label: string;
    type: string;
    eligibleEmployees: number;
    completions: number;
    participationRate: number;
    averageRating: number | null;
    favorablePercent: number | null;
    suppressed: boolean;
  }>;
  themes: Array<{
    theme: string;
    mentions: number;
    critical: number;
    high: number;
    negative: number;
  }>;
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
    mixed: number;
    total: number;
  } | null;
  comments: Array<{
    text: string;
    question: string;
    department: string;
    location: string;
    sentiment: string;
    severity: string;
    themes: string[];
  }>;
  insights: Array<{
    kind: string;
    title: string;
    body: string;
    severity: string;
    status: string;
  }>;
};

export async function createResultsWorkbook(data: ResultsExportData) {
  const workbook = await XlsxPopulate.fromBlankAsync();
  const dashboard = workbook.sheet(0)!;
  dashboard.name("Dashboard");
  buildDashboardSheet(dashboard, data);

  const questions = workbook.addSheet("Question Scores");
  writeTableSheet(
    questions,
    "Question Scores",
    ["#", "Section", "Question", "Responses", "Average", "Scale", "Favourable"],
    data.questions.map((question) => [
      question.order,
      question.section || "General",
      question.question,
      question.responses ?? "Protected",
      question.average ?? "Protected",
      `out of ${question.scaleMax}`,
      question.favorablePercent === null ? "N/A" : `${question.favorablePercent}%`,
    ]),
    [7, 24, 66, 14, 14, 12, 14]
  );

  const hierarchy = workbook.addSheet("Hierarchy Comparison");
  writeTableSheet(
    hierarchy,
    "Department and Location Comparison",
    ["Team result", "Eligible", "Completed", "Participation", "Average", "Favourable", "Privacy"],
    data.hierarchy.map((row) => [
      row.label,
      row.eligibleEmployees,
      row.completions,
      `${row.participationRate}%`,
      row.averageRating ?? "Protected",
      row.favorablePercent === null ? "Protected" : `${row.favorablePercent}%`,
      row.suppressed ? "Fewer than 3 completions" : "Reportable",
    ]),
    [44, 12, 14, 16, 14, 14, 24]
  );

  const themes = workbook.addSheet("Themes");
  writeTableSheet(
    themes,
    "Comment Themes Ranked by Severity and Frequency",
    ["Rank", "Theme", "Mentions", "Critical", "High", "Negative"],
    data.themes.map((theme, index) => [
      index + 1,
      theme.theme,
      theme.mentions,
      theme.critical,
      theme.high,
      theme.negative,
    ]),
    [9, 36, 14, 14, 12, 14]
  );

  const comments = workbook.addSheet("Anonymous Comments");
  writeTableSheet(
    comments,
    "Authorised Anonymous Comments",
    ["Department", "Location", "Sentiment", "Severity", "Themes", "Question", "Comment"],
    data.comments.map((comment) => [
      comment.department,
      comment.location,
      comment.sentiment,
      comment.severity,
      comment.themes.join(", "),
      comment.question,
      comment.text,
    ]),
    [28, 28, 14, 14, 32, 62, 90]
  );

  const aggregates = workbook.addSheet("Raw Aggregates");
  writeTableSheet(
    aggregates,
    "Anonymous Aggregate Data",
    [
      "Metric",
      data.scope.type === "company" ? "Company-Wide View" : "Direct Reports",
      "Company Benchmark",
      "Department reporting group",
    ],
    [
      ["Eligible employees", data.metrics.eligibleEmployees, "", ""],
      ["Completed", data.metrics.completions, "", ""],
      ["Participation", `${data.metrics.participationRate}%`, `${data.benchmarks.company.participationRate}%`, data.benchmarks.parent ? `${data.benchmarks.parent.participationRate}%` : "N/A"],
      ["Average Rating", displayScore(data.metrics.averageRating), displayScore(data.benchmarks.company.averageRating), data.benchmarks.parent ? displayScore(data.benchmarks.parent.averageRating) : "N/A"],
      ["Favourable", displayPercent(data.metrics.favorablePercent), displayPercent(data.benchmarks.company.favorablePercent), data.benchmarks.parent ? displayPercent(data.benchmarks.parent.favorablePercent) : "N/A"],
      ["Company-Wide eNPS", data.metrics.enps ?? "N/A", data.metrics.enps ?? "N/A", "N/A"],
      ["Best Friend at Work", displayPercent(data.metrics.friendYesPercent), "", ""],
      ["Written Comments", data.metrics.commentCount ?? "Protected", "", ""],
    ],
    [34, 22, 22, 22]
  );

  workbook.activeSheet(dashboard);
  return normalizeWorkbookStyles(toBuffer(await workbook.outputAsync("nodebuffer")));
}

export async function createResultsPowerPoint(data: ResultsExportData) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Employee Pulse Survey";
  pptx.subject = "Anonymous pulse survey results";
  pptx.title = `${data.survey.title} - ${data.scope.label}`;
  pptx.company = "Employee Pulse Survey";
  pptx.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos",
  };

  addSummarySlide(pptx, data);
  addQuestionSlide(pptx, data);
  addHierarchySlide(pptx, data);
  addThemesSlide(pptx, data);
  addInsightsSlide(pptx, data);
  addCommentSlides(pptx, data);

  const output = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(output as Buffer);
}

export async function createResultsPdf(data: ResultsExportData) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };

  addPdfSummary(pdf, data, fonts);
  addPdfQuestions(pdf, data, fonts);
  addPdfHierarchy(pdf, data, fonts);
  addPdfThemes(pdf, data, fonts);
  addPdfInsights(pdf, data, fonts);
  addPdfComments(pdf, data, fonts);

  return Buffer.from(await pdf.save());
}

function buildDashboardSheet(sheet: Sheet, data: ResultsExportData) {
  for (let column = 1; column <= 12; column += 1) sheet.column(column).width(13);
  sheet.column(1).width(3);
  sheet.column(12).width(3);
  sheet.range("B2:K3").merged(true).value([[`${data.survey.title}: Results Dashboard`]]).style({
    fill: COLORS.navy,
    fontColor: COLORS.white,
    fontSize: 22,
    bold: true,
    verticalAlignment: "center",
  });
  sheet.range("B4:K4").merged(true).value([[`${data.scope.label} | ${dateRange(data.survey)}`]]).style({
    fontColor: COLORS.slate,
    fontSize: 11,
  });

  const cards = [
    ["Participation", `${data.metrics.participationRate}%`, `${data.metrics.completions}/${data.metrics.eligibleEmployees} completed`],
    ["Average Rating", displayScore(data.metrics.averageRating), "out of 5"],
    ["Favourable", displayPercent(data.metrics.favorablePercent), "ratings of 4 or 5"],
    ["Company eNPS", data.metrics.enps ?? "N/A", "company-wide benchmark"],
  ];
  cards.forEach((card, index) => {
    const start = 2 + index * 2 + (index >= 2 ? 1 : 0);
    const end = start + 1;
    sheet.range(`${col(start)}6:${col(end)}9`).style({
      fill: index === 3 ? COLORS.tealLight : COLORS.panel,
      border: { color: COLORS.line, style: "thin" },
      verticalAlignment: "center",
    });
    sheet.range(`${col(start)}6:${col(end)}6`).merged(true).value([[card[0]]]).style({ fontColor: COLORS.slate, bold: true });
    sheet.range(`${col(start)}7:${col(end)}8`).merged(true).value([[card[1]]]).style({ fontColor: index === 3 ? COLORS.tealDark : COLORS.navy, fontSize: 24, bold: true, horizontalAlignment: "center" });
    sheet.range(`${col(start)}9:${col(end)}9`).merged(true).value([[card[2]]]).style({ fontColor: COLORS.muted, fontSize: 9, horizontalAlignment: "center" });
  });

  sheet.range("B12:F12").merged(true).value([["Highest-Scoring Questions"]]).style(sectionStyle(COLORS.tealDark));
  sheet.range("G12:K12").merged(true).value([["Areas to Watch"]]).style(sectionStyle(COLORS.amber));
  const standard = data.questions.filter((question) => !question.isEnps && question.average !== null);
  const strongest = [...standard].sort((a, b) => (b.average || 0) - (a.average || 0)).slice(0, 3);
  const weakest = [...standard].sort((a, b) => (a.average || 0) - (b.average || 0)).slice(0, 3);
  writeQuestionBlocks(sheet, strongest, 14, 2, 6, COLORS.teal);
  writeQuestionBlocks(sheet, weakest, 14, 7, 11, COLORS.amber);

  sheet.range("B27:K27").merged(true).value([["AI-Assisted Highlights and Areas to Watch"]]).style(sectionStyle(COLORS.navy));
  data.insights.slice(0, 4).forEach((insight, index) => {
    const row = 29 + index * 3;
    sheet.range(`B${row}:K${row}`).merged(true).value([[insight.title]]).style({ bold: true, fontColor: insight.severity === "critical" || insight.severity === "high" ? COLORS.red : COLORS.navy });
    sheet.range(`B${row + 1}:K${row + 2}`).merged(true).value([[insight.body]]).style({ wrapText: true, verticalAlignment: "top", fontColor: COLORS.slate });
  });
}

function writeQuestionBlocks(
  sheet: Sheet,
  questions: ResultsExportData["questions"],
  startRow: number,
  startColumn: number,
  endColumn: number,
  colour: string
) {
  questions.forEach((question, index) => {
    const row = startRow + index * 4;
    sheet.range(`${col(startColumn)}${row}:${col(endColumn)}${row}`).merged(true).value([[`${question.average} / 5  |  ${question.favorablePercent}% favourable`]]).style({ bold: true, fontColor: colour, fontSize: 13 });
    sheet.range(`${col(startColumn)}${row + 1}:${col(endColumn)}${row + 3}`).merged(true).value([[question.question]]).style({ wrapText: true, verticalAlignment: "top", fontColor: COLORS.navy });
  });
}

function writeTableSheet(
  sheet: Sheet,
  title: string,
  headers: string[],
  rows: unknown[][],
  widths: number[]
) {
  widths.forEach((width, index) => sheet.column(index + 1).width(width));
  sheet.range(`A1:${col(headers.length)}2`).merged(true).value([[title]]).style({ fill: COLORS.navy, fontColor: COLORS.white, bold: true, fontSize: 18, verticalAlignment: "center" });
  sheet.range(`A4:${col(headers.length)}4`).value([headers]).style({ fill: COLORS.tealDark, fontColor: COLORS.white, bold: true, wrapText: true });
  if (rows.length) {
    sheet.range(`A5:${col(headers.length)}${rows.length + 4}`).value(rows).style({ border: { color: COLORS.line, style: "thin" }, verticalAlignment: "top", wrapText: true });
    for (let row = 5; row <= rows.length + 4; row += 2) {
      sheet.range(`A${row}:${col(headers.length)}${row}`).style({ fill: COLORS.panel });
    }
  } else {
    sheet.range(`A5:${col(headers.length)}6`).merged(true).value([["No authorised data is available for this view."]]).style({ fontColor: COLORS.muted, italic: true });
  }
}

function addSummarySlide(pptx: PptxGenJS, data: ResultsExportData) {
  const slide = pptx.addSlide();
  addSlideFrame(slide, "Pulse Survey: Executive Summary", `${data.scope.label} | ${dateRange(data.survey)}`);
  const recommendation = data.questions.find((question) => question.isEnps);
  const cards = [
    ["Participation", `${data.metrics.participationRate}%`, `${data.metrics.completions} of ${data.metrics.eligibleEmployees} completed`],
    ["Average Rating", displayScore(data.metrics.averageRating), "out of 5"],
    ["Favourable", displayPercent(data.metrics.favorablePercent), "ratings of 4 or 5"],
    ["Company eNPS", String(data.metrics.enps ?? "N/A"), recommendation?.average === null || recommendation?.average === undefined ? "company-wide benchmark" : `${recommendation.average} / 10 average rating`],
  ];
  cards.forEach((card, index) => addPptCard(slide, 0.45 + index * 3.18, 1.65, 2.82, 1.2, card[0], card[1], card[2]));

  const standard = data.questions.filter((question) => !question.isEnps && question.average !== null);
  const strongest = [...standard].sort((a, b) => (b.average || 0) - (a.average || 0)).slice(0, 3);
  const weakest = [...standard].sort((a, b) => (a.average || 0) - (b.average || 0)).slice(0, 3);
  addQuestionList(slide, 0.45, 3.35, 6.05, "Highest-Scoring Questions", strongest, COLORS.tealDark);
  addQuestionList(slide, 6.82, 3.35, 6.05, "Areas to Watch", weakest, COLORS.amber);
}

function addQuestionSlide(pptx: PptxGenJS, data: ResultsExportData) {
  const slide = pptx.addSlide();
  addSlideFrame(slide, "Question Scores", "Average score and favourable response rate");
  const questions = data.questions.filter((question) => !question.isEnps).slice(0, 10);
  questions.forEach((question, index) => {
    const column = index < 5 ? 0 : 1;
    const row = index % 5;
    const x = 0.55 + column * 6.35;
    const y = 1.4 + row * 1.08;
    slide.addText(`${question.order}. ${question.question}`, { x, y, w: 4.75, h: 0.36, fontFace: "Aptos", fontSize: 12, bold: true, color: COLORS.navy, margin: 0, breakLine: false, fit: "shrink" });
    slide.addText(question.average === null ? "Protected" : `${question.average} / 5`, { x: x + 4.87, y, w: 0.85, h: 0.3, fontSize: 14, bold: true, color: scoreColour(question.average), align: "right", margin: 0 });
    const width = question.average === null ? 0 : ((question.average || 0) / 5) * 5.72;
    slide.addShape(pptx.ShapeType.rect, { x, y: y + 0.49, w: 5.72, h: 0.12, line: { color: COLORS.line, transparency: 100 }, fill: { color: COLORS.line } });
    if (width) slide.addShape(pptx.ShapeType.rect, { x, y: y + 0.49, w: width, h: 0.12, line: { color: COLORS.teal, transparency: 100 }, fill: { color: COLORS.teal } });
    slide.addText(question.favorablePercent === null ? "" : `${question.favorablePercent}% favourable`, { x, y: y + 0.66, w: 5.72, h: 0.2, fontSize: 9, color: COLORS.slate, margin: 0 });
  });
  const recommendation = data.questions.find((question) => question.isEnps);
  if (recommendation) {
    slide.addText("Recommendation question", { x: 0.55, y: 6.92, w: 2.1, h: 0.18, fontSize: 9, bold: true, color: COLORS.slate, margin: 0 });
    slide.addText(`${recommendation.average ?? "Protected"} / 10 average | Company eNPS ${data.metrics.enps ?? "N/A"}`, { x: 2.55, y: 6.9, w: 5.4, h: 0.2, fontSize: 9.5, color: COLORS.blue, margin: 0 });
  }
}

function addHierarchySlide(pptx: PptxGenJS, data: ResultsExportData) {
  const slide = pptx.addSlide();
  addSlideFrame(slide, "Department and Location Comparison", "Only groups with at least three completions display scores");
  const rows = data.hierarchy.slice(0, 12);
  rows.forEach((row, index) => {
    const y = 1.35 + index * 0.46;
    if (index % 2 === 0) slide.addShape(pptx.ShapeType.rect, { x: 0.45, y: y - 0.04, w: 12.4, h: 0.42, line: { transparency: 100 }, fill: { color: COLORS.panel } });
    slide.addText(row.label, { x: 0.58, y, w: 5.1, h: 0.24, fontSize: 11, bold: row.type === "combined", color: COLORS.navy, margin: 0, fit: "shrink" });
    slide.addText(`${row.completions}/${row.eligibleEmployees}`, { x: 5.85, y, w: 1.1, h: 0.24, fontSize: 11, color: COLORS.slate, align: "right", margin: 0 });
    slide.addText(`${row.participationRate}%`, { x: 7.1, y, w: 0.8, h: 0.24, fontSize: 11, color: COLORS.tealDark, bold: true, align: "right", margin: 0 });
    slide.addText(row.averageRating === null ? "Protected" : `${row.averageRating} / 5`, { x: 8.25, y, w: 1.25, h: 0.24, fontSize: 11, color: scoreColour(row.averageRating), bold: true, align: "right", margin: 0 });
    slide.addText(row.favorablePercent === null ? "" : `${row.favorablePercent}% favourable`, { x: 9.75, y, w: 1.35, h: 0.24, fontSize: 10, color: COLORS.slate, align: "right", margin: 0 });
  });
}

function addThemesSlide(pptx: PptxGenJS, data: ResultsExportData) {
  const slide = pptx.addSlide();
  addSlideFrame(slide, "Themes and Sentiment", "Themes rank by severity first, then frequency");
  slide.addText("Top Themes", { x: 0.55, y: 1.25, w: 5.7, h: 0.35, fontSize: 17, bold: true, color: COLORS.navy, margin: 0 });
  const maxMentions = Math.max(1, ...data.themes.map((theme) => theme.mentions));
  data.themes.slice(0, 8).forEach((theme, index) => {
    const y = 1.78 + index * 0.58;
    slide.addText(theme.theme, { x: 0.58, y, w: 2.55, h: 0.25, fontSize: 11, color: COLORS.navy, margin: 0, fit: "shrink" });
    slide.addShape(pptx.ShapeType.rect, { x: 3.12, y: y + 0.02, w: 2.6, h: 0.18, line: { transparency: 100 }, fill: { color: COLORS.line } });
    slide.addShape(pptx.ShapeType.rect, { x: 3.12, y: y + 0.02, w: 2.6 * (theme.mentions / maxMentions), h: 0.18, line: { transparency: 100 }, fill: { color: theme.critical || theme.high ? COLORS.red : COLORS.teal } });
    slide.addText(String(theme.mentions), { x: 5.82, y, w: 0.35, h: 0.22, fontSize: 10, bold: true, color: COLORS.slate, align: "right", margin: 0 });
  });
  slide.addText("Sentiment", { x: 7.0, y: 1.25, w: 5.6, h: 0.35, fontSize: 17, bold: true, color: COLORS.navy, margin: 0 });
  const sentiment = data.sentiment;
  const sentimentRows = [
    ["Positive", sentiment?.positive || 0, COLORS.green],
    ["Neutral", sentiment?.neutral || 0, COLORS.blue],
    ["Mixed", sentiment?.mixed || 0, COLORS.amber],
    ["Negative", sentiment?.negative || 0, COLORS.red],
  ] as const;
  sentimentRows.forEach(([label, count, colour], index) => addPptCard(slide, 7 + (index % 2) * 2.85, 1.85 + Math.floor(index / 2) * 1.55, 2.55, 1.2, label, String(count), "comments", colour));
}

function addInsightsSlide(pptx: PptxGenJS, data: ResultsExportData) {
  const slide = pptx.addSlide();
  addSlideFrame(slide, "Highlights and Areas to Watch", "AI-assisted synthesis reviewed through the Results release process");
  const insights = data.insights.slice(0, 5);
  insights.forEach((insight, index) => {
    const y = 1.25 + index * 1.06;
    const colour = insight.severity === "critical" || insight.severity === "high" ? COLORS.red : insight.severity === "positive" ? COLORS.teal : COLORS.amber;
    slide.addShape(pptx.ShapeType.roundRect, { x: 0.55, y, w: 12.2, h: 0.86, rectRadius: 0.04, line: { color: COLORS.line }, fill: { color: COLORS.panel } });
    slide.addShape(pptx.ShapeType.ellipse, { x: 0.78, y: y + 0.23, w: 0.25, h: 0.25, line: { color: colour }, fill: { color: colour } });
    slide.addText(insight.title, { x: 1.2, y: y + 0.11, w: 10.9, h: 0.25, fontSize: 13, bold: true, color: COLORS.navy, margin: 0, fit: "shrink" });
    slide.addText(insight.body, { x: 1.2, y: y + 0.4, w: 10.9, h: 0.31, fontSize: 10.5, color: COLORS.slate, margin: 0, fit: "shrink" });
  });
}

function addCommentSlides(pptx: PptxGenJS, data: ResultsExportData) {
  const priorityComments = data.comments.slice(0, 24);
  for (let offset = 0; offset < priorityComments.length; offset += 4) {
    const slide = pptx.addSlide();
    addSlideFrame(slide, "Priority Anonymous Comments", `${data.scope.label} | Showing ${offset + 1}-${Math.min(offset + 4, priorityComments.length)} of ${data.comments.length}; full authorised comments are in Excel`);
    priorityComments.slice(offset, offset + 4).forEach((comment, index) => {
      const y = 1.22 + index * 1.38;
      slide.addShape(pptx.ShapeType.roundRect, { x: 0.55, y, w: 12.2, h: 1.14, rectRadius: 0.03, line: { color: COLORS.line }, fill: { color: COLORS.white } });
      slide.addText(`${comment.department} | ${shortLabel(comment.location)} | ${comment.severity}`, { x: 0.75, y: y + 0.09, w: 11.7, h: 0.18, fontSize: 9.5, bold: true, color: comment.severity === "critical" || comment.severity === "high" ? COLORS.red : COLORS.tealDark, margin: 0 });
      slide.addText(truncate(comment.text.replace(/\s+/g, " "), 560), { x: 0.75, y: y + 0.34, w: 11.65, h: 0.63, fontSize: 10.5, color: COLORS.navy, margin: 0.01, fit: "shrink", valign: "top", breakLine: false });
    });
  }
}

function addSlideFrame(slide: PptxGenJS.Slide, title: string, subtitle: string) {
  slide.background = { color: COLORS.white };
  slide.addShape("rect", { x: 0, y: 0, w: 0.16, h: 7.5, line: { transparency: 100 }, fill: { color: COLORS.teal } });
  slide.addText(title, { x: 0.45, y: 0.35, w: 12.3, h: 0.48, fontFace: "Aptos Display", fontSize: 26, bold: true, color: COLORS.navy, margin: 0 });
  slide.addText(subtitle, { x: 0.47, y: 0.92, w: 12.0, h: 0.25, fontSize: 11.5, color: COLORS.slate, margin: 0 });
  slide.addText("Employee Pulse Survey", { x: 10.9, y: 7.12, w: 1.9, h: 0.18, fontSize: 8.5, color: COLORS.muted, align: "right", margin: 0 });
}

function addPptCard(slide: PptxGenJS.Slide, x: number, y: number, w: number, h: number, label: string, value: string, detail: string, colour = COLORS.teal) {
  slide.addShape("roundRect", { x, y, w, h, rectRadius: 0.04, line: { color: COLORS.line }, fill: { color: COLORS.panel } });
  slide.addText(label, { x: x + 0.18, y: y + 0.13, w: w - 0.36, h: 0.18, fontSize: 10.5, color: COLORS.slate, margin: 0 });
  slide.addText(value, { x: x + 0.18, y: y + 0.38, w: w - 0.36, h: 0.38, fontSize: 23, bold: true, color: colour, margin: 0 });
  slide.addText(detail, { x: x + 0.18, y: y + 0.87, w: w - 0.36, h: 0.17, fontSize: 8.5, color: COLORS.muted, margin: 0, fit: "shrink" });
}

function addQuestionList(slide: PptxGenJS.Slide, x: number, y: number, w: number, title: string, questions: ResultsExportData["questions"], colour: string) {
  slide.addText(title.toUpperCase(), { x, y, w, h: 0.28, fontSize: 14, bold: true, color: colour, margin: 0, charSpacing: 0 });
  questions.forEach((question, index) => {
    const itemY = y + 0.48 + index * 0.92;
    slide.addShape("roundRect", { x, y: itemY, w, h: 0.74, rectRadius: 0.03, line: { color: COLORS.line }, fill: { color: COLORS.panel } });
    slide.addShape("ellipse", { x: x + 0.16, y: itemY + 0.16, w: 0.42, h: 0.42, line: { color: colour }, fill: { color: colour } });
    slide.addText(String(question.average ?? ""), { x: x + 0.16, y: itemY + 0.25, w: 0.42, h: 0.12, fontSize: 10, bold: true, color: COLORS.white, align: "center", margin: 0 });
    slide.addText(question.question, { x: x + 0.72, y: itemY + 0.11, w: w - 0.9, h: 0.35, fontSize: 11, bold: true, color: COLORS.navy, margin: 0, fit: "shrink" });
    slide.addText(`${question.favorablePercent ?? 0}% favourable`, { x: x + 0.72, y: itemY + 0.5, w: w - 0.9, h: 0.13, fontSize: 8.5, color: COLORS.slate, margin: 0 });
  });
}

type PdfFonts = { regular: PDFFont; bold: PDFFont };

function addPdfSummary(pdf: PDFDocument, data: ResultsExportData, fonts: PdfFonts) {
  const page = newPdfPage(pdf);
  pdfHeader(page, fonts, "Pulse Survey: Executive Summary", `${data.scope.label} | ${dateRange(data.survey)}`);
  const recommendation = data.questions.find((question) => question.isEnps);
  const cards = [
    ["Participation", `${data.metrics.participationRate}%`, `${data.metrics.completions}/${data.metrics.eligibleEmployees} completed`],
    ["Average", displayScore(data.metrics.averageRating), "out of 5"],
    ["Favourable", displayPercent(data.metrics.favorablePercent), "ratings of 4 or 5"],
    ["Company eNPS", String(data.metrics.enps ?? "N/A"), recommendation?.average === null || recommendation?.average === undefined ? "company-wide" : `${recommendation.average}/10 average`],
  ];
  cards.forEach((card, index) => pdfCard(page, fonts, 42 + index * 225, 365, 205, 95, card[0], card[1], card[2]));
  const standard = data.questions.filter((question) => !question.isEnps && question.average !== null);
  pdfQuestionColumn(page, fonts, "Highest-Scoring Questions", [...standard].sort((a, b) => (b.average || 0) - (a.average || 0)).slice(0, 3), 42, 295, pdfRgb(COLORS.tealDark));
  pdfQuestionColumn(page, fonts, "Areas to Watch", [...standard].sort((a, b) => (a.average || 0) - (b.average || 0)).slice(0, 3), 505, 295, pdfRgb(COLORS.amber));
}

function addPdfQuestions(pdf: PDFDocument, data: ResultsExportData, fonts: PdfFonts) {
  const page = newPdfPage(pdf);
  pdfHeader(page, fonts, "Question Scores", "Average score and favourable response rate");
  data.questions.filter((question) => !question.isEnps).slice(0, 10).forEach((question, index) => {
    const column = index < 5 ? 0 : 1;
    const row = index % 5;
    const x = 42 + column * 460;
    const y = 425 - row * 77;
    drawWrapped(page, `${question.order}. ${question.question}`, x, y, 350, fonts.bold, 10.5, pdfRgb(COLORS.navy), 2);
    page.drawText(question.average === null ? "Protected" : `${question.average} / 5`, { x: x + 355, y, size: 12, font: fonts.bold, color: pdfRgb(scoreColour(question.average)) });
    page.drawRectangle({ x, y: y - 20, width: 410, height: 7, color: pdfRgb(COLORS.line) });
    if (question.average !== null) page.drawRectangle({ x, y: y - 20, width: 410 * (question.average / 5), height: 7, color: pdfRgb(COLORS.teal) });
  });
  const recommendation = data.questions.find((question) => question.isEnps);
  if (recommendation) {
    page.drawText(pdfText(`Recommendation question: ${recommendation.average ?? "Protected"}/10 average | Company eNPS ${data.metrics.enps ?? "N/A"}`), { x: 42, y: 24, size: 9, font: fonts.bold, color: pdfRgb(COLORS.blue) });
  }
}

function addPdfHierarchy(pdf: PDFDocument, data: ResultsExportData, fonts: PdfFonts) {
  const page = newPdfPage(pdf);
  pdfHeader(page, fonts, "Department and Location Comparison", "Scores display only with at least three completions");
  data.hierarchy.slice(0, 12).forEach((row, index) => {
    const y = 430 - index * 31;
    if (index % 2 === 0) page.drawRectangle({ x: 38, y: y - 8, width: 884, height: 27, color: pdfRgb(COLORS.panel) });
    page.drawText(pdfText(truncate(row.label, 58)), { x: 48, y, size: 9.5, font: row.type === "combined" ? fonts.bold : fonts.regular, color: pdfRgb(COLORS.navy) });
    page.drawText(`${row.completions}/${row.eligibleEmployees}`, { x: 520, y, size: 9.5, font: fonts.regular, color: pdfRgb(COLORS.slate) });
    page.drawText(`${row.participationRate}%`, { x: 630, y, size: 9.5, font: fonts.bold, color: pdfRgb(COLORS.tealDark) });
    page.drawText(row.averageRating === null ? "Protected" : `${row.averageRating} / 5`, { x: 720, y, size: 9.5, font: fonts.bold, color: pdfRgb(scoreColour(row.averageRating)) });
    page.drawText(row.favorablePercent === null ? "" : `${row.favorablePercent}% fav.`, { x: 830, y, size: 9.5, font: fonts.regular, color: pdfRgb(COLORS.slate) });
  });
}

function addPdfThemes(pdf: PDFDocument, data: ResultsExportData, fonts: PdfFonts) {
  const page = newPdfPage(pdf);
  pdfHeader(page, fonts, "Themes and Sentiment", "Themes rank by severity first, then frequency");
  const max = Math.max(1, ...data.themes.map((theme) => theme.mentions));
  data.themes.slice(0, 8).forEach((theme, index) => {
    const y = 420 - index * 43;
    page.drawText(pdfText(truncate(theme.theme, 28)), { x: 48, y, size: 10, font: fonts.bold, color: pdfRgb(COLORS.navy) });
    page.drawRectangle({ x: 220, y: y + 1, width: 270, height: 9, color: pdfRgb(COLORS.line) });
    page.drawRectangle({ x: 220, y: y + 1, width: 270 * (theme.mentions / max), height: 9, color: pdfRgb(theme.critical || theme.high ? COLORS.red : COLORS.teal) });
    page.drawText(String(theme.mentions), { x: 505, y, size: 10, font: fonts.bold, color: pdfRgb(COLORS.slate) });
  });
  const sentiment = data.sentiment;
  const rows = [["Positive", sentiment?.positive || 0, COLORS.green], ["Neutral", sentiment?.neutral || 0, COLORS.blue], ["Mixed", sentiment?.mixed || 0, COLORS.amber], ["Negative", sentiment?.negative || 0, COLORS.red]] as const;
  rows.forEach(([label, value, colour], index) => pdfCard(page, fonts, 575 + (index % 2) * 165, 355 - Math.floor(index / 2) * 125, 145, 90, label, String(value), "comments", colour));
}

function addPdfInsights(pdf: PDFDocument, data: ResultsExportData, fonts: PdfFonts) {
  const page = newPdfPage(pdf);
  pdfHeader(page, fonts, "Highlights and Areas to Watch", "AI-assisted synthesis reviewed through the Results release process");
  data.insights.slice(0, 5).forEach((insight, index) => {
    const y = 425 - index * 78;
    page.drawRectangle({ x: 42, y: y - 48, width: 876, height: 62, color: pdfRgb(COLORS.panel), borderColor: pdfRgb(COLORS.line), borderWidth: 1 });
    page.drawCircle({ x: 60, y: y - 8, size: 6, color: pdfRgb(insight.severity === "critical" || insight.severity === "high" ? COLORS.red : insight.severity === "positive" ? COLORS.teal : COLORS.amber) });
    page.drawText(pdfText(truncate(insight.title, 100)), { x: 77, y, size: 11, font: fonts.bold, color: pdfRgb(COLORS.navy) });
    drawWrapped(page, insight.body, 77, y - 20, 810, fonts.regular, 9.5, pdfRgb(COLORS.slate), 2);
  });
}

function addPdfComments(pdf: PDFDocument, data: ResultsExportData, fonts: PdfFonts) {
  const priorityComments = data.comments.slice(0, 24);
  for (let offset = 0; offset < priorityComments.length; offset += 4) {
    const page = newPdfPage(pdf);
    pdfHeader(page, fonts, "Priority Anonymous Comments", `${data.scope.label} | Showing ${offset + 1}-${Math.min(offset + 4, priorityComments.length)} of ${data.comments.length}; complete appendix in Excel`);
    priorityComments.slice(offset, offset + 4).forEach((comment, index) => {
      const y = 420 - index * 101;
      page.drawRectangle({ x: 42, y: y - 70, width: 876, height: 84, color: pdfRgb(COLORS.white), borderColor: pdfRgb(COLORS.line), borderWidth: 1 });
      page.drawText(pdfText(truncate(`${comment.department} | ${shortLabel(comment.location)} | ${comment.severity}`, 120)), { x: 54, y, size: 8.5, font: fonts.bold, color: pdfRgb(comment.severity === "critical" || comment.severity === "high" ? COLORS.red : COLORS.tealDark) });
      drawWrapped(page, truncate(comment.text.replace(/\s+/g, " "), 640), 54, y - 18, 848, fonts.regular, 9, pdfRgb(COLORS.navy), 5);
    });
  }
}

function newPdfPage(pdf: PDFDocument) {
  const page = pdf.addPage([960, 540]);
  page.drawRectangle({ x: 0, y: 0, width: 9, height: 540, color: pdfRgb(COLORS.teal) });
  return page;
}

function pdfHeader(page: PDFPage, fonts: PdfFonts, title: string, subtitle: string) {
  page.drawText(title, { x: 40, y: 490, size: 25, font: fonts.bold, color: pdfRgb(COLORS.navy) });
  page.drawText(truncate(subtitle, 150), { x: 42, y: 464, size: 10.5, font: fonts.regular, color: pdfRgb(COLORS.slate) });
  page.drawText("Employee Pulse Survey", { x: 820, y: 18, size: 8, font: fonts.regular, color: pdfRgb(COLORS.muted) });
}

function pdfCard(page: PDFPage, fonts: PdfFonts, x: number, y: number, width: number, height: number, label: string, value: string, detail: string, colour = COLORS.teal) {
  page.drawRectangle({ x, y, width, height, color: pdfRgb(COLORS.panel), borderColor: pdfRgb(COLORS.line), borderWidth: 1 });
  page.drawText(label, { x: x + 14, y: y + height - 23, size: 9.5, font: fonts.regular, color: pdfRgb(COLORS.slate) });
  page.drawText(value, { x: x + 14, y: y + 37, size: 23, font: fonts.bold, color: pdfRgb(colour) });
  page.drawText(detail, { x: x + 14, y: y + 16, size: 8, font: fonts.regular, color: pdfRgb(COLORS.muted) });
}

function pdfQuestionColumn(page: PDFPage, fonts: PdfFonts, title: string, questions: ResultsExportData["questions"], x: number, y: number, colour: ReturnType<typeof rgb>) {
  page.drawText(title.toUpperCase(), { x, y, size: 13, font: fonts.bold, color: colour });
  questions.forEach((question, index) => {
    const itemY = y - 45 - index * 70;
    page.drawRectangle({ x, y: itemY - 40, width: 415, height: 56, color: pdfRgb(COLORS.panel), borderColor: pdfRgb(COLORS.line), borderWidth: 1 });
    page.drawCircle({ x: x + 24, y: itemY - 10, size: 18, color: colour });
    page.drawText(String(question.average ?? ""), { x: x + 14, y: itemY - 14, size: 10, font: fonts.bold, color: pdfRgb(COLORS.white) });
    drawWrapped(page, question.question, x + 52, itemY, 340, fonts.bold, 9.5, pdfRgb(COLORS.navy), 2);
  });
}

function drawWrapped(page: PDFPage, text: string, x: number, y: number, width: number, font: PDFFont, size: number, colour: ReturnType<typeof rgb>, maxLines: number) {
  const words = pdfText(text).replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
    else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) lines[maxLines - 1] = truncate(lines[maxLines - 1], Math.max(8, lines[maxLines - 1].length - 3)) + "...";
  lines.forEach((value, index) => page.drawText(value, { x, y: y - index * (size + 3), size, font, color: colour }));
}

function sectionStyle(fill: string) {
  return { fill, fontColor: COLORS.white, bold: true, horizontalAlignment: "center", verticalAlignment: "center" };
}

function dateRange(survey: ResultsExportData["survey"]) {
  const formatter = new Intl.DateTimeFormat("en-GB", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Toronto" });
  return `${formatter.format(new Date(survey.startDate))} to ${formatter.format(new Date(survey.endDate))}`;
}

function displayScore(value: number | null) {
  return value === null ? "Protected" : `${value} / 5`;
}

function displayPercent(value: number | null) {
  return value === null ? "N/A" : `${value}%`;
}

function scoreColour(value: number | null) {
  if (value === null) return COLORS.muted;
  if (value >= 4.2) return COLORS.green;
  if (value >= 3.5) return COLORS.amber;
  return COLORS.red;
}

function pdfRgb(hex: string) {
  const value = hex.replace("#", "");
  return rgb(parseInt(value.slice(0, 2), 16) / 255, parseInt(value.slice(2, 4), 16) / 255, parseInt(value.slice(4, 6), 16) / 255);
}

function shortLabel(value: string) {
  return value.replace(/^\d+\s+/, "").split(/\s+[\u2013\u2014-]\s+/)[0].trim() || value;
}

function truncate(value: string, length: number) {
  return value.length > length ? `${value.slice(0, Math.max(0, length - 3))}...` : value;
}

function pdfText(value: string) {
  const replacements: Record<string, string> = {
    "\u2013": "-",
    "\u2014": "-",
    "\u2018": "'",
    "\u2019": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2026": "...",
    "\u2022": "-",
  };
  return Array.from(value)
    .map((character) => {
      if (replacements[character]) return replacements[character];
      return character.codePointAt(0)! <= 255 ? character : "";
    })
    .join("");
}

function col(index: number) {
  let result = "";
  let value = index;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function toBuffer(value: Buffer | Uint8Array | ArrayBuffer) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value));
  return Buffer.from(value);
}

async function normalizeWorkbookStyles(workbook: Buffer) {
  const zip = await JSZip.loadAsync(workbook);
  const styleFile = zip.file("xl/styles.xml");
  if (!styleFile) return workbook;
  const styles = await styleFile.async("string");
  zip.file(
    "xl/styles.xml",
    styles.replace(/<fill\/>/g, '<fill><patternFill patternType="none"/></fill>')
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
