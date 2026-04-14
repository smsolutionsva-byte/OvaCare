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
  likelyDrivers: string[];
  redFlags: string[];
  followUpQuestions: string[];
  carePlan30Days: string[];
  projectedRisk: number;
  confidence: "low" | "medium" | "high";
};

const SYSTEM_PROMPT = [
  "You are an assistant helping with structured PCOS intake support.",
  "Return only strict JSON, without markdown or extra text.",
  "Never claim diagnosis. Use educational and safety-first tone.",
  "Output JSON shape:",
  "{",
  '  "summary": "string",',
  '  "likelyDrivers": ["string"],',
  '  "redFlags": ["string"],',
  '  "followUpQuestions": ["string"],',
  '  "carePlan30Days": ["string"],',
  '  "projectedRisk": 0-100 number,',
  '  "confidence": "low" | "medium" | "high"',
  "}",
  "Keep each list concise (3 to 6 items).",
  "If no major red flag exists, include one calm monitoring item in redFlags.",
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
    summary: String(obj.summary || "AI intake generated."),
    likelyDrivers: safeArray(obj.likelyDrivers),
    redFlags: safeArray(obj.redFlags),
    followUpQuestions: safeArray(obj.followUpQuestions),
    carePlan30Days: safeArray(obj.carePlan30Days),
    projectedRisk: clampRisk(obj.projectedRisk, Math.max(0, baselineRisk - 10)),
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

const callOpenRouter = async (payload: IntakePayload) => {
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
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://example.com",
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

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const provider: Provider = body.provider === "openrouter" ? "openrouter" : "groq";
    const payload = (body.payload || {}) as IntakePayload;

    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Missing payload" });
    }

    const baselineRisk = clampRisk(payload.baselineRisk, 0);

    const raw = provider === "openrouter" ? await callOpenRouter(payload) : await callGroq(payload);
    const normalized = normalizeOutput(raw, baselineRisk);

    return res.status(200).json(normalized);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown AI server error";
    return res.status(500).json({ error: message });
  }
}
