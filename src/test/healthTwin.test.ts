import { describe, expect, it } from "vitest";
import { buildHealthTwin } from "@/lib/careCopilot";
import type { ReportSnapshot } from "@/lib/reportTracker";

const snapshots: ReportSnapshot[] = [
  {
    id: "r1",
    testDate: "2026-01-10",
    reportTitle: "Jan panel",
    source: "ocr",
    createdAt: "2026-01-10T00:00:00.000Z",
    note: "",
    markers: [
      { name: "Fasting Glucose", value: 95, unit: "mg/dL", refMin: 70, refMax: 99, status: "normal" },
      { name: "TSH", value: 2.0, unit: "uIU/mL", refMin: 0.4, refMax: 4.0, status: "normal" },
    ],
  },
  {
    id: "r2",
    testDate: "2026-03-10",
    reportTitle: "Mar panel",
    source: "ocr",
    createdAt: "2026-03-10T00:00:00.000Z",
    note: "",
    markers: [
      { name: "Fasting Glucose", value: 114, unit: "mg/dL", refMin: 70, refMax: 99, status: "high" },
      { name: "TSH", value: 5.1, unit: "uIU/mL", refMin: 0.4, refMax: 4.0, status: "high" },
    ],
  },
  {
    id: "r3",
    testDate: "2026-04-10",
    reportTitle: "Apr panel",
    source: "ocr",
    createdAt: "2026-04-10T00:00:00.000Z",
    note: "",
    markers: [
      { name: "Fasting Glucose", value: 122, unit: "mg/dL", refMin: 70, refMax: 99, status: "high" },
      { name: "TSH", value: 6.2, unit: "uIU/mL", refMin: 0.4, refMax: 4.0, status: "high" },
      { name: "HbA1c", value: 6.0, unit: "%", refMin: 4.0, refMax: 5.6, status: "high" },
    ],
  },
];

describe("healthTwin", () => {
  it("detects worsening drift and generates alerts", () => {
    const summary = buildHealthTwin(snapshots);

    expect(summary.timeline).toHaveLength(3);
    expect(summary.latestLevel).toBe("watch");
    expect(summary.driftAlerts.some((alert) => /worsening|increased|upward/i.test(alert))).toBe(true);
    expect(summary.timeline[2].driftDirection).toBe("worsening");
  });
});
