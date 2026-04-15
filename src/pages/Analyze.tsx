import { useMemo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Upload, FileText, AlertCircle, X, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { extractMeaningfulLabData, type LabExtractionResult, type LabMarker } from "@/lib/labReportParser";

type Provider = "groq" | "openrouter";

type LabInsight = {
  summary: string;
  averageStatus: string;
  keyFindings: string[];
  practicalGuidance: string[];
  doctorQuestions: string[];
  disclaimer: string;
  providerUsed?: Provider;
};

const providerLabelMap: Record<Provider, string> = {
  groq: "OvaCare Model 1.09",
  openrouter: "OvaCare Model 1.21",
};

const statusColorMap: Record<LabMarker["status"], string> = {
  high: "#ef4444",
  low: "#f97316",
  normal: "#22c55e",
  unknown: "#64748b",
};

const statusLabelMap: Record<LabMarker["status"], string> = {
  high: "High",
  low: "Low",
  normal: "Normal",
  unknown: "Review",
};

const fallbackInsight = (markers: LabMarker[]): LabInsight => {
  const total = Math.max(1, markers.length);
  const abnormal = markers.filter((m) => m.status === "high" || m.status === "low");
  const normalCount = markers.filter((m) => m.status === "normal").length;
  const normalRatio = normalCount / total;

  const averageStatus =
    normalRatio >= 0.75
      ? "On average, most extracted markers appear within their listed reference ranges, though clinical context is still important."
      : "On average, several markers may be outside listed reference ranges and should be reviewed with a healthcare professional.";

  return {
    summary:
      "This report review is informational. Some blood markers may be associated with metabolic or hormonal patterns that should be clinically evaluated alongside symptoms and medical history.",
    averageStatus,
    keyFindings:
      abnormal.length > 0
        ? abnormal.slice(0, 5).map((m) => `${m.name} appears ${m.status} compared with its stated reference interval.`)
        : ["No clearly abnormal marker was detected from the extracted values."] ,
    practicalGuidance: [
      "Track symptoms (cycle pattern, fatigue, skin/hair changes, weight trend) alongside lab values.",
      "Repeat or confirm abnormal values if recommended by your clinician.",
      "Prioritize sleep, balanced meals, activity, and hydration while awaiting clinical interpretation.",
    ],
    doctorQuestions: [
      "Which abnormal markers are clinically significant in my context?",
      "Should I repeat these tests or add hormone/metabolic testing?",
      "What follow-up timeline is recommended for monitoring?",
    ],
    disclaimer:
      "This report explanation is for informational purposes only and does not replace professional medical advice, diagnosis, or treatment.",
  };
};

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to load image for OCR enhancement."));
    };
    image.src = url;
  });

const createEnhancedImageDataUrl = async (file: File) => {
  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx) {
    throw new Error("Canvas context unavailable for OCR enhancement.");
  }

  const baseWidth = Math.max(image.width, 1400);
  const scale = Math.min(2.5, Math.max(1.5, baseWidth / image.width));
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);

  canvas.width = width;
  canvas.height = height;

  ctx.filter = "grayscale(1) contrast(180%) brightness(115%)";
  ctx.drawImage(image, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  let graySum = 0;
  for (let i = 0; i < data.length; i += 4) {
    graySum += data[i];
  }
  const grayMean = graySum / (data.length / 4);
  const threshold = grayMean * 0.96;

  for (let i = 0; i < data.length; i += 4) {
    const value = data[i];
    const contrasted = (value - 128) * 1.8 + 128;
    const leveled = contrasted > threshold ? contrasted + 24 : contrasted - 20;
    const normalized = Math.max(0, Math.min(255, leveled));

    data[i] = normalized;
    data[i + 1] = normalized;
    data[i + 2] = normalized;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
};

const scoreExtraction = (result: LabExtractionResult) => {
  const rangeMarkers = result.markers.filter((marker) => marker.refMin != null && marker.refMax != null).length;

  return (
    result.markers.length * 6 +
    rangeMarkers * 8 +
    result.labSignalLines * 3 +
    result.medicalMarkerHits * 4 +
    (result.possibleReport ? 25 : 0)
  );
};

const Analyze = () => {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [extraction, setExtraction] = useState<LabExtractionResult | null>(null);
  const [note, setNote] = useState("");
  const [provider, setProvider] = useState<Provider>("groq");
  const [insightLoading, setInsightLoading] = useState(false);
  const [insight, setInsight] = useState<LabInsight | null>(null);
  const [showAllMarkers, setShowAllMarkers] = useState(false);
  const { toast } = useToast();

  const accept = ["image/jpeg", "image/png", "image/webp"];

  const markerStats = useMemo(() => {
    if (!extraction) {
      return { normal: 0, low: 0, high: 0, unknown: 0, total: 0 };
    }

    return extraction.markers.reduce(
      (acc, marker) => {
        acc[marker.status] += 1;
        acc.total += 1;
        return acc;
      },
      { normal: 0, low: 0, high: 0, unknown: 0, total: 0 },
    );
  }, [extraction]);

  const statusPieData = useMemo(
    () => [
      { name: "Normal", value: markerStats.normal, fill: statusColorMap.normal },
      { name: "Low", value: markerStats.low, fill: statusColorMap.low },
      { name: "High", value: markerStats.high, fill: statusColorMap.high },
      { name: "Review", value: markerStats.unknown, fill: statusColorMap.unknown },
    ].filter((item) => item.value > 0),
    [markerStats.high, markerStats.low, markerStats.normal, markerStats.unknown],
  );

  const abnormalChartData = useMemo(() => {
    if (!extraction) return [];

    const items = extraction.markers
      .filter((marker) => marker.status === "high" || marker.status === "low")
      .map((marker) => {
        const range =
          marker.refMin != null && marker.refMax != null && marker.refMax > marker.refMin
            ? marker.refMax - marker.refMin
            : null;

        let deviation = 0;
        if (range && marker.refMax != null && marker.refMin != null) {
          if (marker.status === "high") {
            deviation = ((marker.value - marker.refMax) / range) * 100;
          } else if (marker.status === "low") {
            deviation = ((marker.refMin - marker.value) / range) * 100;
          }
        }

        return {
          name: marker.name.length > 16 ? `${marker.name.slice(0, 16)}...` : marker.name,
          fullName: marker.name,
          deviation: Number(deviation.toFixed(1)),
          status: marker.status,
        };
      })
      .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));

    return items.slice(0, 8);
  }, [extraction]);

  const visibleMarkers = useMemo(() => {
    if (!extraction) return [];
    return showAllMarkers ? extraction.markers : extraction.markers.slice(0, 12);
  }, [extraction, showAllMarkers]);

  const handleFile = useCallback((f: File) => {
    if (!accept.includes(f.type)) {
      toast({ title: "Unsupported file", description: "Please upload JPG, PNG, or WEBP images.", variant: "destructive" });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 10 MB.", variant: "destructive" });
      return;
    }
    setFile(f);
    setExtraction(null);
    setInsight(null);
    setShowAllMarkers(false);
  }, [toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const handleExtract = async () => {
    if (!file) return;

    let worker: Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>> | null = null;

    try {
      setOcrRunning(true);
      setOcrProgress(0);
      setInsight(null);

      const { createWorker } = await import("tesseract.js");
      worker = await createWorker("eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setOcrProgress(Math.round(m.progress * 100));
          }
        },
      });

      await worker.setParameters({ preserve_interword_spaces: "1" });

      let enhancedDataUrl: string | null = null;
      try {
        enhancedDataUrl = await createEnhancedImageDataUrl(file);
      } catch {
        enhancedDataUrl = null;
      }

      const ocrPasses: Array<{
        label: string;
        source: File | string;
        config?: Record<string, string>;
      }> = [
        { label: "default-p6", source: file, config: { tessedit_pageseg_mode: "6" } },
        { label: "default-p11", source: file, config: { tessedit_pageseg_mode: "11" } },
        { label: "default-p4", source: file, config: { tessedit_pageseg_mode: "4" } },
      ];

      if (enhancedDataUrl) {
        ocrPasses.push(
          { label: "enhanced-p6", source: enhancedDataUrl, config: { tessedit_pageseg_mode: "6" } },
          { label: "enhanced-p11", source: enhancedDataUrl, config: { tessedit_pageseg_mode: "11" } },
        );
      }

      let bestParsed: LabExtractionResult | null = null;
      let bestScore = Number.NEGATIVE_INFINITY;
      let bestLabel = "default";

      for (let i = 0; i < ocrPasses.length; i += 1) {
        const pass = ocrPasses[i];
        const progressBase = Math.round((i / ocrPasses.length) * 100);
        setOcrProgress(progressBase);

        const result = await worker.recognize(pass.source, pass.config);
        const parsed = extractMeaningfulLabData(result.data.text);
        const score = scoreExtraction(parsed);

        if (score > bestScore) {
          bestParsed = parsed;
          bestScore = score;
          bestLabel = pass.label;
        }

        if (parsed.possibleReport && parsed.markers.length >= 8 && score >= 75) {
          break;
        }
      }

      if (!bestParsed) {
        throw new Error("No OCR output was generated.");
      }

      const shouldAccept =
        bestParsed.possibleReport ||
        bestParsed.markers.length >= 6 ||
        bestParsed.medicalMarkerHits >= 2;

      if (!shouldAccept) {
        setExtraction(null);
        toast({
          title: "Image may not be a blood report",
          description: "Could not detect enough lab-specific markers. Try a clearer or more tightly cropped report image.",
          variant: "destructive",
        });
        return;
      }

      setExtraction(bestParsed);

      if (bestParsed.markers.length === 0) {
        toast({
          title: "No biomarkers detected",
          description: "Try a clearer image or higher contrast scan for better OCR quality.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Meaningful data extracted",
          description: `${bestParsed.markers.length} markers found (${bestLabel}). Sensitive lines were filtered automatically.`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "OCR extraction failed.";
      toast({ title: "Extraction failed", description: message, variant: "destructive" });
    } finally {
      if (worker) {
        await worker.terminate();
      }
      setOcrRunning(false);
      setOcrProgress(0);
    }
  };

  const handleGenerateInsight = async () => {
    if (!extraction || extraction.markers.length === 0) {
      toast({
        title: "No data to analyze",
        description: "Extract meaningful marker data first.",
        variant: "destructive",
      });
      return;
    }

    setInsightLoading(true);

    try {
      const response = await fetch("/api/lab-report-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          payload: {
            markers: extraction.markers,
            note,
          },
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string; details?: string[] };
        const detail = errorData.details?.[0] || errorData.error || "AI service unavailable.";
        throw new Error(detail);
      }

      const data = (await response.json()) as LabInsight;
      setInsight(data);
      toast({ title: "Insight generated", description: `Generated with ${providerLabelMap[data.providerUsed || provider]}.` });
    } catch (error) {
      const fallback = fallbackInsight(extraction.markers);
      setInsight(fallback);

      const message = error instanceof Error ? error.message : "AI explanation failed.";
      toast({
        title: "Using local explanation",
        description: `${message} Showing rule-based summary from extracted data.`,
      });
    } finally {
      setInsightLoading(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setExtraction(null);
    setInsight(null);
    setShowAllMarkers(false);
    setNote("");
  };

  return (
    <div className="container mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <FileText className="h-7 w-7 text-primary" />
        </div>
        <h1 className="font-heading text-2xl font-bold text-foreground md:text-3xl">Report Analyzer</h1>
        <p className="mt-2 text-muted-foreground">
          Upload blood test report images and extract only meaningful lab values for safe, structured explanation.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border bg-card p-5 shadow-card md:p-6"
      >
        {!file ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition-colors ${
              dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
            }`}
            onClick={() => document.getElementById("file-input")?.click()}
          >
            <Upload className="mb-4 h-10 w-10 text-muted-foreground" />
            <p className="mb-1 text-sm font-medium text-foreground">
              Drag and drop your blood report image here
            </p>
            <p className="text-xs text-muted-foreground">
              JPG, PNG, WEBP up to 10 MB
            </p>
            <input
              id="file-input"
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-xl bg-secondary p-4">
              <FileText className="h-8 w-8 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
              <button onClick={clearFile} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button className="gradient-primary border-0 shadow-soft" size="sm" onClick={() => void handleExtract()} disabled={ocrRunning}>
                {ocrRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {ocrRunning ? `Extracting ${ocrProgress}%` : "Extract Meaningful Data"}
              </Button>
              <Button variant="outline" size="sm" onClick={clearFile}>Choose another file</Button>
            </div>

            {extraction && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Card>
                    <CardHeader className="p-3 pb-1">
                      <CardDescription>Total Markers</CardDescription>
                      <CardTitle className="text-xl">{markerStats.total}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="p-3 pb-1">
                      <CardDescription>Normal</CardDescription>
                      <CardTitle className="text-xl text-green-600">{markerStats.normal}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="p-3 pb-1">
                      <CardDescription>Outside Range</CardDescription>
                      <CardTitle className="text-xl text-orange-600">{markerStats.low + markerStats.high}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="p-3 pb-1">
                      <CardDescription>PII Lines Filtered</CardDescription>
                      <CardTitle className="text-xl text-primary">{extraction.removedSensitiveLines}</CardTitle>
                    </CardHeader>
                  </Card>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-1">
                      <CardTitle className="text-base">Marker Status Distribution</CardTitle>
                    </CardHeader>
                    <CardContent className="h-64">
                      {statusPieData.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No chart data available.</p>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={statusPieData} dataKey="value" nameKey="name" outerRadius={84} label>
                              {statusPieData.map((entry) => (
                                <Cell key={entry.name} fill={entry.fill} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-1">
                      <CardTitle className="text-base">Most Deviated Markers</CardTitle>
                      <CardDescription>Approximate deviation from reference interval width</CardDescription>
                    </CardHeader>
                    <CardContent className="h-64">
                      {abnormalChartData.length === 0 ? (
                        <p className="text-sm text-muted-foreground">All extracted markers appear within range or no range provided.</p>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={abnormalChartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                            <YAxis tickFormatter={(v) => `${Math.abs(v)}%`} />
                            <Tooltip
                              formatter={(value: number) => `${Math.abs(value)}%`}
                              labelFormatter={(label, payload) =>
                                payload?.[0] && (payload[0].payload as { fullName: string }).fullName
                                  ? (payload[0].payload as { fullName: string }).fullName
                                  : label
                              }
                            />
                            <Bar dataKey="deviation" fill="#f97316" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Extracted Meaningful Data (PII-filtered)</CardTitle>
                    <CardDescription>
                      Only marker lines are kept. Patient identity fields are filtered before analysis.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Marker</TableHead>
                          <TableHead>Value</TableHead>
                          <TableHead>Reference Range</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleMarkers.map((marker) => (
                          <TableRow key={`${marker.name}-${marker.value}-${marker.unit}`}>
                            <TableCell className="font-medium">{marker.name}</TableCell>
                            <TableCell>
                              {marker.value} {marker.unit}
                            </TableCell>
                            <TableCell>
                              {marker.refMin != null && marker.refMax != null
                                ? `${marker.refMin} - ${marker.refMax} ${marker.unit}`
                                : "Not detected"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={marker.status === "high" ? "destructive" : marker.status === "normal" ? "secondary" : "outline"}
                                className="w-fit"
                              >
                                {statusLabelMap[marker.status]}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {extraction.markers.length > 12 && (
                      <div className="mt-3">
                        <Button variant="ghost" size="sm" onClick={() => setShowAllMarkers((v) => !v)}>
                          {showAllMarkers ? "Show fewer markers" : `Show all ${extraction.markers.length} markers`}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Generate Clinical Explanation</CardTitle>
                    <CardDescription>
                      We send only extracted biomarker values (not personal identity fields) to generate a plain-language explanation.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
                      <div className="space-y-1">
                        <Label>Model</Label>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={provider === "groq" ? "default" : "outline"}
                            className="w-full"
                            onClick={() => setProvider("groq")}
                          >
                            {providerLabelMap.groq}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={provider === "openrouter" ? "default" : "outline"}
                            className="w-full"
                            onClick={() => setProvider("openrouter")}
                          >
                            {providerLabelMap.openrouter}
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="clinical-note">Optional context note</Label>
                        <Textarea
                          id="clinical-note"
                          rows={2}
                          placeholder="Example: symptoms include fatigue and irregular cycles"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                        />
                      </div>
                      <Button className="gradient-primary border-0" onClick={() => void handleGenerateInsight()} disabled={insightLoading}>
                        {insightLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        Generate Insight
                      </Button>
                    </div>

                    {insight && (
                      <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                        <div>
                          <p className="text-xs font-semibold text-primary">Summary</p>
                          <p className="mt-1 text-sm text-foreground">{insight.summary}</p>
                        </div>

                        <div>
                          <p className="text-xs font-semibold text-primary">Average Interpretation</p>
                          <p className="mt-1 text-sm text-foreground">{insight.averageStatus}</p>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <p className="text-xs font-semibold text-primary">Key Findings</p>
                            <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                              {insight.keyFindings.map((item) => (
                                <li key={item}>- {item}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-primary">Practical Guidance</p>
                            <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                              {insight.practicalGuidance.map((item) => (
                                <li key={item}>- {item}</li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        <div>
                          <p className="text-xs font-semibold text-primary">Questions to Ask Your Doctor</p>
                          <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                            {insight.doctorQuestions.map((item) => (
                              <li key={item}>- {item}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="rounded-lg bg-card p-3">
                          <p className="text-xs font-semibold text-primary">Medical Disclaimer</p>
                          <p className="mt-1 text-xs text-muted-foreground">{insight.disclaimer}</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex items-start gap-2 rounded-xl bg-muted/50 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            OCR extraction prioritizes biomarker lines and filters common identity fields before AI explanation. This tool is informational and not a medical diagnosis.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Analyze;
