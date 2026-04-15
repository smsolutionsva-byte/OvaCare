import { useMemo, useState } from "react";
import { Brain, Loader2, Sparkles } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { RiskResult, SymptomData } from "@/lib/riskCalculator";

type Provider = "groq" | "openrouter";

type AIIntakeResponse = {
  summary: string;
  possibleContributingFactors: string[];
  whenToSeekMedicalAttention: string[];
  questionsToDiscussWithDoctor: string[];
  suggested30DayActionPlan: string[];
  medicalDisclaimer: string;
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

const MEDICAL_DISCLAIMER =
  "This summary is for informational purposes only and does not replace professional medical advice.";

const truncateLabel = (label: string, max = 22) =>
  label.length > max ? `${label.slice(0, max)}...` : label;

const severityMap: Record<"none" | "mild" | "moderate" | "severe", number> = {
  none: 10,
  mild: 40,
  moderate: 70,
  severe: 95,
};

const getRadarData = (data: SymptomData) => {
  const menstrual =
    data.periodRegularity === "regular"
      ? 15
      : data.periodRegularity === "irregular"
        ? 72
        : 95;

  const androgen = Math.round(
    (severityMap[data.acne] + severityMap[data.hairGrowth] + severityMap[data.hairLoss]) / 3,
  );

  const bmiScore = data.bmi >= 30 ? 85 : data.bmi >= 25 ? 62 : 25;
  const metabolic = Math.min(
    100,
    Math.round(
      bmiScore + (data.weightGain ? 10 : 0) + (data.darkPatches ? 10 : 0) + (data.fatigue ? 6 : 0),
    ),
  );

  const exerciseLoad = data.exercise === "none" ? 85 : data.exercise === "light" ? 65 : data.exercise === "moderate" ? 35 : 20;
  const dietLoad = data.diet === "balanced" ? 25 : data.diet === "mostly_processed" ? 75 : 65;
  const lifestyle = Math.min(100, Math.round((exerciseLoad + dietLoad + (data.moodSwings ? 10 : 0)) / 2));

  const family = data.familyHistory ? 76 : 25;

  return [
    { axis: "Cycle Pattern", user: menstrual, reference: 82 },
    { axis: "Androgen Signs", user: androgen, reference: 74 },
    { axis: "Metabolic Signs", user: metabolic, reference: 70 },
    { axis: "Lifestyle Load", user: lifestyle, reference: 58 },
    { axis: "Family Risk", user: family, reference: 49 },
  ];
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

  const radarData = useMemo(() => getRadarData(data), [data]);

  const getLocalFallback = (): AIIntakeResponse => {
    const topDrivers = [...result.breakdown]
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((item) => item.label);

    return {
      summary:
        "Your responses may be associated with a hormonal-metabolic pattern that should be evaluated by a healthcare professional. Based on your inputs, key symptoms include menstrual pattern changes and symptom clusters reflected in your risk factors.",
      possibleContributingFactors: topDrivers.map(
        (item) => `${item}: This pattern may be associated with hormonal imbalance and should be clinically reviewed.`,
      ),
      whenToSeekMedicalAttention:
        data.periodRegularity === "absent" || result.level === "high"
          ? [
              "Seek medical care if you experience absent periods for several months, heavy bleeding, or severe pelvic pain.",
              "Seek early medical review if symptoms rapidly worsen or interfere with daily functioning.",
            ]
          : ["Seek medical care if menstrual irregularity persists or new severe symptoms appear."],
      questionsToDiscussWithDoctor: [
        "Which blood tests can help evaluate hormone and metabolic status (e.g., testosterone, fasting insulin, HbA1c, thyroid, prolactin)?",
        "Would pelvic ultrasound or additional diagnostic criteria be appropriate in my case?",
        "What management options are suitable now, and how should progress be monitored over time?",
        "What warning signs should prompt urgent follow-up?",
      ],
      suggested30DayActionPlan: [
        "Week 1: Start a daily symptom and cycle log (bleeding pattern, pain, skin changes, mood, sleep).",
        "Week 2: Build a stable routine with regular meals, hydration, and at least 20-30 minutes activity on most days.",
        "Week 3: Review trends in your log and note triggers such as stress, diet, and sleep variation.",
        "Week 4: Book or attend a clinical follow-up and share your 30-day symptom record for targeted guidance.",
      ],
      medicalDisclaimer: MEDICAL_DISCLAIMER,
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
      json.medicalDisclaimer = MEDICAL_DISCLAIMER;
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

        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
          <Button
            type="button"
            variant={provider === "groq" ? "default" : "outline"}
            onClick={() => setProvider("groq")}
            size="sm"
            className="w-full text-xs sm:text-sm"
          >
            {providerLabelMap.groq}
          </Button>
          <Button
            type="button"
            variant={provider === "openrouter" ? "default" : "outline"}
            onClick={() => setProvider("openrouter")}
            size="sm"
            className="w-full text-xs sm:text-sm"
          >
            {providerLabelMap.openrouter}
          </Button>
          <Button
            type="button"
            className="gradient-primary w-full border-0 md:w-auto"
            onClick={() => void handleGenerate()}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate Insight
          </Button>
        </div>

        {analysis && (
          <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div>
              <p className="text-xs font-semibold text-primary">Summary</p>
              <p className="mt-1 text-sm leading-relaxed text-foreground">{analysis.summary}</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Top Risk Drivers (Points)</p>
                <div className="h-52 md:h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={factorChartData} layout="vertical" margin={{ top: 8, right: 10, left: 10, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis
                        type="category"
                        dataKey="factor"
                        width={140}
                        tick={{ fontSize: 11 }}
                        tickFormatter={(value) => truncateLabel(String(value), 20)}
                      />
                      <Tooltip />
                      <Bar dataKey="points" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Symptom Severity Radar Chart</p>
                <div className="h-52 md:h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} margin={{ top: 10, right: 14, bottom: 10, left: 14 }}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11 }} />
                      <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Radar name="Your Symptoms" dataKey="user" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.35} />
                      <Radar
                        name="Reference Diagnosed Profile"
                        dataKey="reference"
                        stroke="hsl(var(--accent))"
                        fill="hsl(var(--accent))"
                        fillOpacity={0.2}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  Reference profile is an illustrative benchmark derived from publicly available educational summaries of diagnosed PCOS/PCOD symptom patterns, and is not a diagnostic standard.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-primary">Possible Contributing Factors</p>
                <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                  {analysis.possibleContributingFactors.map((driver) => (
                    <li key={driver}>- {driver}</li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="text-xs font-semibold text-primary">When to Seek Medical Attention</p>
                <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                  {analysis.whenToSeekMedicalAttention.map((flag) => (
                    <li key={flag}>- {flag}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-primary">Questions to Discuss With a Doctor</p>
                <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                  {analysis.questionsToDiscussWithDoctor.map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="text-xs font-semibold text-primary">Suggested 30-Day Action Plan</p>
                <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                  {analysis.suggested30DayActionPlan.map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <p className="text-xs font-semibold text-primary">Medical Disclaimer</p>
              <p className="mt-1 text-xs text-muted-foreground">{analysis.medicalDisclaimer || MEDICAL_DISCLAIMER}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Model confidence: {analysis.confidence}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AIIntakePanel;
