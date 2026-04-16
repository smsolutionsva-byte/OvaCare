import {
  Timestamp,
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { findClosestMarkerKey, normalizeMarkerForMatch } from "@/lib/markerMatching";
import { getFirebaseDb } from "@/lib/firebase";
import type { LabMarker } from "@/lib/labReportParser";
import type { ReportSnapshot } from "@/lib/reportTracker";

export type CareMessageRole = "user" | "assistant";

export type CareMessage = {
  id: string;
  role: CareMessageRole;
  content: string;
  createdAt: string;
};

export type CareMessageInput = {
  role: CareMessageRole;
  content: string;
};

export type TrackerContextSummary = {
  summary: string;
  riskSignal: "stable" | "watch" | "escalating";
  worseningMarkers: string[];
  improvingMarkers: string[];
  latestOutOfRange: number;
  previousOutOfRange: number;
  latestDate: string;
  previousDate: string;
};

export type HealthTwinLevel = "stable" | "watch" | "escalating";

export type HealthTwinPoint = {
  date: string;
  outOfRange: number;
  hormonalAbnormal: number;
  metabolicAbnormal: number;
  driftScore: number;
  driftDirection: "worsening" | "improving" | "stable";
};

export type HealthTwinSummary = {
  timeline: HealthTwinPoint[];
  latestLevel: HealthTwinLevel;
  driftAlerts: string[];
  summary: string;
};

const HORMONAL_MARKER_HINTS = [
  "lh",
  "fsh",
  "testosterone",
  "dhea",
  "prolactin",
  "estradiol",
  "progesterone",
  "androgen",
  "tsh",
  "thyroid",
];

const METABOLIC_MARKER_HINTS = [
  "glucose",
  "insulin",
  "hba1c",
  "triglycer",
  "cholesterol",
  "hdl",
  "ldl",
  "vldl",
  "fasting sugar",
  "fasting blood sugar",
  "ogtt",
  "bmi",
];

const normalizeDate = (value: unknown) => {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
};

const userCareMessagesCollection = (uid: string) => {
  const db = getFirebaseDb();
  return collection(db, "users", uid, "careCopilotMessages");
};

export const saveCareMessage = async (uid: string, payload: CareMessageInput) => {
  if (!uid) throw new Error("User must be signed in.");

  const docRef = await addDoc(userCareMessagesCollection(uid), {
    ...payload,
    createdAt: serverTimestamp(),
  });

  return docRef.id;
};

export const getCareMessages = async (uid: string, max = 40) => {
  if (!uid) throw new Error("User must be signed in.");

  const q = query(userCareMessagesCollection(uid), orderBy("createdAt", "desc"), limit(max));
  const snapshot = await getDocs(q);

  return snapshot.docs
    .map((doc) => {
      const data = doc.data() as {
        role?: CareMessageRole;
        content?: string;
        createdAt?: Timestamp | string;
      };

      return {
        id: doc.id,
        role: data.role === "assistant" ? "assistant" : "user",
        content: data.content || "",
        createdAt: normalizeDate(data.createdAt),
      } satisfies CareMessage;
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};

const deviationFromRange = (marker: LabMarker) => {
  if (marker.refMin == null || marker.refMax == null) return 0;
  if (marker.value < marker.refMin) return marker.refMin - marker.value;
  if (marker.value > marker.refMax) return marker.value - marker.refMax;
  return 0;
};

const buildCanonicalMarkerMap = (markers: LabMarker[]) => {
  const map = new Map<string, { label: string; marker: LabMarker }>();

  for (const marker of markers) {
    const normalized = normalizeMarkerForMatch(marker.name);
    if (!normalized) continue;

    const resolvedKey = map.has(normalized)
      ? normalized
      : findClosestMarkerKey(normalized, [...map.keys()]) || normalized;

    const existing = map.get(resolvedKey);
    if (!existing) {
      map.set(resolvedKey, { label: marker.name, marker });
      continue;
    }

    const oldDeviation = Math.abs(deviationFromRange(existing.marker));
    const newDeviation = Math.abs(deviationFromRange(marker));
    if (newDeviation > oldDeviation) {
      map.set(resolvedKey, { label: marker.name, marker });
    }
  }

  return map;
};

const outOfRangeCount = (markers: LabMarker[]) =>
  markers.filter((marker) => marker.status === "high" || marker.status === "low").length;

const emptyTrackerContext = (): TrackerContextSummary => ({
  summary: "No report trend data is available yet. Ask user to save at least two report snapshots for trend-aware guidance.",
  riskSignal: "watch",
  worseningMarkers: [],
  improvingMarkers: [],
  latestOutOfRange: 0,
  previousOutOfRange: 0,
  latestDate: "",
  previousDate: "",
});

const countCategoryAbnormal = (markers: LabMarker[]) => {
  let hormonalAbnormal = 0;
  let metabolicAbnormal = 0;

  for (const marker of markers) {
    if (marker.status !== "high" && marker.status !== "low") continue;

    const normalizedName = normalizeMarkerForMatch(marker.name);

    if (HORMONAL_MARKER_HINTS.some((hint) => normalizedName.includes(hint))) {
      hormonalAbnormal += 1;
    }

    if (METABOLIC_MARKER_HINTS.some((hint) => normalizedName.includes(hint))) {
      metabolicAbnormal += 1;
    }
  }

  return { hormonalAbnormal, metabolicAbnormal };
};

const healthTwinLevel = (score: number): HealthTwinLevel => {
  if (score >= 14) return "escalating";
  if (score >= 8) return "watch";
  return "stable";
};

const emptyHealthTwin = (): HealthTwinSummary => ({
  timeline: [],
  latestLevel: "watch",
  driftAlerts: ["Save at least two report snapshots to unlock Health Twin drift alerts."],
  summary: "Health Twin is waiting for enough trend data.",
});

export const buildHealthTwin = (snapshots: ReportSnapshot[]): HealthTwinSummary => {
  if (snapshots.length < 2) {
    return emptyHealthTwin();
  }

  const sorted = [...snapshots].sort((a, b) => a.testDate.localeCompare(b.testDate));

  const timeline: HealthTwinPoint[] = [];

  for (const snapshot of sorted) {
    const outOfRange = outOfRangeCount(snapshot.markers);
    const { hormonalAbnormal, metabolicAbnormal } = countCategoryAbnormal(snapshot.markers);

    const driftScore = Number((outOfRange * 1.8 + hormonalAbnormal * 2.2 + metabolicAbnormal * 1.6).toFixed(1));

    let driftDirection: HealthTwinPoint["driftDirection"] = "stable";
    if (timeline.length > 0) {
      const previousScore = timeline[timeline.length - 1].driftScore;
      if (driftScore >= previousScore + 1) driftDirection = "worsening";
      if (driftScore <= previousScore - 1) driftDirection = "improving";
    }

    timeline.push({
      date: snapshot.testDate,
      outOfRange,
      hormonalAbnormal,
      metabolicAbnormal,
      driftScore,
      driftDirection,
    });
  }

  const latest = timeline[timeline.length - 1];
  const previous = timeline[timeline.length - 2];

  const driftAlerts: string[] = [];

  if (latest.outOfRange > previous.outOfRange) {
    driftAlerts.push(`Out-of-range markers increased from ${previous.outOfRange} to ${latest.outOfRange}.`);
  }

  if (latest.hormonalAbnormal > previous.hormonalAbnormal) {
    driftAlerts.push("Hormonal-marker abnormal burden is trending upward.");
  }

  if (latest.metabolicAbnormal > previous.metabolicAbnormal) {
    driftAlerts.push("Metabolic-marker abnormal burden is trending upward.");
  }

  const lastThree = timeline.slice(-3);
  if (
    lastThree.length === 3 &&
    lastThree[1].driftDirection === "worsening" &&
    lastThree[2].driftDirection === "worsening"
  ) {
    driftAlerts.push("Two consecutive worsening drift points detected in recent history.");
  }

  if (driftAlerts.length === 0) {
    driftAlerts.push("No major worsening drift signal detected in recent reports.");
  }

  const latestLevel = healthTwinLevel(latest.driftScore);

  const summary = [
    `Latest drift score is ${latest.driftScore} (${latestLevel}).`,
    `Recent out-of-range count is ${latest.outOfRange}.`,
    `Recent hormonal abnormal markers: ${latest.hormonalAbnormal}; metabolic abnormal markers: ${latest.metabolicAbnormal}.`,
  ].join(" ");

  return {
    timeline,
    latestLevel,
    driftAlerts,
    summary,
  };
};

export const buildTrackerContext = (snapshots: ReportSnapshot[]): TrackerContextSummary => {
  if (snapshots.length < 2) {
    return emptyTrackerContext();
  }

  const sorted = [...snapshots].sort((a, b) => a.testDate.localeCompare(b.testDate));
  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];

  const latestOut = outOfRangeCount(latest.markers);
  const prevOut = outOfRangeCount(previous.markers);

  const latestMap = buildCanonicalMarkerMap(latest.markers);
  const previousMap = buildCanonicalMarkerMap(previous.markers);

  const worseningMarkers: string[] = [];
  const improvingMarkers: string[] = [];

  for (const [key, latestEntry] of latestMap.entries()) {
    const prevKey = previousMap.has(key) ? key : findClosestMarkerKey(key, [...previousMap.keys()]);
    if (!prevKey) continue;

    const previousEntry = previousMap.get(prevKey);
    if (!previousEntry) continue;

    const latestDeviation = deviationFromRange(latestEntry.marker);
    const previousDeviation = deviationFromRange(previousEntry.marker);

    if (latestDeviation > previousDeviation + 0.0001) {
      worseningMarkers.push(latestEntry.label);
    } else if (latestDeviation + 0.0001 < previousDeviation) {
      improvingMarkers.push(latestEntry.label);
    }
  }

  let riskPoints = 0;
  if (latestOut > prevOut) riskPoints += 2;
  if (worseningMarkers.length > improvingMarkers.length) riskPoints += 2;
  if (latestOut >= 5) riskPoints += 1;

  const riskSignal: TrackerContextSummary["riskSignal"] = riskPoints >= 4 ? "escalating" : riskPoints >= 2 ? "watch" : "stable";

  const summary = [
    `Latest report date: ${latest.testDate}. Previous report date: ${previous.testDate}.`,
    `Out-of-range markers changed from ${prevOut} to ${latestOut}.`,
    worseningMarkers.length > 0
      ? `Potentially worsening markers: ${worseningMarkers.slice(0, 6).join(", ")}.`
      : "No clearly worsening marker trend detected in the most recent comparison.",
    improvingMarkers.length > 0
      ? `Improving markers: ${improvingMarkers.slice(0, 6).join(", ")}.`
      : "No clearly improving marker trend detected in the most recent comparison.",
  ].join(" ");

  return {
    summary,
    riskSignal,
    worseningMarkers,
    improvingMarkers,
    latestOutOfRange: latestOut,
    previousOutOfRange: prevOut,
    latestDate: latest.testDate,
    previousDate: previous.testDate,
  };
};
