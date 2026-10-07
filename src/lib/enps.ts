export type EnpsBreakdown = {
  responses: number;
  promoters: number;
  passives: number;
  detractors: number;
  promotersPercent: number | null;
  passivesPercent: number | null;
  detractorsPercent: number | null;
  score: number | null;
};

export function calculateEnpsBreakdown(ratings: number[]): EnpsBreakdown {
  const validRatings = ratings.filter(
    (rating) => Number.isFinite(rating) && rating >= 0 && rating <= 10
  );
  const responses = validRatings.length;
  const promoters = validRatings.filter((rating) => rating >= 9).length;
  const passives = validRatings.filter((rating) => rating >= 7 && rating <= 8).length;
  const detractors = validRatings.filter((rating) => rating <= 6).length;

  return {
    responses,
    promoters,
    passives,
    detractors,
    promotersPercent: percentage(promoters, responses),
    passivesPercent: percentage(passives, responses),
    detractorsPercent: percentage(detractors, responses),
    score: responses
      ? Math.round(((promoters - detractors) / responses) * 100)
      : null,
  };
}

export function calculateEnps(ratings: number[]) {
  return calculateEnpsBreakdown(ratings).score;
}

function percentage(count: number, total: number) {
  if (!total) return null;
  return Math.round((count / total) * 1000) / 10;
}
