type Provider = "groq" | "openrouter";

type LabMarker = {
  name: string;
  value: number;
  unit: string;
  refMin: number | null;
  refMax: number | null;
  status: "low" | "normal" | "high" | "unknown";
};

type Payload = {
  markers: LabMarker[];
  note?: string;
};

type InsightResponse = {
  summary: string;
  averageStatus: string;
  keyFindings: string[];
  practicalGuidance: string[];
  doctorQuestions: string[];
  disclaimer: string;
  providerUsed?: Provider;
};

const DISCLAIMER =
  "This report explanation is for informational purposes only and does not replace professional medical advice, diagnosis, or treatment.";

const SYSTEM_PROMPT = [
  "You are a medical education assistant for blood test interpretation support.",
  "Use calm, clear language and do not diagnose diseases.",
  "Use wording like 'may be associated with' and 'should be evaluated by a healthcare professional'.",
  "Explain if values look broadly in-range or if several markers appear outside reference ranges.",
  "Return strict JSON only.",
  "Output schema:",
  "{",
  '  "summary": "string",',
  '  "averageStatus": "string",',
  '  "keyFindings": ["string"],',
  '  "practicalGuidance": ["string"],',
  '  "doctorQuestions": ["string"],',
  `  "disclaimer": "${DISCLAIMER}"`,
  "}",
].join("\n");

const normalizeArray = (value: unknown) =>
  Array.isArray(value) ? value.map((v) => String(v)).filter(Boolean).slice(0, 8) : [];

const normalizeInsight = (input: unknown): InsightResponse => {
  const obj = (input || {}) as Record<string, unknown>;

  return {
    summary: String(obj.summary || "Your report contains markers that should be interpreted together with your clinical history."),
    averageStatus: String(
      obj.averageStatus ||
        "Overall, this pattern may be within average limits for some markers, with selected values that should be reviewed by a healthcare professional.",
    ),
    keyFindings: normalizeArray(obj.keyFindings),
    practicalGuidance: normalizeArray(obj.practicalGuidance),
    doctorQuestions: normalizeArray(obj.doctorQuestions),
    disclaimer: DISCLAIMER,
  };
};

const extractJson = (content: string) => {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");

  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Model did not return valid JSON.");
  }

  return JSON.parse(content.slice(start, end + 1));
};

const callGroq = async (payload: Payload) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY missing");

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

  return extractJson(content);
};

const callOpenRouter = async (payload: Payload, referer?: string) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY missing");

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

  return extractJson(content);
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const requestedProvider: Provider = body.provider === "openrouter" ? "openrouter" : "groq";
    const payload = (body.payload || {}) as Payload;

    if (!Array.isArray(payload.markers) || payload.markers.length === 0) {
      return res.status(400).json({ error: "No markers provided." });
    }

    const providersToTry: Provider[] = [requestedProvider, requestedProvider === "groq" ? "openrouter" : "groq"];
    const uniqueProviders = [...new Set(providersToTry)] as Provider[];
    const refererHeader = req.headers?.origin || req.headers?.referer;
    const errors: string[] = [];

    for (const provider of uniqueProviders) {
      try {
        const raw = provider === "groq" ? await callGroq(payload) : await callOpenRouter(payload, refererHeader);
        const normalized = normalizeInsight(raw);
        return res.status(200).json({ ...normalized, providerUsed: provider });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown provider error";
        errors.push(`${provider}: ${message}`);
      }
    }

    return res.status(500).json({
      error: "All AI providers failed for report explanation.",
      details: errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ error: message });
  }
}
