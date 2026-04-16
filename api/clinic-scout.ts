type ClinicSpecialty = "gynecologist" | "endocrinologist" | "fertility" | "dermatologist" | "nutrition";

type WeightProfile = {
  distance: number;
  reviews: number;
  prominence: number;
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

type ScrapedMapPlace = {
  name: string;
  address: string;
  distanceKm: number | null;
  rating: number | null;
  reviewCount: number | null;
  reviewConfidence: "low" | "medium" | "high";
  reviewSummary: string;
  sourceUrl: string;
  prominence: number;
};

type ScrapeOptions = {
  geolocation?: {
    latitude: number;
    longitude: number;
  };
};

export const config = {
  maxDuration: 60,
};

const specialtyTerms: Record<ClinicSpecialty, string> = {
  gynecologist: "gynecologist women's health clinic",
  endocrinologist: "endocrinologist hormone clinic",
  fertility: "fertility specialist reproductive clinic",
  dermatologist: "dermatologist hormonal skin clinic",
  nutrition: "dietitian nutrition clinic",
};

const json = (res: any, status: number, payload: unknown) => res.status(status).json(payload);

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const parseWeight = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed, 0, 100);
};

const normalizeWeights = (distance: number, reviews: number, prominence: number): WeightProfile => {
  const total = Math.max(1, distance + reviews + prominence);
  return {
    distance: Math.round((distance / total) * 100),
    reviews: Math.round((reviews / total) * 100),
    prominence: Math.round((prominence / total) * 100),
  };
};

const makeSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "clinic";

const parseCompactNumber = (value: string) => {
  const normalized = value.trim().replace(/,/g, "");
  if (!normalized) return null;

  const suffix = normalized.at(-1)?.toLowerCase();
  const base = Number(suffix === "k" || suffix === "m" ? normalized.slice(0, -1) : normalized);
  if (!Number.isFinite(base)) return null;

  if (suffix === "k") return Math.round(base * 1000);
  if (suffix === "m") return Math.round(base * 1_000_000);
  return Math.round(base);
};

const parseDistanceFromText = (text: string) => {
  const match = text.match(/(\d+(?:\.\d+)?)\s?(km|m)\b/i);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;

  return match[2].toLowerCase() === "m"
    ? Number((value / 1000).toFixed(2))
    : Number(value.toFixed(2));
};

const parseCoordinatesFromLocation = (location: string) => {
  const match = location.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  return { latitude, longitude };
};

const parseReviewMetaFromLines = (textLines: string[]) => {
  const joined = textLines.join(" ");

  const ratingWithCount = joined.match(/([0-5](?:\.\d)?)\s*\(([^)]+)\)/);
  const ratingOnly = joined.match(/([0-5](?:\.\d)?)\s*(?:stars?|\u2605)/i);
  const countOnly = joined.match(/([\d.,KkMm]+)\s+reviews?/i);

  const rating = Number(ratingWithCount?.[1] || ratingOnly?.[1] || NaN);
  const safeRating = Number.isFinite(rating) ? rating : null;

  const reviewCountRaw = ratingWithCount?.[2] || countOnly?.[1] || "";
  const reviewCount = parseCompactNumber(reviewCountRaw);

  const mentionCount = textLines.filter((line) => /review|rating|stars?/i.test(line)).length;

  let reviewConfidence: "low" | "medium" | "high" = "low";
  if ((safeRating && reviewCount) || mentionCount >= 2) reviewConfidence = "high";
  else if (safeRating || mentionCount === 1) reviewConfidence = "medium";

  const reviewSummary = safeRating && reviewCount
    ? `Google Maps rating ~${safeRating.toFixed(1)}/5 from about ${reviewCount.toLocaleString()} reviews.`
    : safeRating
      ? `Google Maps rating ~${safeRating.toFixed(1)}/5 found; review count not clearly visible.`
      : mentionCount > 0
        ? "Review mentions detected in map card; open source for full details."
        : "Limited review details visible in map card; open source to verify.";

  return {
    rating: safeRating,
    reviewCount,
    reviewConfidence,
    reviewSummary,
  };
};

const pickAddressFromLines = (textLines: string[]) => {
  const addressHint = textLines.find((line) =>
    /(road|rd\b|street|st\b|avenue|ave\b|lane|ln\b|nagar|sector|block|colony|hospital|clinic|near)/i.test(line),
  );

  return addressHint || textLines[2] || textLines[1] || "Address not clearly listed in map snippet.";
};

const launchMapsBrowser = async () => {
  const playwright = await import("playwright-core");
  const chromiumModule = await import("@sparticuz/chromium");
  const chromium = chromiumModule.default;

  const configuredPath =
    process.env.CHROME_EXECUTABLE_PATH ||
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    "";

  const resolvedPath = configuredPath || (await chromium.executablePath().catch(() => ""));

  if (!resolvedPath) {
    throw new Error(
      "Chromium executable is unavailable in this environment. Ensure @sparticuz/chromium is bundled on Vercel.",
    );
  }

  const chromiumArgs = Array.isArray(chromium.args) ? chromium.args : [];

  return playwright.chromium.launch({
    executablePath: resolvedPath,
    headless: true,
    args: [
      ...chromiumArgs,
      "--disable-blink-features=AutomationControlled",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-sandbox",
    ],
  });
};

const scrapeGoogleMapsFeed = async (
  searchQuery: string,
  maxResults = 10,
  options?: ScrapeOptions,
): Promise<ScrapedMapPlace[]> => {
  let browser: any = null;

  try {
    browser = await launchMapsBrowser();

    const context = await browser.newContext({
      locale: "en-US",
      viewport: { width: 980, height: 720 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
      geolocation: options?.geolocation,
    });

    if (options?.geolocation) {
      await context.grantPermissions(["geolocation"], { origin: "https://www.google.com" });
    }

    const page = await context.newPage();
    const encodedQuery = searchQuery.replace(/\s+/g, "+");

    await page.goto(`https://www.google.com/maps/search/${encodedQuery}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const popupSelectors = [
      'button:has-text("Accept all")',
      'button:has-text("Reject all")',
      'button:has-text("Accept")',
      'button:has-text("I agree")',
      'button:has-text("Agree")',
      'form[action*="consent"] button',
    ];

    for (const selector of popupSelectors) {
      try {
        const button = page.locator(selector).first();
        if (await button.isVisible({ timeout: 1500 })) {
          await button.click({ timeout: 1500 });
          await delay(700);
          break;
        }
      } catch {
        // Keep trying other selectors.
      }
    }

    try {
      await page.waitForSelector("div[role='feed']", { timeout: 12000 });
    } catch {
      await page.mouse.wheel(0, 320);
      await page.waitForSelector("div[role='feed']", { timeout: 7000 });
    }

    let scrollActive = true;
    const scrollLoop = (async () => {
      while (scrollActive) {
        const scrollPx = 120 + Math.floor(Math.random() * 161);
        await page
          .$eval(
            "div[role='feed']",
            (feed, px) => {
              (feed as any).scrollTop += Number(px);
            },
            scrollPx,
          )
          .catch(() => undefined);

        await delay(400 + Math.floor(Math.random() * 701));
      }
    })();

    const timeoutAt = Date.now() + 20000;
    let cards: Array<{ name: string; href: string; textLines: string[] }> = [];

    while (Date.now() < timeoutAt) {
      cards = await page.$$eval("div[role='feed'] > div > div[jsaction]", (nodes) =>
        nodes.map((node) => {
          const card = node as any;
          const anchor = card.querySelector("a[aria-label]");
          const headline = card.querySelector(".fontHeadlineSmall");
          const heading = card.querySelector("h3");

          const name = String(
            anchor?.getAttribute?.("aria-label") ||
            headline?.textContent ||
            heading?.textContent ||
            "",
          ).trim();

          const href = String(anchor?.href || "").trim();
          const textLines = String(card.innerText || card.textContent || "")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);

          return { name, href, textLines };
        }),
      );

      const loaded = cards.filter((card) => card.name).length;
      if (loaded >= maxResults) break;
      await delay(800);
    }

    scrollActive = false;
    await Promise.race([scrollLoop, delay(2000)]);

    const deduped = new Map<string, ScrapedMapPlace>();

    cards.forEach((card, index) => {
      if (!card.name) return;

      const reviewMeta = parseReviewMetaFromLines(card.textLines);
      const distanceKm = parseDistanceFromText(card.textLines.join(" "));
      const address = pickAddressFromLines(card.textLines);
      const key = `${card.name.toLowerCase()}|${address.toLowerCase()}`;
      if (deduped.has(key)) return;

      deduped.set(key, {
        name: card.name,
        address,
        distanceKm,
        rating: reviewMeta.rating,
        reviewCount: reviewMeta.reviewCount,
        reviewConfidence: reviewMeta.reviewConfidence,
        reviewSummary: reviewMeta.reviewSummary,
        sourceUrl: card.href || `https://www.google.com/search?q=${encodeURIComponent(`${card.name} reviews`)}`,
        prominence: clamp(1 - index / Math.max(maxResults * 1.6, 12), 0.2, 1),
      });
    });

    return [...deduped.values()].slice(0, maxResults);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scrape failure";

    if (/Chromium executable is unavailable|executable path|ENOENT|cannot find module/i.test(message)) {
      throw new Error(
        "Serverless Chromium is not available at runtime. Install dependencies and redeploy Vercel.",
      );
    }

    throw new Error(`Google Maps scrape failed: ${message}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
};

const scoreClinic = (params: {
  place: ScrapedMapPlace;
  index: number;
  location: string;
  weights: WeightProfile;
}): ScoutClinic => {
  const { place, index, location, weights } = params;

  const estimatedDistanceKm = place.distanceKm ?? Number((0.8 + index * 1.7).toFixed(2));
  const distanceSignal = place.distanceKm === null
    ? 45
    : clamp(100 - estimatedDistanceKm * 8, 0, 100);

  const reviewSignal = clamp(
    (place.rating ? (place.rating / 5) * 85 : 0) +
      (place.reviewCount ? Math.min(15, Math.log10(place.reviewCount + 1) * 5) : 0),
    0,
    100,
  );

  const prominenceSignal = Math.round(place.prominence * 100);

  const score = Number(
    ((distanceSignal * weights.distance +
      reviewSignal * weights.reviews +
      prominenceSignal * weights.prominence) / 100).toFixed(1),
  );

  const scoreBreakdown = {
    distance: Math.round(distanceSignal),
    reviews: Math.round(reviewSignal),
    prominence: Math.round(prominenceSignal),
  };

  const reasons = [
    place.distanceKm !== null
      ? `${estimatedDistanceKm.toFixed(1)} km from selected location.`
      : "Distance not explicit in map card; estimated from result order.",
    place.reviewSummary,
    "Scraped directly from Google Maps feed with smooth-scroll accumulation.",
  ];

  return {
    id: `${makeSlug(place.name)}-${index}`,
    name: place.name,
    address: place.address,
    lat: 0,
    lon: 0,
    distanceKm: estimatedDistanceKm,
    reviewSummary: place.reviewSummary,
    reviewConfidence: place.reviewConfidence,
    score,
    scoreBreakdown,
    reasons,
    sources: {
      primaryUrl: place.sourceUrl,
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${location}`)}`,
      yelpUrl: `https://www.yelp.com/search?find_desc=${encodeURIComponent(place.name)}&find_loc=${encodeURIComponent(location)}`,
      webSearchUrl: `https://www.google.com/search?q=${encodeURIComponent(`${place.name} ${location} reviews`)}`,
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

    if (!location) {
      return json(res, 400, { error: "Missing location query." });
    }

    if (!(specialty in specialtyTerms)) {
      return json(res, 400, { error: "Invalid specialty query." });
    }

    const distanceWeight = parseWeight(req.query?.distanceWeight, 45);
    const reviewWeight = parseWeight(req.query?.reviewWeight, 40);
    const prominenceWeight = parseWeight(req.query?.prominenceWeight, 15);
    const weightProfile = normalizeWeights(distanceWeight, reviewWeight, prominenceWeight);
    const coordinates = parseCoordinatesFromLocation(location);

    const mapQuery = `${specialtyTerms[specialty]} near ${location}`;
    let scraped: ScrapedMapPlace[] = [];

    try {
      scraped = await scrapeGoogleMapsFeed(mapQuery, 10, {
        geolocation: coordinates || undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not initialize map scraping.";
      return json(res, 502, { error: message });
    }

    if (!scraped.length) {
      return json(res, 502, {
        error:
          "Could not load map cards from Google Maps. If consent/location prompts appear, allow them and retry.",
      });
    }

    const ranked = scraped
      .map((place, index) => scoreClinic({ place, index, location, weights: weightProfile }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    const best = ranked[0] || null;

    return json(res, 200, {
      query: mapQuery,
      centerLabel: location,
      mapEmbedUrl: `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`,
      sourceMode: "google-maps-live",
      weightProfile,
      items: ranked,
      recommendation: best
        ? {
            bestClinicId: best.id,
            summary: `${best.name} is currently the strongest pick from live map results using your ranking profile (distance ${weightProfile.distance}%, reviews ${weightProfile.reviews}%, prominence ${weightProfile.prominence}%).`,
            reasons: best.reasons,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown clinic scout failure";
    return json(res, 500, { error: message });
  }
}
