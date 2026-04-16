type Provider = "groq" | "openrouter";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type TrackerContext = {
  summary: string;
  riskSignal: "stable" | "watch" | "escalating";
  worseningMarkers?: string[];
  improvingMarkers?: string[];
  latestOutOfRange?: number;
  previousOutOfRange?: number;
};

type HealthTwinContext = {
  summary: string;
  latestLevel: "stable" | "watch" | "escalating";
  driftAlerts?: string[];
};

type WhatIfContext = {
  baselineRisk: number;
  projectedRisk: number;
  delta: number;
  riskBand: "low" | "moderate" | "high";
};

type CopilotPayload = {
  message: string;
  history?: ChatMessage[];
  trackerContext?: TrackerContext;
  whatIfContext?: WhatIfContext;
  healthTwinContext?: HealthTwinContext;
  evidenceMode?: boolean;
};

type EvidenceCard = {
  title: string;
  url: string;
  source: string;
  snippet: string;
};

type NextBestTest = {
  testName: string;
  reason: string;
  specialist: string;
  urgency: "routine" | "soon";
};

type SpecialistType =
  | "gynecologist"
  | "endocrinologist"
  | "fertility"
  | "dermatologist"
  | "nutrition"
  | "emergency";

type SpecialistRanking = {
  specialty: SpecialistType;
  score: number;
  reasons: string[];
};

type CopilotResponse = {
  reply: string;
  followUpQuestions: string[];
  recommendedDoctorTypes: string[];
  specialistRankings: SpecialistRanking[];
  actionChecklist: string[];
  triageLevel: "routine" | "soon" | "urgent";
  triageReason: string;
  evidenceCards: EvidenceCard[];
  nextBestTests: NextBestTest[];
  confidence: "low" | "medium" | "high";
  disclaimer: string;
  providerUsed?: Provider;
};

const DISCLAIMER =
  "This guidance is educational support only and does not replace medical diagnosis, treatment, or emergency care.";

const TRIAGE_WEIGHT: Record<CopilotResponse["triageLevel"], number> = {
  routine: 0,
  soon: 1,
  urgent: 2,
};

const EVIDENCE_LIBRARY: Array<EvidenceCard & { tags: string[] }> = [
  {
    title: "NICHD: PCOS Overview",
    source: "NICHD/NIH",
    url: "https://www.nichd.nih.gov/health/topics/pcos",
    snippet: "PCOS can affect metabolic, reproductive, cardiovascular, and inflammatory health domains.",
    tags: ["pcos", "hormone", "fertility", "metabolic", "insulin"],
  },
  {
    title: "ACOG: Menstrual Cycle as a Vital Sign",
    source: "ACOG",
    url: "https://www.acog.org/clinical/clinical-guidance/committee-opinion/articles/2015/12/menstruation-in-girls-and-adolescents-using-the-menstrual-cycle-as-a-vital-sign",
    snippet: "Persistent menstrual abnormalities and long cycle gaps should be clinically evaluated.",
    tags: ["cycle", "period", "amenorrhea", "bleeding", "irregular"],
  },
  {
    title: "CDC: Diabetes Testing Thresholds",
    source: "CDC",
    url: "https://www.cdc.gov/diabetes/diabetes-testing/index.html",
    snippet: "A1C, fasting glucose, and glucose tolerance tests are core tools for metabolic risk assessment.",
    tags: ["glucose", "a1c", "insulin", "prediabetes", "metabolic"],
  },
  {
    title: "HL7 FHIR: Observation Resource",
    source: "HL7",
    url: "https://www.hl7.org/fhir/observation.html",
    snippet: "Longitudinal laboratory measurements are represented as structured observations with reference ranges.",
    tags: ["lab", "observation", "trend", "reference range", "timeline"],
  },
];

const RED_FLAG_PATTERNS: Array<{ pattern: RegExp; reason: string; immediateStep: string }> = [
  {
    pattern: /severe\s*(pelvic\s*)?pain|unbearable\s*pain|acute\s*pelvic\s*pain/i,
    reason: "Severe pelvic pain can indicate urgent gynecologic conditions.",
    immediateStep: "Seek emergency or urgent in-person care now.",
  },
  {
    pattern: /heavy\s*bleeding|soaking\s*(pad|pads)\s*(every|in)\s*(1|one|2|two)\s*hour|uncontrolled\s*bleeding/i,
    reason: "Heavy or uncontrolled bleeding may require urgent stabilization.",
    immediateStep: "Go to emergency care now and avoid delaying for online advice.",
  },
  {
    pattern: /fainting|passed\s*out|syncope|dizzy\s*and\s*weak/i,
    reason: "Fainting with gynecologic symptoms can indicate hemodynamic risk.",
    immediateStep: "Seek urgent emergency assessment now.",
  },
  {
    pattern: /chest\s*pain|short(ness)?\s*of\s*breath/i,
    reason: "Chest symptoms require immediate emergency rule-out.",
    immediateStep: "Call local emergency services immediately.",
  },
  {
    pattern: /suicidal|self\s*harm|want\s*to\s*die|kill\s*myself/i,
    reason: "Mental health crisis symptoms require urgent human support.",
    immediateStep: "Contact emergency mental health support or local emergency services immediately.",
  },
];

const SYSTEM_PROMPT = [
  "You are OvaCare Care Copilot, a cautious women's health assistant for PCOS/PCOD support.",
  "Never diagnose. Never prescribe medications. Use calm, practical language.",
  "Use the provided tracker context (trend changes) and what-if simulation context when relevant.",
  "If severe red-flag symptoms are mentioned (fainting, severe acute pelvic pain, heavy uncontrolled bleeding, chest pain, suicidal thoughts), triageLevel must be 'urgent' and direct immediate care.",
  "If trend indicates worsening or persistent abnormal markers, triageLevel should usually be 'soon'.",
  "Return strict JSON only with this exact schema:",
  "{",
  '  "reply": "string",',
  '  "followUpQuestions": ["string"],',
  '  "recommendedDoctorTypes": ["string"],',
  '  "actionChecklist": ["string"],',
  '  "triageLevel": "routine" | "soon" | "urgent",',
  '  "triageReason": "string",',
  '  "confidence": "low" | "medium" | "high",',
  `  "disclaimer": "${DISCLAIMER}"`,
  "}",
  "Limit arrays to 3-6 concise items.",
].join("\n");

const SPECIALIST_ORDER: SpecialistType[] = [
  "emergency",
  "gynecologist",
  "endocrinologist",
  "fertility",
  "dermatologist",
  "nutrition",
];

const emptySpecialistBucket = () =>
  SPECIALIST_ORDER.reduce(
    (acc, specialty) => {
      acc[specialty] = { score: 0, reasons: [] };
      return acc;
    },
    {} as Record<SpecialistType, { score: number; reasons: string[] }>,
  );

const safeArray = (input: unknown) =>
  Array.isArray(input) ? input.map((item) => String(item)).filter(Boolean).slice(0, 6) : [];

const pickEvidenceCards = (payload: CopilotPayload, enabled: boolean) => {
  if (!enabled) return [] as EvidenceCard[];

  const blob = [
    payload.message || "",
    ...(payload.history || []).map((item) => item.content),
    payload.trackerContext?.summary || "",
    payload.healthTwinContext?.summary || "",
  ]
    .join(" ")
    .toLowerCase();

  const cards = EVIDENCE_LIBRARY.filter((item) => item.tags.some((tag) => blob.includes(tag)));

  const fallback = EVIDENCE_LIBRARY.filter((item) => ["pcos", "trend"].some((tag) => item.tags.includes(tag)));
  const merged = [...cards, ...fallback];

  const unique: EvidenceCard[] = [];
  const seen = new Set<string>();
  for (const row of merged) {
    if (seen.has(row.url)) continue;
    seen.add(row.url);
    unique.push({ title: row.title, source: row.source, url: row.url, snippet: row.snippet });
    if (unique.length >= 4) break;
  }

  return unique;
};

const detectRedFlags = (payload: CopilotPayload) => {
  const corpus = [payload.message, ...(payload.history || []).map((item) => item.content)].join(" ");

  const hits = RED_FLAG_PATTERNS.filter((entry) => entry.pattern.test(corpus));
  if (hits.length === 0) return null;

  const reasons = hits.map((entry) => entry.reason);
  const steps = hits.map((entry) => entry.immediateStep);

  return {
    triageReason: reasons.join(" "),
    immediateSteps: [...new Set(steps)].slice(0, 4),
  };
};

const isEducationalInfoQuery = (message: string) => {
  const normalized = (message || "").toLowerCase();

  const hasInfoIntent =
    /what\s+is|define|meaning\s+of|full\s+form\s+of|explain|overview|tell\s+me\s+about/i.test(normalized);
  const hasConditionKeyword = /pcos|pcod|polycystic\s+ovary\s+syndrome/i.test(normalized);
  const hasPersonalSignal =
    /\b(my|i\s+have|i\s+am|me|mine)\b|symptom|period|cycle|pain|bleeding|acne|hair|weight|insulin|glucose|fertility|conceive/i.test(
      normalized,
    );

  return hasInfoIntent && hasConditionKeyword && !hasPersonalSignal;
};

const shouldUseTrendBasedTriage = (message: string) => {
  const normalized = (message || "").toLowerCase();
  if (isEducationalInfoQuery(normalized)) return false;

  return /\b(my|i\s+have|i\s+am|me|mine)\b|symptom|wors|period|cycle|pain|bleeding|acne|hair|weight|insulin|glucose|doctor|consult|fertility|plan/i.test(
    normalized,
  );
};

const educationalFallbackReply = () =>
  "PCOS stands for Polycystic Ovary Syndrome. It is a common hormonal condition that can involve irregular periods, higher androgen symptoms (such as acne or excess hair growth), and metabolic changes like insulin resistance. It does not always mean ovarian cysts are present. If you want, I can also explain diagnosis criteria, common symptoms, and treatment pathways in simple steps.";

const maxTriage = (
  a: CopilotResponse["triageLevel"],
  b: CopilotResponse["triageLevel"],
): CopilotResponse["triageLevel"] => (TRIAGE_WEIGHT[a] >= TRIAGE_WEIGHT[b] ? a : b);

const addScore = (
  bucket: Record<SpecialistType, { score: number; reasons: string[] }>,
  specialty: SpecialistType,
  score: number,
  reason: string,
) => {
  bucket[specialty].score += score;
  if (!bucket[specialty].reasons.includes(reason)) {
    bucket[specialty].reasons.push(reason);
  }
};

const recommendNextBestTests = (payload: CopilotPayload, forceUrgent = false) => {
  if (forceUrgent) return [] as NextBestTest[];

  const corpus = [
    payload.message,
    ...(payload.history || []).map((item) => item.content),
    payload.trackerContext?.summary || "",
    payload.healthTwinContext?.summary || "",
  ]
    .join(" ")
    .toLowerCase();

  const suggested: NextBestTest[] = [];
  const push = (entry: NextBestTest) => {
    if (suggested.some((item) => item.testName === entry.testName)) return;
    suggested.push(entry);
  };

  const higherRisk =
    payload.trackerContext?.riskSignal === "escalating" ||
    payload.healthTwinContext?.latestLevel === "escalating";

  if (/period|cycle|amenorrhea|irregular|acne|hirsut|hair\s*growth|hair\s*loss|androgen|hormone/.test(corpus)) {
    push({
      testName: "Androgen Panel (Total/Free Testosterone, DHEA-S)",
      reason: "Helps evaluate hyperandrogenic symptom burden linked with cycle and skin-hair changes.",
      specialist: "Gynecologist or Endocrinologist",
      urgency: higherRisk ? "soon" : "routine",
    });
    push({
      testName: "LH, FSH, Prolactin, TSH",
      reason: "Supports differential assessment for cycle irregularity and endocrine overlap.",
      specialist: "Gynecologist or Endocrinologist",
      urgency: higherRisk ? "soon" : "routine",
    });
  }

  if (/insulin|glucose|a1c|sugar|weight|fatigue|dark\s*patch|metabolic|prediabetes/.test(corpus) || higherRisk) {
    push({
      testName: "Fasting Glucose + HbA1c",
      reason: "Screens short- and medium-term glycemic risk patterns.",
      specialist: "Endocrinologist",
      urgency: "soon",
    });
    push({
      testName: "Fasting Insulin with HOMA-IR context",
      reason: "Helps evaluate insulin resistance patterns frequently seen in PCOS.",
      specialist: "Endocrinologist",
      urgency: "soon",
    });
    push({
      testName: "Lipid Profile (HDL, LDL, TG)",
      reason: "Assesses cardiometabolic burden and supports risk-reduction planning.",
      specialist: "Endocrinologist or Primary Care",
      urgency: higherRisk ? "soon" : "routine",
    });
  }

  if (/fertility|trying\s*to\s*conceive|pregnan|ovulat/.test(corpus)) {
    push({
      testName: "Pelvic Ultrasound (follicular morphology)",
      reason: "Provides ovarian morphology context for fertility-focused evaluation.",
      specialist: "Gynecologist/Fertility Specialist",
      urgency: "soon",
    });
  }

  return suggested.slice(0, 6);
};

const buildSpecialistRankings = (
  payload: CopilotPayload,
  nextBestTests: NextBestTest[],
  redFlags: ReturnType<typeof detectRedFlags>,
) => {
  const bucket = emptySpecialistBucket();

  const corpus = [
    payload.message,
    ...(payload.history || []).map((item) => item.content),
    payload.trackerContext?.summary || "",
    payload.healthTwinContext?.summary || "",
  ]
    .join(" ")
    .toLowerCase();

  addScore(bucket, "gynecologist", 6, "Baseline reproductive care coordination for PCOS-related concerns.");

  if (redFlags) {
    addScore(bucket, "emergency", 100, "Potential emergency symptom pattern detected in chat.");
    addScore(bucket, "gynecologist", 30, "Urgent gynecologic follow-up is important after emergency evaluation.");
  }

  if (payload.trackerContext?.riskSignal === "escalating" || payload.healthTwinContext?.latestLevel === "escalating") {
    addScore(bucket, "endocrinologist", 18, "Escalating trend suggests endocrine-metabolic review priority.");
    addScore(bucket, "gynecologist", 12, "Escalating trend also warrants focused gynecologic reassessment.");
  }

  if (/insulin|glucose|a1c|prediabetes|metabolic|weight|lipid|cholesterol|dark\s*patch/.test(corpus)) {
    addScore(bucket, "endocrinologist", 16, "Symptoms/labs suggest metabolic and insulin pathway prioritization.");
    addScore(bucket, "nutrition", 10, "Dietary and weight-support planning can improve metabolic trajectory.");
  }

  if (/fertility|trying\s*to\s*conceive|ovulat|infertility/.test(corpus)) {
    addScore(bucket, "fertility", 20, "Fertility-focused goals were mentioned and need specialist planning.");
    addScore(bucket, "gynecologist", 8, "Cycle and ovulatory coordination remains important before referral.");
  }

  if (/acne|hirsut|hair\s*growth|hair\s*loss|skin/.test(corpus)) {
    addScore(bucket, "dermatologist", 13, "Skin/hair symptom burden may benefit from specialist symptom control.");
    addScore(bucket, "endocrinologist", 7, "Androgen-related symptoms can reflect endocrine imbalance.");
  }

  if (payload.whatIfContext?.riskBand === "high") {
    addScore(bucket, "endocrinologist", 8, "High projected risk in simulation supports earlier endocrine review.");
    addScore(bucket, "nutrition", 6, "High-risk lifestyle simulation suggests intensive nutrition support.");
  }

  for (const test of nextBestTests) {
    const specialist = test.specialist.toLowerCase();

    if (specialist.includes("endocrin")) {
      addScore(bucket, "endocrinologist", 6, `Recommended test aligns with endocrinology: ${test.testName}.`);
    }
    if (specialist.includes("gynec")) {
      addScore(bucket, "gynecologist", 6, `Recommended test aligns with gynecology: ${test.testName}.`);
    }
    if (specialist.includes("fertility")) {
      addScore(bucket, "fertility", 6, `Recommended test aligns with fertility care: ${test.testName}.`);
    }
    if (specialist.includes("primary care")) {
      addScore(bucket, "nutrition", 2, `Shared-care context mentioned for ${test.testName}.`);
    }
  }

  const ranked: SpecialistRanking[] = SPECIALIST_ORDER.map((specialty) => ({
    specialty,
    score: Number(bucket[specialty].score.toFixed(1)),
    reasons: bucket[specialty].reasons.slice(0, 4),
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return ranked;
};

const localContextFallback = (payload: CopilotPayload) => {
  const trend = payload.trackerContext?.summary || "Trend data is limited right now.";
  const twin = payload.healthTwinContext?.summary || "Health Twin needs more data.";
  const projected =
    payload.whatIfContext != null
      ? `What-if projected risk is ${payload.whatIfContext.projectedRisk} (${payload.whatIfContext.delta >= 0 ? "+" : ""}${payload.whatIfContext.delta}).`
      : "What-if simulation was not provided.";

  return `${trend} ${twin} ${projected} Keep symptom logs and discuss persistent changes with your clinician.`;
};

const extractJsonFromText = (content: string) => {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return JSON.");
  }

  return JSON.parse(content.slice(start, end + 1));
};

const normalizeOutput = (parsed: unknown): Omit<CopilotResponse, "evidenceCards" | "nextBestTests"> => {
  const obj = (parsed || {}) as Record<string, unknown>;

  const triageLevel =
    obj.triageLevel === "urgent" || obj.triageLevel === "soon" || obj.triageLevel === "routine"
      ? obj.triageLevel
      : "routine";

  const confidence =
    obj.confidence === "low" || obj.confidence === "high" || obj.confidence === "medium"
      ? obj.confidence
      : "medium";

  return {
    reply: String(
      obj.reply ||
        "I can help organize your symptoms and report trends into practical next steps you can discuss with a clinician.",
    ),
    followUpQuestions: safeArray(obj.followUpQuestions),
    recommendedDoctorTypes: safeArray(obj.recommendedDoctorTypes),
    specialistRankings: [],
    actionChecklist: safeArray(obj.actionChecklist),
    triageLevel,
    triageReason: String(obj.triageReason || "Triage based on reported symptoms and available trend context."),
    confidence,
    disclaimer: DISCLAIMER,
  };
};

const callGroq = async (payload: CopilotPayload) => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Groq error: ${text}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned empty content.");

  return extractJsonFromText(content);
};

const callOpenRouter = async (payload: CopilotPayload, referer?: string) => {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const model = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-8b-instruct";

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || referer || "https://example.com",
      "X-Title": process.env.OPENROUTER_APP_NAME || "OvaCare",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter error: ${text}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned empty content.");

  return extractJsonFromText(content);
};

const hasGroqKey = () => !!process.env.GROQ_API_KEY;
const hasOpenRouterKey = () => !!process.env.OPENROUTER_API_KEY;

const callProvider = async (provider: Provider, payload: CopilotPayload, referer?: string) => {
  if (provider === "groq") {
    return callGroq(payload);
  }

  return callOpenRouter(payload, referer);
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const provider: Provider = body.provider === "openrouter" ? "openrouter" : "groq";
    const payload = (body.payload || {}) as CopilotPayload;
    const refererHeader = req.headers?.origin || req.headers?.referer;
    const evidenceMode = payload.evidenceMode !== false;
    const educationalQuery = isEducationalInfoQuery(payload.message || "");
    const trendTriageEligible = shouldUseTrendBasedTriage(payload.message || "");

    if (!payload.message || typeof payload.message !== "string") {
      return res.status(400).json({ error: "Missing message payload." });
    }

    const evidenceCards = pickEvidenceCards(payload, evidenceMode);
    const redFlags = detectRedFlags(payload);
    const nextBestTests = recommendNextBestTests(payload, Boolean(redFlags));
    const specialistRankings = buildSpecialistRankings(payload, nextBestTests, redFlags);

    if (redFlags) {
      const urgentResponse: CopilotResponse = {
        reply:
          "Your message includes potential emergency warning signs. I cannot safely guide this through chat alone. Please seek immediate in-person emergency care now.",
        followUpQuestions: [
          "Are you currently with someone who can help you reach urgent care safely?",
          "Do you need local emergency contact guidance right now?",
        ],
        recommendedDoctorTypes: ["Emergency medicine", "Gynecologist"],
        specialistRankings,
        actionChecklist: [
          ...redFlags.immediateSteps,
          "Take your recent reports and current medication list with you.",
          "Do not delay urgent evaluation while waiting for online responses.",
        ].slice(0, 6),
        triageLevel: "urgent",
        triageReason: redFlags.triageReason,
        evidenceCards,
        nextBestTests,
        confidence: "high",
        disclaimer: DISCLAIMER,
      };

      return res.status(200).json(urgentResponse);
    }

    const availability = {
      groq: hasGroqKey(),
      openrouter: hasOpenRouterKey(),
    };

    const contextTriage: CopilotResponse["triageLevel"] =
      trendTriageEligible &&
      (payload.trackerContext?.riskSignal === "escalating" || payload.healthTwinContext?.latestLevel === "escalating")
        ? "soon"
        : "routine";

    if (!availability.groq && !availability.openrouter) {
      const fallbackResponse: CopilotResponse = {
        reply: educationalQuery ? educationalFallbackReply() : localContextFallback(payload),
        followUpQuestions: [
          ...(educationalQuery
            ? [
                "Would you like a quick explanation of PCOS diagnosis criteria?",
                "Do you want a beginner-friendly treatment overview (lifestyle + medical options)?",
                "Should I explain when to consult a gynecologist versus endocrinologist?",
              ]
            : [
                "How have your cycle intervals changed in the last 3 months?",
                "Which symptom has worsened most recently (acne, hair, fatigue, weight, mood)?",
                "Would you like a doctor-ready follow-up checklist based on these trends?",
              ]),
        ],
        recommendedDoctorTypes: ["Gynecologist", "Endocrinologist"],
        specialistRankings,
        actionChecklist: [
          "Track cycle dates and symptom severity weekly.",
          "Repeat priority labs in clinician-recommended timeline.",
          "Book follow-up if symptoms are worsening or persistent.",
        ],
        triageLevel: contextTriage,
        triageReason: educationalQuery
          ? "Educational question detected without personal urgent symptom context."
          : "Triage derived from trend context because no AI provider key is configured.",
        evidenceCards,
        nextBestTests,
        confidence: "medium",
        disclaimer: DISCLAIMER,
      };

      return res.status(200).json(fallbackResponse);
    }

    const providersToTry: Provider[] = [provider, provider === "groq" ? "openrouter" : "groq"];
    const uniqueProviders = [...new Set(providersToTry)] as Provider[];
    const errors: string[] = [];

    for (const candidate of uniqueProviders) {
      if (!availability[candidate]) {
        errors.push(`${candidate}: API key missing`);
        continue;
      }

      try {
        const raw = await callProvider(candidate, payload, refererHeader);
        const normalized = normalizeOutput(raw);
        const triageLevel = educationalQuery ? "routine" : maxTriage(normalized.triageLevel, contextTriage);
        const triageReason = educationalQuery
          ? "Educational question detected without personal urgent symptom context."
          : normalized.triageReason;

        return res.status(200).json({
          ...normalized,
          triageLevel,
          triageReason,
          specialistRankings,
          evidenceCards,
          nextBestTests,
          providerUsed: candidate,
        });
      } catch (candidateError) {
        const message = candidateError instanceof Error ? candidateError.message : "Unknown provider error";
        errors.push(`${candidate}: ${message}`);
      }
    }

    const fallbackResponse: CopilotResponse = {
      reply: educationalQuery
        ? `${educationalFallbackReply()} AI services were temporarily unavailable, so this response used local safeguards.`
        : `${localContextFallback(payload)} AI services were temporarily unavailable, so this response used local safeguards.`,
      followUpQuestions: [
        ...(educationalQuery
          ? [
              "Do you want a simple explanation of diagnosis and lab work for PCOS?",
              "Should I compare common treatment tracks in plain language?",
            ]
          : [
              "Do you want a tighter follow-up plan for the next 30 days?",
              "Should we prioritize hormonal or metabolic goals first?",
            ]),
      ],
      recommendedDoctorTypes: ["Gynecologist", "Endocrinologist"],
      specialistRankings,
      actionChecklist: [
        "Keep weekly symptom, cycle, and sleep logs.",
        "Book specialist review if drift remains worsening.",
        "Carry your trend summary and report timeline to consultation.",
      ],
      triageLevel: contextTriage,
      triageReason: educationalQuery
        ? "Educational question detected without personal urgent symptom context."
        : "AI providers were unavailable; triage is based on deterministic trend rules.",
      evidenceCards,
      nextBestTests,
      confidence: "medium",
      disclaimer: DISCLAIMER,
    };

    return res.status(200).json({ ...fallbackResponse, providerUsed: provider, providerErrors: errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown AI server error";
    return res.status(500).json({ error: message });
  }
}
