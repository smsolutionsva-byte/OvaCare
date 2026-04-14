export interface SymptomData {
  age: number;
  bmi: number;
  periodRegularity: "regular" | "irregular" | "absent";
  acne: "none" | "mild" | "moderate" | "severe";
  hairGrowth: "none" | "mild" | "moderate" | "severe";
  hairLoss: "none" | "mild" | "moderate" | "severe";
  weightGain: boolean;
  fatigue: boolean;
  moodSwings: boolean;
  darkPatches: boolean;
  familyHistory: boolean;
  exercise: "none" | "light" | "moderate" | "intense";
  diet: "balanced" | "mostly_processed" | "irregular";
}

export interface RiskResult {
  score: number;
  level: "low" | "moderate" | "high";
  factors: string[];
  breakdown: { label: string; score: number }[];
  recommendations: string[];
}

export function calculateRisk(data: SymptomData): RiskResult {
  let score = 0;
  const factors: string[] = [];
  const breakdown: { label: string; score: number }[] = [];

  const addFactor = (label: string, points: number) => {
    if (points <= 0) return;
    score += points;
    factors.push(label);
    breakdown.push({ label, score: points });
  };

  // Period regularity (major factor)
  if (data.periodRegularity === "irregular") { addFactor("Irregular periods", 20); }
  if (data.periodRegularity === "absent") { addFactor("Absent periods", 30); }

  // BMI
  if (data.bmi >= 25 && data.bmi < 30) { addFactor("Overweight BMI", 8); }
  if (data.bmi >= 30) { addFactor("Obese BMI", 15); }

  // Symptoms
  const severityScore = { none: 0, mild: 3, moderate: 7, severe: 12 };
  if (data.acne !== "none") { addFactor(`Acne (${data.acne})`, severityScore[data.acne]); }
  if (data.hairGrowth !== "none") { addFactor(`Excess hair growth (${data.hairGrowth})`, severityScore[data.hairGrowth]); }
  if (data.hairLoss !== "none") { addFactor(`Hair thinning (${data.hairLoss})`, severityScore[data.hairLoss]); }

  if (data.weightGain) { addFactor("Unexplained weight gain", 5); }
  if (data.fatigue) { addFactor("Chronic fatigue", 3); }
  if (data.moodSwings) { addFactor("Mood swings", 3); }
  if (data.darkPatches) { addFactor("Dark skin patches (Acanthosis)", 6); }
  if (data.familyHistory) { addFactor("Family history of PCOS", 10); }

  // Lifestyle
  if (data.exercise === "none") { addFactor("Low exercise level", 5); }
  if (data.diet === "mostly_processed") { addFactor("Mostly processed diet", 4); }
  if (data.diet === "irregular") { addFactor("Irregular meals", 3); }

  // Age factor
  if (data.age >= 18 && data.age <= 35) { addFactor("Typical PCOS age bracket", 3); }

  score = Math.min(score, 100);

  const level: RiskResult["level"] = score < 30 ? "low" : score < 60 ? "moderate" : "high";

  const recommendations = getRecommendations(level, data);

  return { score, level, factors, breakdown, recommendations };
}

function getRecommendations(level: RiskResult["level"], data: SymptomData): string[] {
  const recs: string[] = [];

  if (level === "high") {
    recs.push("Schedule an appointment with a gynecologist or endocrinologist as soon as possible.");
    recs.push("Request blood tests for testosterone, DHEA-S, insulin, and thyroid hormones.");
    recs.push("Consider getting a pelvic ultrasound to check for ovarian cysts.");
  } else if (level === "moderate") {
    recs.push("Consider consulting a healthcare provider for a thorough evaluation.");
    recs.push("Track your menstrual cycle for 3-6 months to identify patterns.");
  }

  if (data.bmi >= 25) {
    recs.push("Focus on gradual weight management — even a 5-10% reduction can improve symptoms.");
  }
  if (data.exercise === "none" || data.exercise === "light") {
    recs.push("Aim for 150 minutes of moderate exercise per week (walking, yoga, swimming).");
  }
  if (data.diet !== "balanced") {
    recs.push("Adopt a balanced diet rich in whole grains, lean proteins, and anti-inflammatory foods.");
  }

  recs.push("Prioritize sleep hygiene — aim for 7-9 hours of quality sleep.");
  recs.push("Manage stress through mindfulness, meditation, or breathing exercises.");

  return recs;
}
