export type ClinicSpecialty = "gynecologist" | "endocrinologist" | "fertility" | "dermatologist" | "nutrition";

export type ClinicSearchParams = {
  location: string;
  specialty: ClinicSpecialty;
  limit?: number;
};

export type ClinicResult = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  address: string;
  type: string;
  importance: number;
  sourceUrl: string;
  whyGood: string[];
};

type NominatimResult = {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  class?: string;
  type?: string;
  importance?: number;
};

const specialtyTerms: Record<ClinicSpecialty, string> = {
  gynecologist: "gynecologist women's health clinic",
  endocrinologist: "endocrinologist hormone clinic",
  fertility: "fertility specialist reproductive clinic",
  dermatologist: "dermatologist acne hormonal skin clinic",
  nutrition: "dietitian nutritionist metabolic clinic",
};

export const specialtyLabelMap: Record<ClinicSpecialty, string> = {
  gynecologist: "Gynecologist",
  endocrinologist: "Endocrinologist",
  fertility: "Fertility specialist",
  dermatologist: "Dermatologist",
  nutrition: "Nutrition specialist",
};

const toAddress = (displayName: string) => {
  const chunks = displayName.split(",").map((item) => item.trim()).filter(Boolean);
  return chunks.slice(1).join(", ") || displayName;
};

const scoreClinic = (row: NominatimResult, specialty: ClinicSpecialty) => {
  const hay = `${row.display_name} ${row.class || ""} ${row.type || ""}`.toLowerCase();
  let score = Number(row.importance || 0) * 10;

  if (/hospital|clinic|medical|health/.test(hay)) score += 1.4;
  if (/women|gyn|gyne|obstetric|fertility|endocrin|hormone/.test(hay)) score += 1.2;
  if (specialty === "dermatologist" && /skin|derma/.test(hay)) score += 0.8;
  if (specialty === "nutrition" && /diet|nutrition/.test(hay)) score += 0.8;

  return score;
};

const buildReasoning = (row: NominatimResult, specialty: ClinicSpecialty): string[] => {
  const reasons: string[] = [];
  const hay = `${row.display_name} ${row.class || ""} ${row.type || ""}`.toLowerCase();

  reasons.push("Matched from OpenStreetMap place search by specialty and location.");

  if (/hospital|clinic|medical|health/.test(hay)) {
    reasons.push("Tagged as a healthcare facility (clinic/hospital/medical center).");
  }

  if (/women|gyn|gyne|obstetric|fertility|endocrin|hormone/.test(hay)) {
    reasons.push("Name and category suggest relevance for hormone/reproductive concerns.");
  }

  if ((row.importance || 0) >= 0.5) {
    reasons.push("Higher map prominence score, often indicating established listing visibility.");
  }

  if (specialty === "nutrition") {
    reasons.push("Nutrition support is useful when planning insulin-aware and weight-supportive routines.");
  }

  return reasons;
};

export const findNearbyClinics = async ({ location, specialty, limit = 8 }: ClinicSearchParams) => {
  if (!location.trim()) {
    throw new Error("Enter a location to search nearby specialists.");
  }

  const query = `${specialtyTerms[specialty]} near ${location.trim()}`;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=20&addressdetails=1&q=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
    },
  });

  if (!response.ok) {
    throw new Error("Location service is unavailable right now. Please retry.");
  }

  const payload = (await response.json()) as NominatimResult[];
  const mapped = payload
    .map((row) => ({
      id: String(row.place_id),
      name: row.display_name.split(",")[0] || "Clinic",
      lat: Number(row.lat),
      lon: Number(row.lon),
      address: toAddress(row.display_name),
      type: row.type || row.class || "medical",
      importance: Number(row.importance || 0),
      sourceUrl: `https://www.openstreetmap.org/?mlat=${row.lat}&mlon=${row.lon}#map=16/${row.lat}/${row.lon}`,
      whyGood: buildReasoning(row, specialty),
      score: scoreClinic(row, specialty),
    }))
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score, ...rest }) => rest);

  return mapped;
};
