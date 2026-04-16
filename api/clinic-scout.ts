type ClinicSpecialty = "gynecologist" | "endocrinologist" | "fertility" | "dermatologist" | "nutrition";

type NominatimRow = {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  importance?: number;
};

type ScoutClinic = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  distanceKm: number;
  reviewSummary: string;
  reviewConfidence: "low" | "medium" | "high";
  score: number;
  scoreBreakdown: {
    distance: number;
    reviews: number;
    prominence: number;
  };
  reasons: string[];
  sources: {
    primaryUrl: string;
    googleMapsUrl: string;
    yelpUrl: string;
    webSearchUrl: string;
  };
};

type WeightProfile = {
  distance: number;
  reviews: number;
  prominence: number;
};

const specialtyTerms: Record<ClinicSpecialty, string> = {
  gynecologist: "gynecologist women's health clinic",
  endocrinologist: "endocrinologist hormone clinic",
  fertility: "fertility specialist reproductive clinic",
  dermatologist: "dermatologist acne hormonal skin clinic",
  nutrition: "dietitian nutritionist metabolic clinic",
};

const specialtyLabels: Record<ClinicSpecialty, string> = {
  gynecologist: "Gynecologist",
  endocrinologist: "Endocrinologist",
  fertility: "Fertility specialist",
  dermatologist: "Dermatologist",
  nutrition: "Nutrition specialist",
};

const json = (res: any, status: number, payload: unknown) => res.status(status).json(payload);

const fetchJson = async <T>(url: string) => {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
      "User-Agent": "OvaCare/1.0 (clinic-scout)",
    },
  });

  if (!response.ok) {
    throw new Error(`Upstream request failed (${response.status})`);
  }

  return (await response.json()) as T;
};

const toAddress = (displayName: string) => {
  const chunks = displayName.split(",").map((chunk) => chunk.trim()).filter(Boolean);
  return chunks.slice(1).join(", ") || displayName;
};

const decodeDuckDuckGoRedirect = (href: string) => {
  const candidate = href.startsWith("//")
    ? `https:${href}`
    : href.startsWith("/")
      ? `https://duckduckgo.com${href}`
      : href;

  try {
    const parsed = new URL(candidate);
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : candidate;
  } catch {
    return candidate;
  }
};

const decodeHtml = (value: string) =>
  value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ");

const stripHtml = (value: string) => decodeHtml(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

const parseDuckDuckGoResults = (html: string) => {
  const links = [...html.matchAll(/<a[^>]*class=\"result__a\"[^>]*href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>/g)];
  const snippets = [...html.matchAll(/<a[^>]*class=\"result__snippet\"[^>]*>([\s\S]*?)<\/a>/g)];

  const results = links.map((linkMatch, index) => {
    const href = decodeDuckDuckGoRedirect(linkMatch[1] || "");
    const title = stripHtml(linkMatch[2] || "");
    const snippet = stripHtml(snippets[index]?.[1] || "");
    return { href, title, snippet };
  });

  return results.slice(0, 6);
};

const haversineKm = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const p1 = rad(aLat);
  const p2 = rad(bLat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return 2 * earthKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const extractRatingCandidates = (text: string) => {
  const matches = [...text.matchAll(/([0-5](?:\.\d)?)\s*(?:\/\s*5|stars?)/gi)];
  return matches
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 5);
};

const collectReviewSignals = (snippets: string[]) => {
  const reviewMentions = snippets.filter((snippet) => /review|rating|stars?|trusted|feedback/i.test(snippet)).length;
  const ratingCandidates = snippets.flatMap((snippet) => extractRatingCandidates(snippet));

  const avgRating = ratingCandidates.length
    ? ratingCandidates.reduce((sum, value) => sum + value, 0) / ratingCandidates.length
    : null;

  let reviewConfidence: "low" | "medium" | "high" = "low";
  if (reviewMentions >= 2 || ratingCandidates.length > 0) reviewConfidence = "high";
  else if (reviewMentions === 1) reviewConfidence = "medium";

  const reviewSummary = avgRating
    ? `Review signals found (avg ~${avgRating.toFixed(1)}/5 from web snippets).`
    : reviewMentions > 0
      ? "Review mentions found in web sources; open links to verify details."
      : "Limited review text in snippets; verify manually in Google Maps and Yelp.";

  return {
    avgRating,
    reviewMentions,
    reviewConfidence,
    reviewSummary,
  };
};

const parseWeight = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, parsed));
};

const normalizeWeights = (distance: number, reviews: number, prominence: number): WeightProfile => {
  const total = Math.max(1, distance + reviews + prominence);
  return {
    distance: Math.round((distance / total) * 100),
    reviews: Math.round((reviews / total) * 100),
    prominence: Math.round((prominence / total) * 100),
  };
};

const scoutOneClinic = async (clinic: {
  id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  distanceKm: number;
  importance: number;
}, location: string, weights: WeightProfile): Promise<ScoutClinic> => {
  const searchQuery = `${clinic.name} ${location} reviews`;
  const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;

  let primaryUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
  let snippets: string[] = [];

  try {
    const html = await fetch(ddgUrl, {
      headers: {
        Accept: "text/html",
        "User-Agent": "OvaCare/1.0 (clinic-scout)",
      },
    }).then((res) => res.text());

    const parsed = parseDuckDuckGoResults(html);
    if (parsed.length > 0) {
      primaryUrl = parsed[0].href;
      snippets = parsed.map((item) => item.snippet).filter(Boolean);
    }
  } catch {
    // Non-blocking scrape failure; we still return map and source links.
  }

  const reviewSignals = collectReviewSignals(snippets);

  const distanceSignal = Math.max(0, 100 - clinic.distanceKm * 8);
  const prominenceSignal = Math.min(100, Math.max(0, clinic.importance * 100));
  const reviewSignal = Math.min(
    100,
    (reviewSignals.avgRating ? (reviewSignals.avgRating / 5) * 85 : 0) + Math.min(15, reviewSignals.reviewMentions * 5),
  );

  const totalScore = Number(
    ((distanceSignal * weights.distance + reviewSignal * weights.reviews + prominenceSignal * weights.prominence) / 100).toFixed(1),
  );

  const scoreBreakdown = {
    distance: Math.round(distanceSignal),
    reviews: Math.round(reviewSignal),
    prominence: Math.round(prominenceSignal),
  };

  const strongestFactor = [
    { key: "distance", value: scoreBreakdown.distance },
    { key: "reviews", value: scoreBreakdown.reviews },
    { key: "prominence", value: scoreBreakdown.prominence },
  ].sort((a, b) => b.value - a.value)[0];

  const strongestFactorText =
    strongestFactor.key === "distance"
      ? "Strong proximity advantage"
      : strongestFactor.key === "reviews"
        ? "Strong review-quality signal"
        : "Strong local listing prominence";

  const reasons = [
    `${clinic.distanceKm.toFixed(1)} km from selected location.`,
    reviewSignals.reviewSummary,
    strongestFactorText,
  ];

  return {
    id: clinic.id,
    name: clinic.name,
    address: clinic.address,
    lat: clinic.lat,
    lon: clinic.lon,
    distanceKm: Number(clinic.distanceKm.toFixed(2)),
    reviewSummary: reviewSignals.reviewSummary,
    reviewConfidence: reviewSignals.reviewConfidence,
    score: totalScore,
    scoreBreakdown,
    reasons,
    sources: {
      primaryUrl,
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${clinic.name} ${clinic.address}`,
      )}`,
      yelpUrl: `https://www.yelp.com/search?find_desc=${encodeURIComponent(clinic.name)}&find_loc=${encodeURIComponent(location)}`,
      webSearchUrl: `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`,
    },
  };
};

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }

  try {
    const location = String(req.query?.location || "").trim();
    const specialty = String(req.query?.specialty || "").trim().toLowerCase() as ClinicSpecialty;
    const distanceWeight = parseWeight(req.query?.distanceWeight, 45);
    const reviewWeight = parseWeight(req.query?.reviewWeight, 40);
    const prominenceWeight = parseWeight(req.query?.prominenceWeight, 15);
    const weightProfile = normalizeWeights(distanceWeight, reviewWeight, prominenceWeight);

    if (!location) {
      return json(res, 400, { error: "Missing location query." });
    }

    if (!(specialty in specialtyTerms)) {
      return json(res, 400, { error: "Invalid specialty query." });
    }

    const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(location)}`;
    const geocodeRows = await fetchJson<NominatimRow[]>(geocodeUrl);

    if (geocodeRows.length === 0) {
      return json(res, 404, { error: "Could not resolve that location. Try city + state." });
    }

    const centerLat = Number(geocodeRows[0].lat);
    const centerLon = Number(geocodeRows[0].lon);

    const listingQuery = `${specialtyTerms[specialty]} near ${location}`;
    const listingUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=16&q=${encodeURIComponent(
      listingQuery,
    )}`;

    const listingRows = await fetchJson<NominatimRow[]>(listingUrl);

    const cleaned = listingRows
      .map((row) => {
        const lat = Number(row.lat);
        const lon = Number(row.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

        const name = row.display_name.split(",")[0] || "Clinic";
        const address = toAddress(row.display_name);
        const distanceKm = haversineKm(centerLat, centerLon, lat, lon);

        return {
          id: String(row.place_id),
          name,
          address,
          lat,
          lon,
          distanceKm,
          importance: Number(row.importance || 0),
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      name: string;
      address: string;
      lat: number;
      lon: number;
      distanceKm: number;
      importance: number;
    }>;

    const uniqueByNameAddress = new Map<string, (typeof cleaned)[number]>();
    for (const clinic of cleaned) {
      const key = `${clinic.name.toLowerCase()}|${clinic.address.toLowerCase()}`;
      if (!uniqueByNameAddress.has(key)) uniqueByNameAddress.set(key, clinic);
    }

    const candidates = [...uniqueByNameAddress.values()]
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 8);

    const scoped = candidates.slice(0, 6);
    const scouted = await Promise.all(scoped.map((clinic) => scoutOneClinic(clinic, location, weightProfile)));
    const ranked = scouted.sort((a, b) => b.score - a.score);

    const best = ranked[0] || null;
    const recommendation = best
      ? {
          bestClinicId: best.id,
          summary: `${best.name} is currently the strongest pick for your ranking profile (distance ${weightProfile.distance}%, reviews ${weightProfile.reviews}%, prominence ${weightProfile.prominence}%) at ${best.distanceKm.toFixed(
            1,
          )} km).`,
          reasons: best.reasons,
        }
      : null;

    const specialtyLabel = specialtyLabels[specialty];
    const mapQuery = `${specialtyLabel} near ${location}`;

    return json(res, 200, {
      query: mapQuery,
      centerLabel: location,
      mapEmbedUrl: `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`,
      weightProfile,
      items: ranked,
      recommendation,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown clinic scout failure";
    return json(res, 500, { error: message });
  }
}
