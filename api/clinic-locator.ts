type ClinicSpecialty = "gynecologist" | "endocrinologist" | "fertility" | "dermatologist" | "nutrition";

type NominatimSearchRow = {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  class?: string;
  type?: string;
  importance?: number;
};

type NominatimReverseResponse = {
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
  };
};

const specialtyTerms: Record<ClinicSpecialty, string> = {
  gynecologist: "gynecologist women's health clinic",
  endocrinologist: "endocrinologist hormone clinic",
  fertility: "fertility specialist reproductive clinic",
  dermatologist: "dermatologist acne hormonal skin clinic",
  nutrition: "dietitian nutritionist metabolic clinic",
};

const json = (res: any, status: number, payload: unknown) => res.status(status).json(payload);

const safeHeader = {
  Accept: "application/json",
  "Accept-Language": "en",
  "User-Agent": "OvaCare/1.0 (clinic-locator)",
};

const normalizeLocationLabel = (payload: NominatimReverseResponse, fallback: string) => {
  const label = [
    payload.address?.city || payload.address?.town || payload.address?.village || "",
    payload.address?.state || "",
    payload.address?.country || "",
  ]
    .filter(Boolean)
    .join(", ");

  return label || payload.display_name || fallback;
};

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }

  try {
    const mode = String(req.query?.mode || "search").toLowerCase();

    if (mode === "search") {
      const location = String(req.query?.location || "").trim();
      const specialty = String(req.query?.specialty || "").trim().toLowerCase() as ClinicSpecialty;
      const limitRaw = Number(req.query?.limit || 20);
      const limit = Number.isFinite(limitRaw) ? Math.max(5, Math.min(25, Math.round(limitRaw))) : 20;

      if (!location) {
        return json(res, 400, { error: "Missing location query." });
      }

      if (!(specialty in specialtyTerms)) {
        return json(res, 400, { error: "Invalid specialty query." });
      }

      const query = `${specialtyTerms[specialty]} near ${location}`;
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=${limit}&q=${encodeURIComponent(
        query,
      )}`;

      const response = await fetch(url, { headers: safeHeader });

      if (!response.ok) {
        return json(res, 502, { error: "Location provider unavailable. Please retry in a few seconds." });
      }

      const payload = (await response.json()) as NominatimSearchRow[];
      return json(res, 200, payload);
    }

    if (mode === "reverse") {
      const lat = Number(req.query?.lat);
      const lon = Number(req.query?.lon);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return json(res, 400, { error: "Invalid coordinates." });
      }

      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
        String(lat),
      )}&lon=${encodeURIComponent(String(lon))}`;

      const response = await fetch(url, { headers: safeHeader });

      if (!response.ok) {
        return json(res, 200, {
          label: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
        });
      }

      const payload = (await response.json()) as NominatimReverseResponse;
      const fallback = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

      return json(res, 200, {
        label: normalizeLocationLabel(payload, fallback),
      });
    }

    return json(res, 400, { error: "Invalid mode. Use mode=search or mode=reverse." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown location service error";
    return json(res, 500, { error: message });
  }
}
