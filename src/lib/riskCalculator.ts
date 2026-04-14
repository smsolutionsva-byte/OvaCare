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
  recommendations: string[];
}

export function calculateRisk(data: SymptomData): RiskResult {
  let score = 0;
  const factors: string[] = [];

  // Period regularity (major factor)
  if (data.periodRegularity === "irregular") { score += 20; factors.push("Irregular periods"); }
  if (data.periodRegularity === "absent") { score += 30; factors.push("Absent periods"); }

  // BMI
  if (data.bmi >= 25 && data.bmi < 30) { score += 8; factors.push("Overweight BMI"); }
  if (data.bmi >= 30) { score += 15; factors.push("Obese BMI"); }

  // Symptoms
  const severityScore = { none: 0, mild: 3, moderate: 7, severe: 12 };
  if (data.acne !== "none") { score += severityScore[data.acne]; factors.push(`Acne (${data.acne})`); }
  if (data.hairGrowth !== "none") { score += severityScore[data.hairGrowth]; factors.push(`Excess hair growth (${data.hairGrowth})`); }
  if (data.hairLoss !== "none") { score += severityScore[data.hairLoss]; factors.push(`Hair thinning (${data.hairLoss})`); }

  if (data.weightGain) { score += 5; factors.push("Unexplained weight gain"); }
  if (data.fatigue) { score += 3; factors.push("Chronic fatigue"); }
  if (data.moodSwings) { score += 3; factors.push("Mood swings"); }
  if (data.darkPatches) { score += 6; factors.push("Dark skin patches (Acanthosis)"); }
  if (data.familyHistory) { score += 10; factors.push("Family history of PCOS"); }

  // Lifestyle
  if (data.exercise === "none") { score += 5; }
  if (data.diet === "mostly_processed") { score += 4; }
  if (data.diet === "irregular") { score += 3; }

  // Age factor
  if (data.age >= 18 && data.age <= 35) { score += 3; }

  score = Math.min(score, 100);

  const level: RiskResult["level"] = score < 30 ? "low" : score < 60 ? "moderate" : "high";

  const recommendations = getRecommendations(level, data);

  return { score, level, factors, recommendations };
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
