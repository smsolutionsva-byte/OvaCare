export type WhatIfInput = {
  baselineRisk: number;
  sleepHours: number;
  activityMinutesPerDay: number;
  dietQuality: number;
  stressLevel: number;
};

export type WhatIfOutput = {
  projectedRisk: number;
  delta: number;
  riskBand: "low" | "moderate" | "high";
  explanation: string[];
  nutritionPlan: string[];
  sleepPlan: string[];
  doctorPrompt: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const riskBandFromScore = (score: number): WhatIfOutput["riskBand"] => {
  if (score < 30) return "low";
  if (score < 60) return "moderate";
  return "high";
};

export const simulateWhatIfPlan = (input: WhatIfInput): WhatIfOutput => {
  const baseline = clamp(Math.round(input.baselineRisk), 0, 100);
  const sleep = clamp(input.sleepHours, 4, 11);
  const activityPerDay = clamp(input.activityMinutesPerDay, 0, 120);
  const diet = clamp(input.dietQuality, 1, 10);
  const stress = clamp(input.stressLevel, 1, 10);

  const weeklyActivity = activityPerDay * 7;

  let improvementPoints = 0;
  let penaltyPoints = 0;
  const explanation: string[] = [];

  if (sleep >= 7.5) {
    improvementPoints += 8;
    explanation.push("Sleep target is protective: regular 7.5+ hour sleep can support hormonal and metabolic stability.");
  } else if (sleep >= 6.5) {
    improvementPoints += 4;
    explanation.push("Sleep is close to target. Increasing by 30-60 minutes may improve recovery and appetite regulation.");
  } else {
    penaltyPoints += 5;
    explanation.push("Sleep below 6.5 hours may worsen fatigue, hunger signaling, and insulin sensitivity.");
  }

  if (weeklyActivity >= 150) {
    improvementPoints += 10;
    explanation.push("Activity reaches guideline-level volume (150+ min/week), which supports insulin response and weight management.");
  } else if (weeklyActivity >= 90) {
    improvementPoints += 5;
    explanation.push("Activity is moderate but below target. Adding 10-15 minutes on most days can improve impact.");
  } else {
    penaltyPoints += 4;
    explanation.push("Very low activity is associated with higher metabolic load and symptom persistence.");
  }

  if (diet >= 8) {
    improvementPoints += 12;
    explanation.push("High-quality nutrition plan suggests strong improvement potential for glucose and weight trends.");
  } else if (diet >= 6) {
    improvementPoints += 7;
    explanation.push("Diet quality is fair. Better protein/fiber timing may improve cycle and energy consistency.");
  } else {
    penaltyPoints += 7;
    explanation.push("Low diet quality can increase insulin and inflammatory burden over time.");
  }

  if (stress <= 4) {
    improvementPoints += 6;
    explanation.push("Stress level is controlled, which can help menstrual regularity and sleep quality.");
  } else if (stress <= 6) {
    improvementPoints += 3;
    explanation.push("Stress is moderate. Structured wind-down routines may further improve symptoms.");
  } else {
    penaltyPoints += 6;
    explanation.push("Higher stress may amplify mood, sleep, and cycle irregularity patterns.");
  }

  const rawProjected = baseline - improvementPoints + penaltyPoints;
  const projectedRisk = clamp(Math.round(rawProjected), 0, 100);
  const delta = projectedRisk - baseline;

  const nutritionPlan = [
    "Build each meal around protein + fiber first (for example: eggs/curd/paneer + vegetables + whole grains).",
    "Limit ultra-processed snacks to 1 planned serving/day and replace late-night sugar with fruit + nuts.",
    "Use a consistent meal window; avoid long fasting followed by high-glycemic meals.",
  ];

  const sleepPlan = [
    "Keep a fixed sleep-wake window, even on weekends (max 1-hour shift).",
    "Create a 30-minute screen-free wind-down: low lights, hydration, breathing, and light stretching.",
    "If sleep is under 7 hours, shift bedtime earlier by 15 minutes every 3 nights until target is reached.",
  ];

  const doctorPrompt =
    delta <= -8
      ? "Lifestyle simulation suggests improvement. Ask your doctor which labs should be repeated in 8-12 weeks to confirm progress."
      : "Simulation shows limited improvement. Ask your doctor about endocrine evaluation and personalized treatment options.";

  return {
    projectedRisk,
    delta,
    riskBand: riskBandFromScore(projectedRisk),
    explanation,
    nutritionPlan,
    sleepPlan,
    doctorPrompt,
  };
};
