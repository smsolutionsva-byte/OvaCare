export type ClinicSpecialty = "gynecologist" | "endocrinologist" | "fertility" | "dermatologist" | "nutrition";

export type ClinicSearchParams = {
  location: string;
  specialty: ClinicSpecialty;
  limit?: number;
};

export type WebClinicSearchLinks = {
  query: string;
  googleMapsSearchUrl: string;
  googleMapsEmbedUrl: string;
  yelpSearchUrl: string;
  webSearchUrl: string;
};

export type ReverseGeocodeResult = {
  label: string;
  coordinatesLabel: string;
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

export const buildWebClinicSearchLinks = ({ location, specialty }: { location: string; specialty: ClinicSpecialty }): WebClinicSearchLinks => {
  const safeLocation = location.trim();
  const specialtyLabel = specialtyLabelMap[specialty];
  const query = `${specialtyLabel} near ${safeLocation}`;

  return {
    query,
    googleMapsSearchUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
    googleMapsEmbedUrl: `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`,
    yelpSearchUrl: `https://www.yelp.com/search?find_desc=${encodeURIComponent(specialtyLabel)}&find_loc=${encodeURIComponent(
      safeLocation,
    )}`,
    webSearchUrl: `https://www.google.com/search?q=${encodeURIComponent(`${query} reviews`)}`,
  };
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

  const apiUrl = `/api/clinic-locator?mode=search&specialty=${encodeURIComponent(specialty)}&location=${encodeURIComponent(
    location.trim(),
  )}&limit=20`;

  const response = await fetch(apiUrl, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || "Location service is unavailable right now. Please retry.");
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

export const reverseGeocodeLocation = async (latitude: number, longitude: number): Promise<ReverseGeocodeResult> => {
  const coordinatesLabel = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
  const apiUrl = `/api/clinic-locator?mode=reverse&lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(
    String(longitude),
  )}`;

  const response = await fetch(apiUrl, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return { label: coordinatesLabel, coordinatesLabel };
  }

  const payload = (await response.json()) as {
    label?: string;
  };

  return {
    label: payload.label || coordinatesLabel,
    coordinatesLabel,
  };
};
