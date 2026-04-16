import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Bot,
  Copy,
  FlaskConical,
  Loader2,
  LocateFixed,
  MapPin,
  Mic,
  SendHorizonal,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Stethoscope,
  Volume2,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  buildHealthTwin,
  buildTrackerContext,
  getCareMessages,
  saveCareMessage,
  type CareMessage,
} from "@/lib/careCopilot";
import {
  findNearbyClinics,
  specialtyLabelMap,
  type ClinicResult,
  type ClinicSpecialty,
} from "@/lib/clinicFinder";
import { loadLeaflet } from "@/lib/leafletLoader";
import { getReportSnapshots, type ReportSnapshot } from "@/lib/reportTracker";
import { simulateWhatIfPlan } from "@/lib/whatIfSimulator";

type Provider = "groq" | "openrouter";

type ToolTab = "whatif" | "doctors" | "twin";

type RankedSpecialty = "gynecologist" | "endocrinologist" | "fertility" | "dermatologist" | "nutrition" | "emergency";

type CopilotApiResponse = {
  reply: string;
  followUpQuestions: string[];
  recommendedDoctorTypes: string[];
  specialistRankings: Array<{
    specialty: RankedSpecialty;
    score: number;
    reasons: string[];
  }>;
  actionChecklist: string[];
  triageLevel: "routine" | "soon" | "urgent";
  triageReason: string;
  evidenceCards: Array<{
    title: string;
    source: string;
    url: string;
    snippet: string;
  }>;
  nextBestTests: Array<{
    testName: string;
    reason: string;
    specialist: string;
    urgency: "routine" | "soon";
  }>;
  confidence: "low" | "medium" | "high";
  providerUsed?: Provider;
  providerErrors?: string[];
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const makeLocalId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatMessageTime = (iso: string) => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const quickPrompts = [
  "Summarize what has worsened in my newest report versus previous.",
  "Ask me the top symptom questions you need for better triage.",
  "Recommend my next best lab tests and explain why each one matters.",
  "Create a doctor-visit checklist for this month.",
  "Explain my likely hormone-metabolic priorities in simple language.",
];

const providerLabelMap: Record<Provider, string> = {
  groq: "OvaCare Model 1.09",
  openrouter: "OvaCare Model 1.21",
};

const toolTabLabelMap: Record<ToolTab, string> = {
  whatif: "What-if Planner",
  doctors: "Doctor Finder",
  twin: "Health Twin",
};

const rankedSpecialtyLabelMap: Record<RankedSpecialty, string> = {
  gynecologist: "Gynecologist",
  endocrinologist: "Endocrinologist",
  fertility: "Fertility specialist",
  dermatologist: "Dermatologist",
  nutrition: "Nutrition specialist",
  emergency: "Emergency care",
};

const rankingToClinicSpecialty = (specialty: RankedSpecialty): ClinicSpecialty | null => {
  if (specialty === "emergency") return null;
  return specialty;
};

const detectPromptToolIntent = (userPrompt: string): ToolTab | null => {
  const prompt = userPrompt.toLowerCase();

  if (
    /which\s+(doctor|specialist)|what\s+doctor|better\s+doctor|doctor\s+to\s+consult|consult\s+(a\s+)?doctor|find\s+(a\s+)?doctor|specialist|clinic|nearby\s+doctor|doctor\s+finder/i.test(
      prompt,
    )
  ) {
    return "doctors";
  }

  if (/what[-\s]?if|simulation|planner|plan\s+my|lifestyle\s+plan|sleep\s+plan|diet\s+plan|stress\s+plan/i.test(prompt)) {
    return "whatif";
  }

  if (/health\s*twin|drift|trend|timeline|marker\s+trend|worsening\s+marker|report\s+trend/i.test(prompt)) {
    return "twin";
  }

  return null;
};

const makeStarterAssistantMessage = (): CareMessage => ({
  id: makeLocalId(),
  role: "assistant",
  content:
    "I am your Care Copilot. I can ask symptom follow-ups, track trend changes, run what-if planning, and help shortlist nearby specialists.",
  createdAt: new Date().toISOString(),
});

const isPermissionDeniedError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;

  const maybeCode = "code" in error ? String((error as { code?: unknown }).code || "") : "";
  const maybeMessage = "message" in error ? String((error as { message?: unknown }).message || "") : "";

  return (
    maybeCode.toLowerCase().includes("permission-denied") ||
    maybeMessage.toLowerCase().includes("missing or insufficient permissions")
  );
};

const CareCopilot = () => {
  const { toast } = useToast();
  const { user, isConfigured } = useAuth();

  const [provider, setProvider] = useState<Provider>("groq");
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [evidenceMode, setEvidenceMode] = useState(true);
  const [autoApplySpecialistPriority, setAutoApplySpecialistPriority] = useState(true);

  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<CareMessage[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [sending, setSending] = useState(false);
  const [latestCopilotResponse, setLatestCopilotResponse] = useState<CopilotApiResponse | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [activeToolTab, setActiveToolTab] = useState<ToolTab>("whatif");
  const [suggestedTool, setSuggestedTool] = useState<ToolTab | null>(null);

  const [snapshots, setSnapshots] = useState<ReportSnapshot[]>([]);

  const [baselineRisk, setBaselineRisk] = useState(45);
  const [sleepHours, setSleepHours] = useState(7.5);
  const [activityMinutes, setActivityMinutes] = useState(30);
  const [dietQuality, setDietQuality] = useState(7);
  const [stressLevel, setStressLevel] = useState(5);
  const [simInitialized, setSimInitialized] = useState(false);

  const [specialty, setSpecialty] = useState<ClinicSpecialty>("gynecologist");
  const [location, setLocation] = useState("");
  const [clinics, setClinics] = useState<ClinicResult[]>([]);
  const [searchingClinics, setSearchingClinics] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [mapError, setMapError] = useState("");

  const mapRootRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  const trackerContext = useMemo(() => buildTrackerContext(snapshots), [snapshots]);
  const healthTwin = useMemo(() => buildHealthTwin(snapshots), [snapshots]);

  const healthTwinChartData = useMemo(
    () =>
      healthTwin.timeline.map((point) => {
        const parsed = new Date(point.date);
        const dateLabel = Number.isNaN(parsed.getTime())
          ? point.date
          : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });

        return {
          ...point,
          dateLabel,
        };
      }),
    [healthTwin.timeline],
  );

  const topMapCompatibleSpecialty = useMemo(() => {
    if (!latestCopilotResponse?.specialistRankings?.length) return null;

    for (const ranking of latestCopilotResponse.specialistRankings) {
      const mapped = rankingToClinicSpecialty(ranking.specialty);
      if (mapped) return mapped;
    }

    return null;
  }, [latestCopilotResponse]);

  const simulationResult = useMemo(
    () =>
      simulateWhatIfPlan({
        baselineRisk,
        sleepHours,
        activityMinutesPerDay: activityMinutes,
        dietQuality,
        stressLevel,
      }),
    [activityMinutes, baselineRisk, dietQuality, sleepHours, stressLevel],
  );

  useEffect(() => {
    if (simInitialized || snapshots.length === 0) return;

    const latest = snapshots
      .slice()
      .sort((a, b) => a.testDate.localeCompare(b.testDate))
      .at(-1);

    if (!latest) return;

    const abnormal = latest.markers.filter((marker) => marker.status === "high" || marker.status === "low").length;
    const total = Math.max(1, latest.markers.length);
    const score = clamp(Math.round((abnormal / total) * 100), 20, 85);

    setBaselineRisk(score);
    setSimInitialized(true);
  }, [simInitialized, snapshots]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  const speakText = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      toast({ title: "Speech not supported", description: "Your browser does not support speech synthesis." });
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.98;
    utterance.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [toast]);

  const loadUserData = useCallback(async () => {
    if (!user) {
      setSnapshots([]);
      setMessages([]);
      return;
    }

    setLoadingData(true);

    try {
      const [reportResult, chatResult] = await Promise.allSettled([
        getReportSnapshots(user.uid),
        getCareMessages(user.uid),
      ]);

      if (reportResult.status === "fulfilled") {
        setSnapshots(reportResult.value);
      } else {
        setSnapshots([]);
      }

      if (chatResult.status === "fulfilled" && chatResult.value.length > 0) {
        setMessages(chatResult.value);
      } else {
        setMessages([makeStarterAssistantMessage()]);
      }

      const reportError = reportResult.status === "rejected" ? reportResult.reason : null;
      const chatError = chatResult.status === "rejected" ? chatResult.reason : null;
      const hasPermissionIssue = isPermissionDeniedError(reportError) || isPermissionDeniedError(chatError);

      if (hasPermissionIssue) {
        toast({
          title: "Firestore rules needed",
          description:
            "Missing permissions for one or more collections. Add rules for users/{uid}/labReports and users/{uid}/careCopilotMessages.",
          variant: "destructive",
        });
        return;
      }

      if (reportError || chatError) {
        const message =
          (reportError instanceof Error && reportError.message) ||
          (chatError instanceof Error && chatError.message) ||
          "Could not load full care copilot context.";

        toast({ title: "Load warning", description: message, variant: "destructive" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load care copilot context.";
      toast({ title: "Load failed", description: message, variant: "destructive" });
      setSnapshots([]);
      setMessages([makeStarterAssistantMessage()]);
    } finally {
      setLoadingData(false);
    }
  }, [toast, user]);

  useEffect(() => {
    void loadUserData();
  }, [loadUserData]);

  const localFallback = useCallback((userMessage: string) => {
    const trendLine = trackerContext.summary;
    const urgencyText =
      trackerContext.riskSignal === "escalating"
        ? "Your report trend looks worsening, so clinical follow-up should be scheduled soon."
        : trackerContext.riskSignal === "watch"
          ? "Your trend needs monitoring with repeat tracking and clinician review if symptoms persist."
          : "Your trend appears relatively stable, continue regular monitoring.";

    return `${urgencyText} ${trendLine} Based on your what-if plan, projected risk is ${simulationResult.projectedRisk} (${simulationResult.delta >= 0 ? "+" : ""}${simulationResult.delta}). You asked: ${userMessage}`;
  }, [simulationResult.delta, simulationResult.projectedRisk, trackerContext.riskSignal, trackerContext.summary]);

  const sendMessage = useCallback(async (rawText: string) => {
    if (!user) return;

    const text = rawText.trim();
    if (!text || sending) return;

    const userMessage: CareMessage = {
      id: makeLocalId(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };

    const historyForApi = [...messages, userMessage]
      .slice(-12)
      .map((item) => ({ role: item.role, content: item.content }));

    setMessages((prev) => [...prev, userMessage]);
    setChatInput("");

    try {
      await saveCareMessage(user.uid, { role: "user", content: text });
    } catch {
      // Avoid blocking the response flow if local save fails once.
    }

    setSending(true);

    try {
      const response = await fetch("/api/care-copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          payload: {
            message: text,
            evidenceMode,
            history: historyForApi,
            trackerContext,
            healthTwinContext: {
              summary: healthTwin.summary,
              latestLevel: healthTwin.latestLevel,
              driftAlerts: healthTwin.driftAlerts,
            },
            whatIfContext: {
              baselineRisk,
              projectedRisk: simulationResult.projectedRisk,
              delta: simulationResult.delta,
              riskBand: simulationResult.riskBand,
            },
          },
        }),
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => ({}))) as { error?: string; details?: string[] };
        const detail = errorPayload.details?.[0];
        throw new Error(detail || errorPayload.error || "Copilot endpoint is unavailable.");
      }

      const json = (await response.json()) as CopilotApiResponse;
      setLatestCopilotResponse(json);

      const promptToolIntent = detectPromptToolIntent(text);
      if (promptToolIntent) {
        setSuggestedTool(promptToolIntent);
        setActiveToolTab(promptToolIntent);
        setToolsOpen(true);
      } else {
        setSuggestedTool(null);
      }

      const triagePrefix =
        json.triageLevel === "urgent"
          ? "Urgency: Urgent. "
          : json.triageLevel === "soon"
            ? "Urgency: See doctor soon. "
            : "Urgency: Routine follow-up. ";

      const assistantText = `${triagePrefix}${json.reply}`;

      const assistantMessage: CareMessage = {
        id: makeLocalId(),
        role: "assistant",
        content: assistantText,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      try {
        await saveCareMessage(user.uid, { role: "assistant", content: assistantText });
      } catch {
        // Non-blocking persistence failure.
      }

      const providerUsed = json.providerUsed || provider;
      toast({ title: "Copilot replied", description: `Generated with ${providerLabelMap[providerUsed]}.` });

      if (autoSpeak) {
        speakText(assistantText);
      }
    } catch (error) {
      const fallbackText = localFallback(text);

      setLatestCopilotResponse({
        reply: fallbackText,
        followUpQuestions: [],
        recommendedDoctorTypes: ["Gynecologist", "Endocrinologist"],
        specialistRankings: [],
        actionChecklist: [
          "Track cycle and symptom changes weekly.",
          "Review recent lab timeline with your clinician.",
          "Seek earlier follow-up if symptoms worsen.",
        ],
        triageLevel: trackerContext.riskSignal === "escalating" ? "soon" : "routine",
        triageReason: "Fallback triage based on local trend context.",
        confidence: "medium",
        evidenceCards: [],
        nextBestTests: [],
      });

      const promptToolIntent = detectPromptToolIntent(text);
      if (promptToolIntent) {
        setSuggestedTool(promptToolIntent);
        setActiveToolTab(promptToolIntent);
        setToolsOpen(true);
      } else {
        setSuggestedTool(null);
      }

      const fallbackMessage: CareMessage = {
        id: makeLocalId(),
        role: "assistant",
        content: fallbackText,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, fallbackMessage]);

      try {
        await saveCareMessage(user.uid, { role: "assistant", content: fallbackText });
      } catch {
        // Ignore save issue for fallback mode.
      }

      const message = error instanceof Error ? error.message : "Unable to reach care copilot service.";
      toast({
        title: "Using local fallback",
        description: `${message} Showing context-aware fallback guidance.`,
      });

      if (autoSpeak) {
        speakText(fallbackText);
      }
    } finally {
      setSending(false);
    }
  }, [
    autoSpeak,
    baselineRisk,
    evidenceMode,
    healthTwin.driftAlerts,
    healthTwin.latestLevel,
    healthTwin.summary,
    localFallback,
    messages,
    provider,
    sending,
    simulationResult.delta,
    simulationResult.projectedRisk,
    simulationResult.riskBand,
    speakText,
    toast,
    trackerContext,
    user,
  ]);

  const handleSubmitChat = useCallback(async () => {
    await sendMessage(chatInput);
  }, [chatInput, sendMessage]);

  const handleUseCurrentLocation = async () => {
    if (!navigator.geolocation) {
      toast({ title: "Location unsupported", description: "Geolocation is not available in this browser." });
      return;
    }

    setLocationBusy(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });

      const { latitude, longitude } = position.coords;
      const reverseUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`;
      const reverseResponse = await fetch(reverseUrl, { headers: { Accept: "application/json" } });

      if (!reverseResponse.ok) {
        setLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        return;
      }

      const reverseJson = (await reverseResponse.json()) as {
        address?: {
          city?: string;
          town?: string;
          village?: string;
          state?: string;
          country?: string;
        };
      };

      const label = [
        reverseJson.address?.city || reverseJson.address?.town || reverseJson.address?.village || "",
        reverseJson.address?.state || "",
        reverseJson.address?.country || "",
      ]
        .filter(Boolean)
        .join(", ");

      setLocation(label || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
    } catch {
      toast({ title: "Location unavailable", description: "Could not fetch current location. Enter city manually." });
    } finally {
      setLocationBusy(false);
    }
  };

  const handleFindClinics = async () => {
    setSearchingClinics(true);
    setMapError("");

    const effectiveSpecialty =
      autoApplySpecialistPriority && topMapCompatibleSpecialty ? topMapCompatibleSpecialty : specialty;

    if (effectiveSpecialty !== specialty) {
      setSpecialty(effectiveSpecialty);
    }

    try {
      const results = await findNearbyClinics({ location, specialty: effectiveSpecialty, limit: 8 });
      setClinics(results);

      if (results.length === 0) {
        toast({
          title: "No results found",
          description: "Try a nearby city or a broader specialty.",
        });
      } else {
        toast({
          title: "Clinics loaded",
          description: `${results.length} places found for ${specialtyLabelMap[effectiveSpecialty]}.`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Clinic search failed.";
      setMapError(message);
      toast({ title: "Clinic search failed", description: message, variant: "destructive" });
    } finally {
      setSearchingClinics(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const mountMap = async () => {
      if (!mapRootRef.current || clinics.length === 0) {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }
        return;
      }

      try {
        const L = await loadLeaflet();
        if (cancelled || !mapRootRef.current) return;

        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }

        const map = L.map(mapRootRef.current);
        mapInstanceRef.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);

        const points: Array<[number, number]> = [];

        clinics.forEach((clinic) => {
          points.push([clinic.lat, clinic.lon]);

          const popupHtml = `
            <div style="max-width: 220px; font-size: 12px; line-height: 1.35;">
              <strong>${escapeHtml(clinic.name)}</strong><br/>
              <span>${escapeHtml(clinic.address)}</span>
            </div>
          `;

          L.marker([clinic.lat, clinic.lon]).addTo(map).bindPopup(popupHtml);
        });

        if (points.length === 1) {
          map.setView(points[0], 13);
        } else {
          const bounds = L.latLngBounds(points);
          map.fitBounds(bounds, { padding: [20, 20] });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Map failed to load.";
        setMapError(message);
      }
    };

    void mountMap();

    return () => {
      cancelled = true;
    };
  }, [clinics]);

  useEffect(() => () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
  }, []);

  const copyVisitBrief = async () => {
    const lines = [
      "OvaCare Visit Brief",
      `Trend signal: ${trackerContext.riskSignal}`,
      `Trend summary: ${trackerContext.summary}`,
      `What-if baseline risk: ${baselineRisk}`,
      `What-if projected risk: ${simulationResult.projectedRisk} (${simulationResult.delta >= 0 ? "+" : ""}${simulationResult.delta})`,
      `Sleep plan: ${sleepHours}h/day target`,
      `Activity plan: ${activityMinutes} min/day target`,
      `Diet quality target: ${dietQuality}/10`,
      `Stress target: ${stressLevel}/10`,
      "Bring this summary to your clinician for personalized advice.",
    ];

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast({ title: "Visit brief copied", description: "You can paste this into notes or share with your doctor." });
    } catch {
      toast({ title: "Copy failed", description: "Could not copy text to clipboard.", variant: "destructive" });
    }
  };

  if (!isConfigured) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Firebase not configured</CardTitle>
            <CardDescription>Set VITE_FIREBASE variables to enable Care Copilot storage and sync.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-10">
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle>Sign in to open Care Copilot</CardTitle>
            <CardDescription>
              Care Copilot uses your report history as context and syncs assistant conversations securely.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild className="gradient-primary border-0">
              <Link to="/login">Log in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/signup">Create account</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-4.5rem)] bg-gradient-to-b from-background via-background to-muted/30">
      <div className="mx-auto flex w-full max-w-5xl flex-col px-4 pb-24 pt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground md:text-3xl">Care Copilot</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              A focused conversation surface. Smart tools stay tucked away until needed.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Trend: {trackerContext.riskSignal}</Badge>
            <Select value={provider} onValueChange={(value) => setProvider(value as Provider)}>
              <SelectTrigger className="h-8 w-44">
                <SelectValue placeholder="AI provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="groq">{providerLabelMap.groq}</SelectItem>
                <SelectItem value="openrouter">{providerLabelMap.openrouter}</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1">
              <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
              <Switch checked={evidenceMode} onCheckedChange={setEvidenceMode} />
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1">
              <Mic className="h-3.5 w-3.5 text-muted-foreground" />
              <Switch checked={autoSpeak} onCheckedChange={setAutoSpeak} />
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/tracker">Tracker</Link>
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card/50 shadow-sm backdrop-blur">
          <div className="flex h-[72vh] flex-col">
            <ScrollArea className="flex-1 px-3 py-4 md:px-6">
              <div className="space-y-5">
                {loadingData ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading conversation and report context...
                  </div>
                ) : (
                  messages.map((message) => (
                    <div key={message.id} className={`flex ${message.role === "assistant" ? "justify-start" : "justify-end"}`}>
                      <div className="flex max-w-[92%] items-start gap-2 md:max-w-[85%]">
                        {message.role === "assistant" ? (
                          <div className="mt-1 rounded-full border border-border bg-background p-1.5">
                            <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        ) : null}
                        <div
                          className={`rounded-2xl border px-3 py-2 text-sm leading-relaxed ${
                            message.role === "assistant"
                              ? "border-border bg-background text-foreground"
                              : "border-primary/30 bg-primary/10 text-foreground"
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{message.content}</p>
                          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                            <span>{formatMessageTime(message.createdAt)}</span>
                            {message.role === "assistant" && (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted"
                                onClick={() => speakText(message.content)}
                              >
                                <Volume2 className="h-3.5 w-3.5" /> Speak
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messageEndRef} />
              </div>
            </ScrollArea>

            {latestCopilotResponse && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                <Badge variant={latestCopilotResponse.triageLevel === "urgent" ? "destructive" : "secondary"}>
                  Triage: {latestCopilotResponse.triageLevel}
                </Badge>
                <Badge variant="outline">Confidence: {latestCopilotResponse.confidence}</Badge>
                {latestCopilotResponse.providerUsed && (
                  <Badge variant="outline">{providerLabelMap[latestCopilotResponse.providerUsed]}</Badge>
                )}
                {suggestedTool && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={() => {
                      setActiveToolTab(suggestedTool);
                      setToolsOpen(true);
                    }}
                  >
                    <Sparkles className="mr-1 h-3.5 w-3.5" /> AI suggests {toolTabLabelMap[suggestedTool]}
                  </Button>
                )}
              </div>
            )}

            <div className="border-t border-border bg-background/95 p-3 md:p-4">
              <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
                {quickPrompts.map((prompt) => (
                  <Button
                    key={prompt}
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => void sendMessage(prompt)}
                    disabled={sending}
                  >
                    <Sparkles className="mr-1 h-3.5 w-3.5" /> {prompt}
                  </Button>
                ))}
              </div>

              <div className="rounded-2xl border border-border bg-background p-2">
                <Label htmlFor="care-chat" className="sr-only">Chat prompt</Label>
                <Textarea
                  id="care-chat"
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Ask about symptoms, reports, or next steps..."
                  rows={3}
                  className="min-h-[92px] resize-none border-0 bg-transparent px-2 py-2 focus-visible:ring-0"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={copyVisitBrief}>
                      <Copy className="mr-1 h-4 w-4" /> Visit brief
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setMessages((prev) => prev.slice(-4))}
                      title="Keeps only last few messages locally"
                    >
                      Keep recent
                    </Button>
                  </div>
                  <Button
                    className="gradient-primary border-0"
                    onClick={() => void handleSubmitChat()}
                    disabled={sending || !chatInput.trim()}
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />} Send
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Sheet open={toolsOpen} onOpenChange={setToolsOpen}>
        <SheetTrigger asChild>
          <Button
            className="fixed bottom-6 right-6 z-40 h-11 rounded-full px-4 shadow-lg"
            variant="secondary"
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" /> Tools
          </Button>
        </SheetTrigger>

        <SheetContent side="right" className="w-full overflow-y-auto px-5 sm:max-w-2xl">
          <SheetHeader className="pr-8">
            <SheetTitle>Smart Tools</SheetTitle>
            <SheetDescription>
              Hidden by default for a clean chat-first interface. Open only when needed.
            </SheetDescription>
          </SheetHeader>

          {latestCopilotResponse && (
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs font-semibold text-foreground">Latest copilot actions</p>
              <p className="mt-1 text-xs text-muted-foreground">{latestCopilotResponse.triageReason}</p>
              {latestCopilotResponse.specialistRankings.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {latestCopilotResponse.specialistRankings.slice(0, 3).map((item) => (
                    <Badge key={`${item.specialty}-${item.score}`} variant="outline">
                      {rankedSpecialtyLabelMap[item.specialty]} {item.score.toFixed(1)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {suggestedTool && (
            <div className="mt-3 rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-foreground">
              AI auto-suggested tool: <span className="font-semibold">{toolTabLabelMap[suggestedTool]}</span>
            </div>
          )}

          <Tabs value={activeToolTab} onValueChange={(value) => setActiveToolTab(value as ToolTab)} className="mt-4 w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="whatif">What-if Planner</TabsTrigger>
              <TabsTrigger value="doctors">Doctor Finder</TabsTrigger>
              <TabsTrigger value="twin">Health Twin</TabsTrigger>
            </TabsList>

            <TabsContent value="whatif" className="space-y-4 pt-2">
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Baseline risk</span>
                  <span>{baselineRisk}</span>
                </div>
                <Slider value={[baselineRisk]} onValueChange={(values) => setBaselineRisk(values[0])} min={0} max={100} step={1} />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Sleep (hours/night)</span>
                  <span>{sleepHours.toFixed(1)}h</span>
                </div>
                <Slider value={[sleepHours]} onValueChange={(values) => setSleepHours(values[0])} min={4} max={10} step={0.5} />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Activity (minutes/day)</span>
                  <span>{activityMinutes} min</span>
                </div>
                <Slider value={[activityMinutes]} onValueChange={(values) => setActivityMinutes(values[0])} min={0} max={90} step={5} />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Diet quality</span>
                  <span>{dietQuality}/10</span>
                </div>
                <Slider value={[dietQuality]} onValueChange={(values) => setDietQuality(values[0])} min={1} max={10} step={1} />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Stress level</span>
                  <span>{stressLevel}/10</span>
                </div>
                <Slider value={[stressLevel]} onValueChange={(values) => setStressLevel(values[0])} min={1} max={10} step={1} />
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-sm font-semibold text-foreground">
                  Projected risk: {simulationResult.projectedRisk}
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({simulationResult.delta >= 0 ? "+" : ""}{simulationResult.delta})
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Band: {simulationResult.riskBand}</p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {simulationResult.explanation.map((line) => (
                    <li key={line}>- {line}</li>
                  ))}
                </ul>
                <Button
                  className="mt-3 w-full"
                  variant="outline"
                  onClick={() =>
                    void sendMessage(
                      `Use this what-if scenario to build a practical 30-day plan. Baseline risk ${baselineRisk}, projected ${simulationResult.projectedRisk}, sleep ${sleepHours}h, activity ${activityMinutes} min/day, diet quality ${dietQuality}/10, stress ${stressLevel}/10.`,
                    )
                  }
                  disabled={sending}
                >
                  Send Scenario to Copilot
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="doctors" className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="clinic-location">City or area</Label>
                <div className="flex gap-2">
                  <Input
                    id="clinic-location"
                    placeholder="Example: Hyderabad"
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                  />
                  <Button variant="outline" onClick={handleUseCurrentLocation} disabled={locationBusy}>
                    {locationBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Specialist type</Label>
                <Select value={specialty} onValueChange={(value) => setSpecialty(value as ClinicSpecialty)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose specialty" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gynecologist">Gynecologist</SelectItem>
                    <SelectItem value="endocrinologist">Endocrinologist</SelectItem>
                    <SelectItem value="fertility">Fertility specialist</SelectItem>
                    <SelectItem value="dermatologist">Dermatologist</SelectItem>
                    <SelectItem value="nutrition">Nutrition specialist</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Auto-use copilot ranked specialist before search</p>
                  <Switch checked={autoApplySpecialistPriority} onCheckedChange={setAutoApplySpecialistPriority} />
                </div>

                {topMapCompatibleSpecialty && latestCopilotResponse?.specialistRankings?.length ? (
                  <div className="rounded-md border border-border bg-background px-3 py-2">
                    <p className="text-xs text-muted-foreground">
                      Top recommended: <span className="font-medium text-foreground">{specialtyLabelMap[topMapCompatibleSpecialty]}</span>
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setSpecialty(topMapCompatibleSpecialty)}>
                        Apply Recommendation
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void sendMessage(
                            `Explain why ${specialtyLabelMap[topMapCompatibleSpecialty]} is currently prioritized for my case and what to ask in first visit.`,
                          )
                        }
                        disabled={sending}
                      >
                        Why this?
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex gap-2">
                <Button className="gradient-primary w-full border-0" onClick={handleFindClinics} disabled={searchingClinics}>
                  {searchingClinics ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />} Find Clinics
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    void sendMessage(
                      `Based on my trend signal (${trackerContext.riskSignal}) and latest context, which specialist should I prioritize first: gynecologist, endocrinologist, fertility specialist, dermatologist, or nutrition specialist?`,
                    )
                  }
                  disabled={sending}
                >
                  <Stethoscope className="h-4 w-4" />
                </Button>
              </div>

              {mapError && <p className="text-xs text-destructive">{mapError}</p>}

              <div className="h-64 overflow-hidden rounded-xl border border-border bg-muted/20">
                {clinics.length === 0 ? (
                  <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                    Search a city and specialty to render clinics on map.
                  </div>
                ) : (
                  <div ref={mapRootRef} className="h-full w-full" />
                )}
              </div>

              <div className="max-h-64 space-y-2 overflow-auto pr-1">
                {clinics.map((clinic) => (
                  <div key={clinic.id} className="rounded-lg border border-border bg-background p-3">
                    <p className="text-sm font-medium text-foreground">{clinic.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{clinic.address}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Type: {clinic.type}</p>
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {clinic.whyGood.map((reason) => (
                        <li key={reason}>- {reason}</li>
                      ))}
                    </ul>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <a
                        href={clinic.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                      >
                        Open in map source
                      </a>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void sendMessage(
                            `I found this ${specialtyLabelMap[specialty]} option: ${clinic.name} at ${clinic.address}. Help me ask smart screening questions before booking.`,
                          )
                        }
                        disabled={sending}
                      >
                        <Bot className="mr-1 h-3.5 w-3.5" /> Ask Copilot
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="twin" className="space-y-4 pt-2">
              {healthTwinChartData.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Save at least two report snapshots in Analyzer to unlock health twin drift analytics.
                </p>
              ) : (
                <>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs font-semibold text-foreground">Current Twin Level: {healthTwin.latestLevel}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{healthTwin.summary}</p>
                  </div>

                  <div className="h-52 rounded-lg border border-border bg-background p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={healthTwinChartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="driftScore" stroke="#0ea5e9" strokeWidth={2.2} name="Drift score" />
                        <Line type="monotone" dataKey="outOfRange" stroke="#f97316" strokeWidth={1.8} name="Out-of-range" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="h-52 rounded-lg border border-border bg-background p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={healthTwinChartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Area type="monotone" dataKey="hormonalAbnormal" stroke="#ef4444" fill="#ef444433" name="Hormonal abnormal" />
                        <Area type="monotone" dataKey="metabolicAbnormal" stroke="#8b5cf6" fill="#8b5cf633" name="Metabolic abnormal" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="space-y-2 rounded-lg border border-border bg-background p-3">
                    <p className="text-xs font-semibold text-foreground">Drift Alerts</p>
                    {healthTwin.driftAlerts.map((alert) => (
                      <div key={alert} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-amber-500" />
                        <span>{alert}</span>
                      </div>
                    ))}
                  </div>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() =>
                      void sendMessage(
                        `Use my Health Twin drift summary to prioritize care: ${healthTwin.summary}. Alerts: ${healthTwin.driftAlerts.join(" ")}`,
                      )
                    }
                    disabled={sending}
                  >
                    <FlaskConical className="mr-1 h-4 w-4" /> Generate Twin-Based Plan
                  </Button>
                </>
              )}
            </TabsContent>
          </Tabs>

          <Card className="mt-5">
            <CardHeader>
              <CardTitle className="text-base">Live Context</CardTitle>
              <CardDescription>
                Copilot context auto-updates from report tracker and simulation settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>{trackerContext.summary}</p>
              <p>Worsening markers tracked: {trackerContext.worseningMarkers.length}</p>
              <p>Improving markers tracked: {trackerContext.improvingMarkers.length}</p>
              <p>Simulation doctor prompt: {simulationResult.doctorPrompt}</p>
            </CardContent>
          </Card>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default CareCopilot;
