import { useMemo, useState } from "react";
import { Brain, Loader2, Sparkles } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { RiskResult, SymptomData } from "@/lib/riskCalculator";

type Provider = "groq" | "openrouter";

type AIIntakeResponse = {
  summary: string;
  likelyDrivers: string[];
  redFlags: string[];
  followUpQuestions: string[];
  carePlan30Days: string[];
  projectedRisk: number;
  confidence: "low" | "medium" | "high";
  providerUsed?: Provider;
};

type Props = {
  data: SymptomData;
  result: RiskResult;
};

const providerLabelMap: Record<Provider, string> = {
  groq: "OvaCare Model 1.09",
  openrouter: "OvaCare Model 1.21",
};

const AIIntakePanel = ({ data, result }: Props) => {
  const { toast } = useToast();
  const [provider, setProvider] = useState<Provider>("groq");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AIIntakeResponse | null>(null);

  const factorChartData = useMemo(
    () =>
      [...result.breakdown]
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .map((item) => ({ factor: item.label, points: item.score })),
    [result.breakdown],
  );

  const compareChartData = useMemo(
    () => [
      { name: "Current", risk: result.score },
      { name: "Projected", risk: analysis?.projectedRisk ?? Math.max(0, result.score - 8) },
    ],
    [analysis?.projectedRisk, result.score],
  );

  const getLocalFallback = (): AIIntakeResponse => {
    const topDrivers = [...result.breakdown]
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((item) => item.label);

    const projectedRisk = Math.max(0, result.score - Math.min(20, Math.round(result.score * 0.22)));

    return {
      summary:
        "Structured intake draft generated from your questionnaire. Connect Groq or OpenRouter key in Vercel to enable deeper AI analysis.",
      likelyDrivers: topDrivers,
      redFlags:
        data.periodRegularity === "absent" || result.level === "high"
          ? ["Absent or highly irregular periods", "High combined symptom burden"]
          : ["No emergency red flag identified in this intake"],
      followUpQuestions: [
        "How long have menstrual irregularities persisted?",
        "Any recent fasting glucose, insulin, or HbA1c lab results?",
        "Any rapid weight change in the last 6 months?",
        "Any thyroid or prolactin tests done recently?",
      ],
      carePlan30Days: [
        "Track cycle dates and symptoms daily for 30 days.",
        "Target 150 minutes/week moderate exercise.",
        "Shift one processed meal each day to balanced whole foods.",
        "Book gynecologist/endocrinologist consult with this summary.",
      ],
      projectedRisk,
      confidence: "medium",
    };
  };

  const handleGenerate = async () => {
    setLoading(true);
    setAnalysis(null);

    try {
      const response = await fetch("/api/ai-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          payload: {
            baselineRisk: result.score,
            riskLevel: result.level,
            factors: result.factors,
            symptomsData: data,
            freeTextSymptoms: notes,
          },
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as {
          error?: string;
          details?: string[];
        };

        const detail = errorData.details?.[0];
        throw new Error(detail || errorData.error || "AI endpoint is unavailable right now.");
      }

      const json = (await response.json()) as AIIntakeResponse;
      setAnalysis(json);
      const usedProvider = json.providerUsed || provider;
      toast({ title: "AI intake ready", description: `Generated with ${providerLabelMap[usedProvider]}.` });
    } catch (error) {
      const fallback = getLocalFallback();
      setAnalysis(fallback);
      const message = error instanceof Error ? error.message : "AI service unavailable.";
      toast({
        title: "Using local draft",
        description: `${message} Showing a structured non-AI intake draft.`,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-border/70 bg-card/95 shadow-card">
      <CardHeader className="space-y-1 p-4 pb-2">
        <CardTitle className="flex items-center gap-2 font-heading text-lg">
          <Brain className="h-5 w-5 text-primary" />
          AI Clinical Intake
        </CardTitle>
        <CardDescription>
          Add extra symptoms in plain language. AI generates structured intake, doctor questions, and projected risk trend.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 p-4 pt-2">
        <div className="space-y-2">
          <Label htmlFor="symptom-notes">Extra symptoms or concerns</Label>
          <Textarea
            id="symptom-notes"
            placeholder="Example: severe cramps, acne flare before periods, sugar cravings, sleeping 5 hours, stress at work"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={provider === "groq" ? "default" : "outline"}
            onClick={() => setProvider("groq")}
            size="sm"
          >
            {providerLabelMap.groq}
          </Button>
          <Button
            type="button"
            variant={provider === "openrouter" ? "default" : "outline"}
            onClick={() => setProvider("openrouter")}
            size="sm"
          >
            {providerLabelMap.openrouter}
          </Button>
          <Button type="button" className="ml-auto gradient-primary border-0" onClick={() => void handleGenerate()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate AI Intake
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Top Risk Drivers (Points)</p>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={factorChartData} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="factor" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="points" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-border p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Current vs Projected Risk</p>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={compareChartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Bar dataKey="risk" fill="hsl(var(--accent))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {analysis && (
          <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Summary</p>
              <p className="mt-1 text-sm text-foreground">{analysis.summary}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Likely Drivers</p>
                <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                  {analysis.likelyDrivers.map((driver) => (
                    <li key={driver}>- {driver}</li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Red Flags</p>
                <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                  {analysis.redFlags.map((flag) => (
                    <li key={flag}>- {flag}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Doctor Questions</p>
                <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                  {analysis.followUpQuestions.map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">30-Day Care Plan</p>
                <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                  {analysis.carePlan30Days.map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Model confidence: {analysis.confidence}. This AI output is educational support only and not a diagnosis.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AIIntakePanel;
