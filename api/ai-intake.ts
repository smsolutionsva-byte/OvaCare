type Provider = "groq" | "openrouter";

type IntakePayload = {
  baselineRisk: number;
  riskLevel: "low" | "moderate" | "high";
  factors: string[];
  symptomsData: Record<string, unknown>;
  freeTextSymptoms?: string;
};

type ModelResponse = {
  summary: string;
  possibleContributingFactors: string[];
  whenToSeekMedicalAttention: string[];
  questionsToDiscussWithDoctor: string[];
  suggested30DayActionPlan: string[];
  medicalDisclaimer: string;
  confidence: "low" | "medium" | "high";
  providerUsed?: Provider;
};

const MEDICAL_DISCLAIMER =
  "This summary is for informational purposes only and does not replace professional medical advice.";

const SYSTEM_PROMPT = [
  "You are an assistant helping with structured PCOS intake support for general education.",
  "Return only strict JSON, without markdown or extra text.",
  "Never claim diagnosis. Use cautious language such as 'may be associated with', 'may suggest', and 'should be evaluated by a healthcare professional'.",
  "Tone must be calm, reassuring, and easy to read.",
  "Summary must mention the most relevant symptoms from provided data in concise language.",
  "Possible Contributing Factors must include short plain-language explanations.",
  "When to Seek Medical Attention must only include urgent or early-attention scenarios, using action wording like 'Seek medical care if you experience...'.",
  "Questions to Discuss With a Doctor must focus on diagnosis, testing, and management.",
  "Suggested 30-Day Action Plan must be timeline-based (Week 1, Week 2, Week 3, Week 4) and include symptom tracking guidance.",
  "Avoid fear-based language.",
  "Output JSON shape:",
  "{",
  '  "summary": "string",',
  '  "possibleContributingFactors": ["string"],',
  '  "whenToSeekMedicalAttention": ["string"],',
  '  "questionsToDiscussWithDoctor": ["string"],',
  '  "suggested30DayActionPlan": ["string"],',
  `  "medicalDisclaimer": "${MEDICAL_DISCLAIMER}",`,
  '  "confidence": "low" | "medium" | "high"',
  "}",
  "Keep each list concise (3 to 6 items).",
  "If no major red flag exists, include one calm monitoring item in whenToSeekMedicalAttention.",
].join("\n");

const safeArray = (input: unknown) =>
  Array.isArray(input) ? input.map((item) => String(item)).filter(Boolean) : [];

const clampRisk = (value: unknown, fallback: number) => {
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
};

const normalizeOutput = (parsed: unknown, baselineRisk: number): ModelResponse => {
  const obj = (parsed || {}) as Record<string, unknown>;

  return {
    summary: String(
      obj.summary ||
        "Your responses may be associated with hormonal and metabolic patterns that should be evaluated by a healthcare professional.",
    ),
    possibleContributingFactors: safeArray(obj.possibleContributingFactors),
    whenToSeekMedicalAttention: safeArray(obj.whenToSeekMedicalAttention),
    questionsToDiscussWithDoctor: safeArray(obj.questionsToDiscussWithDoctor),
    suggested30DayActionPlan: safeArray(obj.suggested30DayActionPlan),
    medicalDisclaimer: MEDICAL_DISCLAIMER,
    confidence: obj.confidence === "low" || obj.confidence === "high" ? obj.confidence : "medium",
  };
};

const extractJsonFromText = (content: string) => {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return JSON.");
  }

  return JSON.parse(content.slice(start, end + 1));
};

const callGroq = async (payload: IntakePayload) => {
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

const callOpenRouter = async (payload: IntakePayload, referer?: string) => {
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

const callProvider = async (provider: Provider, payload: IntakePayload, referer?: string) => {
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
    const payload = (body.payload || {}) as IntakePayload;
    const refererHeader = req.headers?.origin || req.headers?.referer;

    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Missing payload" });
    }

    const baselineRisk = clampRisk(payload.baselineRisk, 0);

    const availability = {
      groq: hasGroqKey(),
      openrouter: hasOpenRouterKey(),
    };

    if (!availability.groq && !availability.openrouter) {
      return res.status(500).json({
        error: "No AI provider key configured. Add GROQ_API_KEY or OPENROUTER_API_KEY in Vercel env vars.",
      });
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
        const normalized = normalizeOutput(raw, baselineRisk);
        return res.status(200).json({ ...normalized, providerUsed: candidate });
      } catch (candidateError) {
        const message = candidateError instanceof Error ? candidateError.message : "Unknown provider error";
        errors.push(`${candidate}: ${message}`);
      }
    }

    return res.status(500).json({
      error: "All configured AI providers failed.",
      details: errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown AI server error";
    return res.status(500).json({ error: message });
  }
}
