import { describe, expect, it } from "vitest";
import { findClosestMarkerKey, normalizeMarkerForMatch } from "@/lib/markerMatching";

describe("markerMatching", () => {
  it("normalizes common medical spelling variants", () => {
    const a = normalizeMarkerForMatch("Haemoglobin");
    const b = normalizeMarkerForMatch("Hemoglobin");
    expect(a).toBe(b);
  });

  it("matches close OCR typo variants", () => {
    const existing = [
      normalizeMarkerForMatch("Lymphocytes"),
      normalizeMarkerForMatch("Neutrophils"),
    ];

    const target = normalizeMarkerForMatch("Lymphocvtes");
    const matched = findClosestMarkerKey(target, existing);

    expect(matched).toBe(normalizeMarkerForMatch("Lymphocytes"));
  });

  it("matches section-prefixed and plain marker names", () => {
    const existing = [normalizeMarkerForMatch("Complete Blood Count CBC - Packed Cell Volume PCV")];
    const target = normalizeMarkerForMatch("Packed Cell Volume (PCV)");
    const matched = findClosestMarkerKey(target, existing);

    expect(matched).toBe(existing[0]);
  });

  it("does not match unrelated markers", () => {
    const existing = [normalizeMarkerForMatch("Creatinine"), normalizeMarkerForMatch("Platelet Count")];
    const target = normalizeMarkerForMatch("Progesterone");
    const matched = findClosestMarkerKey(target, existing);

    expect(matched).toBeNull();
  });
});
