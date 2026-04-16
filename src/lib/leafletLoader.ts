type LeafletGlobal = {
  map: (element: HTMLElement) => any;
  tileLayer: (url: string, options: Record<string, unknown>) => { addTo: (map: any) => void };
  marker: (latlng: [number, number]) => { addTo: (map: any) => { bindPopup: (html: string) => void } };
  latLngBounds: (points: Array<[number, number]>) => any;
};

declare global {
  interface Window {
    L?: LeafletGlobal;
  }
}

const LEAFLET_SCRIPT_ID = "ovacare-leaflet-script";
const LEAFLET_STYLE_ID = "ovacare-leaflet-style";

const ensureLeafletStyle = () => {
  if (document.getElementById(LEAFLET_STYLE_ID)) return;

  const link = document.createElement("link");
  link.id = LEAFLET_STYLE_ID;
  link.rel = "stylesheet";
  link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  document.head.appendChild(link);
};

export const loadLeaflet = async () => {
  if (typeof window === "undefined") {
    throw new Error("Leaflet can only be loaded in a browser environment.");
  }

  if (window.L) {
    return window.L;
  }

  ensureLeafletStyle();

  const existingScript = document.getElementById(LEAFLET_SCRIPT_ID) as HTMLScriptElement | null;

  if (existingScript) {
    await new Promise<void>((resolve, reject) => {
      if (window.L) {
        resolve();
        return;
      }

      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Failed to load Leaflet script.")), { once: true });
    });

    if (!window.L) {
      throw new Error("Leaflet failed to initialize.");
    }

    return window.L;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = LEAFLET_SCRIPT_ID;
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Leaflet script."));
    document.body.appendChild(script);
  });

  if (!window.L) {
    throw new Error("Leaflet failed to initialize.");
  }

  return window.L;
};
