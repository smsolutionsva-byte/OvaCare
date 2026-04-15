import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  FileStack,
  Loader2,
  Sparkles,
  TrendingDown,
  TrendingUp,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { type LabMarker } from "@/lib/labReportParser";
import { getReportSnapshots, type ReportSnapshot } from "@/lib/reportTracker";

const formatDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const getOutOfRangeCount = (markers: LabMarker[]) =>
  markers.filter((marker) => marker.status === "high" || marker.status === "low").length;

const deviationFromRange = (marker: LabMarker) => {
  if (marker.refMin == null || marker.refMax == null) return 0;
  if (marker.value < marker.refMin) return marker.refMin - marker.value;
  if (marker.value > marker.refMax) return marker.value - marker.refMax;
  return 0;
};

const ReportTracker = () => {
  const { toast } = useToast();
  const { user, isConfigured } = useAuth();

  const [snapshots, setSnapshots] = useState<ReportSnapshot[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [selectedMarker, setSelectedMarker] = useState("");

  const loadSnapshots = useCallback(async () => {
    if (!user) {
      setSnapshots([]);
      return;
    }

    setLoadingSnapshots(true);
    try {
      const items = await getReportSnapshots(user.uid);
      setSnapshots(items);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load report history.";
      toast({ title: "Could not load history", description: message, variant: "destructive" });
    } finally {
      setLoadingSnapshots(false);
    }
  }, [toast, user]);

  useEffect(() => {
    void loadSnapshots();
  }, [loadSnapshots]);

  const sortedSnapshots = useMemo(
    () => [...snapshots].sort((a, b) => a.testDate.localeCompare(b.testDate)),
    [snapshots],
  );

  const latestSnapshot = sortedSnapshots.at(-1) ?? null;
  const previousSnapshot = sortedSnapshots.length > 1 ? sortedSnapshots[sortedSnapshots.length - 2] : null;

  const outOfRangeTrend = useMemo(
    () =>
      sortedSnapshots.map((snapshot) => ({
        date: formatDate(snapshot.testDate),
        outOfRange: getOutOfRangeCount(snapshot.markers),
        total: snapshot.markers.length,
      })),
    [sortedSnapshots],
  );

  const markerTimelineMap = useMemo(() => {
    const map = new Map<string, Array<{ date: string; value: number; refMin: number | null; refMax: number | null }>>();

    for (const snapshot of sortedSnapshots) {
      for (const marker of snapshot.markers) {
        const key = marker.name;
        const next = map.get(key) || [];
        next.push({
          date: formatDate(snapshot.testDate),
          value: marker.value,
          refMin: marker.refMin,
          refMax: marker.refMax,
        });
        map.set(key, next);
      }
    }

    return map;
  }, [sortedSnapshots]);

  const trackedMarkerNames = useMemo(
    () =>
      [...markerTimelineMap.entries()]
        .filter(([, points]) => points.length >= 2)
        .map(([name]) => name)
        .sort((a, b) => a.localeCompare(b)),
    [markerTimelineMap],
  );

  useEffect(() => {
    if (!selectedMarker && trackedMarkerNames.length > 0) {
      setSelectedMarker(trackedMarkerNames[0]);
      return;
    }

    if (selectedMarker && !trackedMarkerNames.includes(selectedMarker)) {
      setSelectedMarker(trackedMarkerNames[0] || "");
    }
  }, [selectedMarker, trackedMarkerNames]);

  const selectedMarkerSeries = useMemo(
    () => (selectedMarker ? markerTimelineMap.get(selectedMarker) || [] : []),
    [markerTimelineMap, selectedMarker],
  );

  const changeSummary = useMemo(() => {
    if (!latestSnapshot || !previousSnapshot) {
      return {
        improved: 0,
        worsened: 0,
        rows: [] as Array<{ name: string; delta: number; deltaPct: number; trend: "improved" | "worse" | "stable" }>,
      };
    }

    const prevMap = new Map(previousSnapshot.markers.map((marker) => [marker.name.toLowerCase(), marker]));

    const rows = latestSnapshot.markers
      .map((current) => {
        const previous = prevMap.get(current.name.toLowerCase());
        if (!previous) return null;

        const delta = current.value - previous.value;
        const deltaPct = previous.value !== 0 ? (delta / previous.value) * 100 : 0;
        const previousDeviation = deviationFromRange(previous);
        const currentDeviation = deviationFromRange(current);
        const improvementScore = previousDeviation - currentDeviation;

        let trend: "improved" | "worse" | "stable" = "stable";
        if (Math.abs(improvementScore) > 0.0001) {
          trend = improvementScore > 0 ? "improved" : "worse";
        }

        return {
          name: current.name,
          delta,
          deltaPct,
          trend,
        };
      })
      .filter((item): item is { name: string; delta: number; deltaPct: number; trend: "improved" | "worse" | "stable" } => Boolean(item));

    return {
      improved: rows.filter((row) => row.trend === "improved").length,
      worsened: rows.filter((row) => row.trend === "worse").length,
      rows: rows.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct)),
    };
  }, [latestSnapshot, previousSnapshot]);

  if (!isConfigured) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Firebase not configured</CardTitle>
            <CardDescription>Set VITE_FIREBASE variables to enable Report Tracker storage.</CardDescription>
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
            <CardTitle>Sign in to use Report Tracker</CardTitle>
            <CardDescription>
              Report Tracker syncs data saved from Report Analyzer and shows longitudinal trends.
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
    <div className="container mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground md:text-3xl">Report Tracker</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Timeline analytics for report snapshots saved from Report Analyzer.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="gradient-primary border-0" asChild>
            <Link to="/analyze">
              Add New Snapshot From Analyzer <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
          <Badge variant="secondary" className="gap-1">
            <FileStack className="h-3.5 w-3.5" /> {sortedSnapshots.length} snapshots
          </Badge>
          {latestSnapshot && (
            <Badge variant="outline" className="gap-1">
              <CalendarDays className="h-3.5 w-3.5" /> Last: {formatDate(latestSnapshot.testDate)}
            </Badge>
          )}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]"
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Progress Snapshot</CardTitle>
            <CardDescription>Latest comparison against your previous saved report.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-background p-3">
              <p className="text-xs text-muted-foreground">Reports logged</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{sortedSnapshots.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-background p-3">
              <p className="text-xs text-muted-foreground">Latest out of range</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{latestSnapshot ? getOutOfRangeCount(latestSnapshot.markers) : 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-background p-3">
              <p className="text-xs text-muted-foreground">Markers improved</p>
              <p className="mt-1 text-2xl font-semibold text-green-600">{changeSummary.improved}</p>
            </div>
            <div className="rounded-xl border border-border bg-background p-3">
              <p className="text-xs text-muted-foreground">Markers worsened</p>
              <p className="mt-1 text-2xl font-semibold text-red-600">{changeSummary.worsened}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sync Flow</CardTitle>
            <CardDescription>
              Tracker now reads-only and auto-syncs from Analyzer saves.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>1. Analyze report in Report Analyzer.</p>
            <p>2. Click Save to Tracker from Analyzer results.</p>
            <p>3. Return here to view longitudinal trends and comparison charts.</p>
            <Button size="sm" variant="outline" asChild>
              <Link to="/analyze">Open Analyzer</Link>
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Marker Timeline</CardTitle>
            <CardDescription>Track one marker over time with optional reference bounds.</CardDescription>
          </CardHeader>
          <CardContent>
            {trackedMarkerNames.length === 0 ? (
              <p className="text-sm text-muted-foreground">Save at least two snapshots in Analyzer to unlock timeline charts.</p>
            ) : (
              <>
                <div className="mb-3 max-w-sm">
                  <Select value={selectedMarker} onValueChange={setSelectedMarker}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose marker" />
                    </SelectTrigger>
                    <SelectContent>
                      {trackedMarkerNames.map((name) => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={selectedMarkerSeries} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="value" stroke="#0ea5e9" strokeWidth={2.5} dot={{ r: 4 }} name="Value" />
                      <Line type="monotone" dataKey="refMin" stroke="#22c55e" strokeDasharray="4 4" dot={false} name="Ref Min" />
                      <Line type="monotone" dataKey="refMax" stroke="#ef4444" strokeDasharray="4 4" dot={false} name="Ref Max" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Out-of-Range Trend</CardTitle>
            <CardDescription>How many markers were outside range across each snapshot.</CardDescription>
          </CardHeader>
          <CardContent>
            {outOfRangeTrend.length === 0 ? (
              <p className="text-sm text-muted-foreground">No trend yet. Save your first snapshot from Analyzer.</p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={outOfRangeTrend} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="outOfRange" stroke="#f97316" fill="#f9731633" name="Outside Range" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Latest vs Previous Report</CardTitle>
            <CardDescription>
              Marker-level change table to highlight improvement or regression patterns.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {changeSummary.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">You need at least two snapshots in Analyzer for comparisons.</p>
            ) : (
              <div className="max-h-80 overflow-auto rounded-lg border border-border bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Marker</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead>Change %</TableHead>
                      <TableHead>Trend</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {changeSummary.rows.slice(0, 18).map((row) => (
                      <TableRow key={row.name}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{row.delta > 0 ? "+" : ""}{row.delta.toFixed(2)}</TableCell>
                        <TableCell>{row.deltaPct > 0 ? "+" : ""}{row.deltaPct.toFixed(1)}%</TableCell>
                        <TableCell>
                          {row.trend === "improved" && <Badge className="bg-green-100 text-green-700 hover:bg-green-100"><TrendingDown className="h-3.5 w-3.5" />Improved</Badge>}
                          {row.trend === "worse" && <Badge variant="destructive"><TrendingUp className="h-3.5 w-3.5" />Worse</Badge>}
                          {row.trend === "stable" && <Badge variant="outline"><Activity className="h-3.5 w-3.5" />Stable</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Clinical Timeline</CardTitle>
            <CardDescription>Every saved snapshot in chronological order.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingSnapshots ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading timeline...
              </div>
            ) : sortedSnapshots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No saved snapshots yet.</p>
            ) : (
              sortedSnapshots.map((snapshot) => (
                <div key={snapshot.id} className="rounded-lg border border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{snapshot.reportTitle}</p>
                    <Badge variant="outline">{formatDate(snapshot.testDate)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {snapshot.markers.length} markers • {getOutOfRangeCount(snapshot.markers)} outside range
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">Reference-backed design notes</CardTitle>
          <CardDescription>
            These sources were used to shape a standards-aware tracker and trend experience.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm md:grid-cols-2">
          <a className="group rounded-lg border border-border bg-background p-3 hover:border-primary/40" href="https://www.hl7.org/fhir/observation.html" target="_blank" rel="noreferrer">
            <p className="font-medium text-foreground group-hover:text-primary">HL7 FHIR Observation</p>
            <p className="text-muted-foreground">How to represent and group longitudinal clinical measurements.</p>
          </a>
          <a className="group rounded-lg border border-border bg-background p-3 hover:border-primary/40" href="https://www.cdc.gov/diabetes/diabetes-testing/index.html" target="_blank" rel="noreferrer">
            <p className="font-medium text-foreground group-hover:text-primary">CDC Diabetes Testing</p>
            <p className="text-muted-foreground">Clear test interpretation ranges and follow-up framing.</p>
          </a>
          <a className="group rounded-lg border border-border bg-background p-3 hover:border-primary/40" href="https://www.who.int/health-topics/cardiovascular-diseases" target="_blank" rel="noreferrer">
            <p className="font-medium text-foreground group-hover:text-primary">WHO CVD Topic</p>
            <p className="text-muted-foreground">Risk-factor context for blood pressure, glucose, and lipids trends.</p>
          </a>
          <a className="group rounded-lg border border-border bg-background p-3 hover:border-primary/40" href="https://carbondesignsystem.com/data-visualization/dashboards/" target="_blank" rel="noreferrer">
            <p className="font-medium text-foreground group-hover:text-primary">Carbon Data Viz Dashboards</p>
            <p className="text-muted-foreground">Dashboard storytelling patterns for readable trend-first analytics.</p>
          </a>
        </CardContent>
      </Card>

      <div className="mt-4 rounded-xl bg-muted/40 p-4 text-xs text-muted-foreground">
        <p>
          This tracker is informational. Always confirm interpretation and treatment decisions with your doctor.
          <span className="ml-1 inline-flex items-center gap-1 text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Trend intelligence should support, not replace, clinical judgment.
          </span>
        </p>
      </div>
    </div>
  );
};

export default ReportTracker;
