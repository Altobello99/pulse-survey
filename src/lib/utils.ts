export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

export function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateShort(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function daysUntil(date: Date | string) {
  const diff = new Date(date).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function isOverdue(date: Date | string | null | undefined) {
  if (!date) return false;
  return new Date(date) < new Date();
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function sentimentColor(sentiment: string) {
  switch (sentiment) {
    case "positive":
      return "text-emerald-600 bg-emerald-50";
    case "negative":
      return "text-red-600 bg-red-50";
    case "mixed":
      return "text-amber-600 bg-amber-50";
    default:
      return "text-slate-600 bg-slate-50";
  }
}
