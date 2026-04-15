import { describe, expect, it } from "vitest";
import { extractMeaningfulLabData } from "@/lib/labReportParser";

describe("labReportParser", () => {
  it("parses table-style blood report rows", () => {
    const raw = [
      "Feature Mean SD Minimum",
      "Blood pressure [mm Hg]",
      "systolic 134.42 23.14 90",
      "diastolic 74.54 10.9 52",
      "Cholesterol [mg/dl]",
      "total 208.36 42.89 144",
      "HDL 65.02 14.22 42",
      "LDL 124.41 37.65 63",
      "Triglycerides [mg/dl] 121.28 48.53 48",
      "Blood sugar level [mg%] 101.55 16.32 60",
    ].join("\n");

    const result = extractMeaningfulLabData(raw);

    expect(result.possibleReport).toBe(true);
    expect(result.markers.length).toBeGreaterThanOrEqual(5);
    expect(result.markers.some((m) => /systolic/i.test(m.name))).toBe(true);
    expect(result.markers.some((m) => /ldl/i.test(m.name))).toBe(true);
  });

  it("marks unrelated technical text as non-report", () => {
    const raw = [
      "Multiplexer board v2",
      "pin1 12 pin2 5 pin3 0",
      "clock 50 hz",
      "resistor 220 and capacitor 47",
    ].join("\n");

    const result = extractMeaningfulLabData(raw);

    expect(result.possibleReport).toBe(false);
  });
});
