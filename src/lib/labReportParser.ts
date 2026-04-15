export type LabMarkerStatus = "low" | "normal" | "high" | "unknown";

export type LabMarker = {
  name: string;
  value: number;
  unit: string;
  refMin: number | null;
  refMax: number | null;
  status: LabMarkerStatus;
  sourceLine: string;
};

export type LabExtractionResult = {
  markers: LabMarker[];
  removedSensitiveLines: number;
  analyzedLines: number;
  cleanedText: string;
  labSignalLines: number;
  possibleReport: boolean;
};

const SENSITIVE_LINE_PATTERNS = [
  /patient\s*name/i,
  /name\s*:/i,
  /dob|date\s*of\s*birth/i,
  /age\s*:/i,
  /gender\s*:/i,
  /sex\s*:/i,
  /address\s*:/i,
  /phone|mobile|contact/i,
  /email/i,
  /mrn|uhid|patient\s*id/i,
  /accession|sample\s*id|specimen\s*id/i,
  /referr?ed\s*by|doctor\s*name/i,
  /collection\s*date|report\s*date/i,
];

const NON_MARKER_KEYWORDS = [
  "reference range",
  "biological reference",
  "investigation",
  "parameter",
  "sample",
  "specimen",
  "department",
  "method",
  "laboratory",
  "pathology",
  "result status",
  "authorized",
  "signature",
  "barcode",
  "invoice",
  "mean",
  "minimum",
  "maximum",
  "standard deviation",
  "sd",
];

const LAB_SIGNAL_PATTERNS = [
  /blood|serum|plasma|cbc|hemoglobin|haemoglobin|wbc|rbc|platelet/i,
  /cholesterol|triglycerides?|hdl|ldl|glucose|sugar|hba1c|insulin/i,
  /tsh|t3|t4|lh|fsh|prolactin|androgen|testosterone|estradiol|progesterone/i,
  /creatinine|urea|alt|ast|bilirubin|albumin|globulin|crp|vitamin\s*d|b12/i,
  /mg\/?dl|mmol\/?l|u\/?l|iu\/?l|ng\/?ml|pg\/?ml|g\/?dl|mm\s*hg/i,
];

const collapseSpaces = (value: string) => value.replace(/\s+/g, " ").trim();

const parseNumber = (value: string) => {
  const cleaned = value.replace(/,/g, "").replace(/[<>]/g, "").trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const classifyStatus = (value: number, min: number | null, max: number | null): LabMarkerStatus => {
  if (min == null || max == null) return "unknown";
  if (value < min) return "low";
  if (value > max) return "high";
  return "normal";
};

const isLikelySensitiveLine = (line: string) => SENSITIVE_LINE_PATTERNS.some((regex) => regex.test(line));

const isLikelyMarkerName = (name: string) => {
  const normalized = name.toLowerCase();
  if (NON_MARKER_KEYWORDS.some((keyword) => normalized.includes(keyword))) return false;
  if (name.length < 2 || name.length > 70) return false;
  if (!/[a-zA-Z]/.test(name)) return false;
  return true;
};

const hasLabSignal = (line: string) => LAB_SIGNAL_PATTERNS.some((regex) => regex.test(line));

const isLikelySectionHeader = (line: string) => {
  if (/\d/.test(line)) return false;
  if (line.length < 3 || line.length > 90) return false;
  return hasLabSignal(line);
};

const RANGE_PATTERN =
  /^([A-Za-z][A-Za-z0-9\s\-\/%().,+]{1,70}?)[\s:]+([<>]?\d+(?:\.\d+)?)[\s]*([A-Za-z%/0-9^.-]{0,20})?[\s]*(?:\(?\s*(\d+(?:\.\d+)?)\s*[-to]{1,3}\s*(\d+(?:\.\d+)?)\s*\)?)$/i;

const RANGE_PATTERN_ALT =
  /^([A-Za-z][A-Za-z0-9\s\-\/%().,+]{1,70}?)[\s:]+([<>]?\d+(?:\.\d+)?)[\s]*([A-Za-z%/0-9^.-]{0,20})?[\s]+(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/i;

const VALUE_ONLY_PATTERN =
  /^([A-Za-z][A-Za-z0-9\s\-\/%().,+]{1,70}?)[\s:]+([<>]?\d+(?:\.\d+)?)[\s]*([A-Za-z%/0-9^.-]{0,20})\s*(?:\b(H|L|N)\b)?$/i;

const MULTI_NUMBER_PATTERN =
  /^([A-Za-z][A-Za-z0-9\s\-\/%().,+\[\]]{1,90}?)\s+([<>]?\d+(?:\.\d+)?(?:\s+[<>]?\d+(?:\.\d+)?){1,4})$/i;

const normalizeMarkerName = (name: string) => collapseSpaces(name.replace(/[\[\]()]/g, " "));

const parseMarkerFromLine = (line: string, sectionContext = ""): LabMarker | null => {
  const normalizedLine = collapseSpaces(line);
  const rangeMatch = normalizedLine.match(RANGE_PATTERN) || normalizedLine.match(RANGE_PATTERN_ALT);

  if (rangeMatch) {
    const [, nameRaw, valueRaw, unitRaw = "", minRaw, maxRaw] = rangeMatch;
    const name = normalizeMarkerName(nameRaw);
    if (!isLikelyMarkerName(name)) return null;

    const value = parseNumber(valueRaw);
    const refMin = parseNumber(minRaw);
    const refMax = parseNumber(maxRaw);

    if (value == null) return null;

    return {
      name: sectionContext && name.length <= 18 ? `${sectionContext} - ${name}` : name,
      value,
      unit: collapseSpaces(unitRaw),
      refMin,
      refMax,
      status: classifyStatus(value, refMin, refMax),
      sourceLine: normalizedLine,
    };
  }

  const valueMatch = normalizedLine.match(VALUE_ONLY_PATTERN);
  if (!valueMatch) return null;

  const [, nameRaw, valueRaw, unitRaw = "", flagRaw = ""] = valueMatch;
  const name = normalizeMarkerName(nameRaw);
  if (!isLikelyMarkerName(name)) return null;

  const value = parseNumber(valueRaw);
  if (value == null) return null;

  const status: LabMarkerStatus = flagRaw === "H" ? "high" : flagRaw === "L" ? "low" : "unknown";

  return {
    name: sectionContext && name.length <= 18 ? `${sectionContext} - ${name}` : name,
    value,
    unit: collapseSpaces(unitRaw),
    refMin: null,
    refMax: null,
    status,
    sourceLine: normalizedLine,
  };
};

const parseTableStyleMarkerFromLine = (line: string, sectionContext = ""): LabMarker | null => {
  const normalizedLine = collapseSpaces(line);
  const match = normalizedLine.match(MULTI_NUMBER_PATTERN);
  if (!match) return null;

  const [, nameRaw, numberChunk] = match;
  const numbers = numberChunk.match(/[<>]?\d+(?:\.\d+)?/g) || [];
  if (numbers.length === 0) return null;

  const name = normalizeMarkerName(nameRaw);
  if (!isLikelyMarkerName(name)) return null;

  const value = parseNumber(numbers[0]);
  if (value == null) return null;

  return {
    name: sectionContext && name.length <= 18 ? `${sectionContext} - ${name}` : name,
    value,
    unit: "",
    refMin: null,
    refMax: null,
    status: "unknown",
    sourceLine: normalizedLine,
  };
};

export const extractMeaningfulLabData = (rawText: string): LabExtractionResult => {
  const lines = rawText
    .split(/\r?\n/)
    .map(collapseSpaces)
    .filter(Boolean);

  let removedSensitiveLines = 0;
  let labSignalLines = 0;
  const safeLines: string[] = [];

  for (const line of lines) {
    if (isLikelySensitiveLine(line)) {
      removedSensitiveLines += 1;
      continue;
    }

    if (hasLabSignal(line)) {
      labSignalLines += 1;
    }

    if (!/\d/.test(line) && !isLikelySectionHeader(line)) continue;
    safeLines.push(line);
  }

  const markerMap = new Map<string, LabMarker>();
  let sectionContext = "";

  for (const line of safeLines) {
    if (isLikelySectionHeader(line)) {
      sectionContext = normalizeMarkerName(line);
      continue;
    }

    const marker = parseMarkerFromLine(line, sectionContext) || parseTableStyleMarkerFromLine(line, sectionContext);
    if (!marker) continue;

    const key = marker.name.toLowerCase();
    const existing = markerMap.get(key);

    if (!existing) {
      markerMap.set(key, marker);
      continue;
    }

    const existingHasRange = existing.refMin != null && existing.refMax != null;
    const nextHasRange = marker.refMin != null && marker.refMax != null;

    if (!existingHasRange && nextHasRange) {
      markerMap.set(key, marker);
    }
  }

  const markers = [...markerMap.values()].sort((a, b) => {
    const priority = { high: 0, low: 1, normal: 2, unknown: 3 };
    if (priority[a.status] !== priority[b.status]) return priority[a.status] - priority[b.status];
    return a.name.localeCompare(b.name);
  });

  const rangeMarkers = markers.filter((m) => m.refMin != null && m.refMax != null).length;
  const possibleReport = markers.length >= 2 && (labSignalLines >= 2 || rangeMarkers >= 1);

  return {
    markers,
    removedSensitiveLines,
    analyzedLines: safeLines.length,
    cleanedText: safeLines.join("\n"),
    labSignalLines,
    possibleReport,
  };
};
