import { describe, expect, it } from "vitest";
import { quote } from "../src/modules/custom-pricing/pricing.service";

describe("custom pricing quote engine", () => {
  it("computes linear base from kWh", () => {
    const r = quote(
      {
        panelsBasePerKwhCents: 200_000, // €2,000/kWh
        batteryBasePerKwhCents: 150_000, // €1,500/kWh
        stepRules: [],
      },
      { panelsKwh: 5, batteryKwh: 10 }
    );
    expect(r.panelsBaseCents).toBe(1_000_000); // 5 × 200_000
    expect(r.batteryBaseCents).toBe(1_500_000); // 10 × 150_000
    expect(r.totalCents).toBe(2_500_000);
    expect(r.steps).toHaveLength(0);
  });

  it("applies single step rule when threshold exceeded", () => {
    const r = quote(
      {
        panelsBasePerKwhCents: 200_000,
        batteryBasePerKwhCents: 0,
        stepRules: [{ variable: "panels", thresholdKwh: 6, addCents: 100_000 }],
      },
      { panelsKwh: 7, batteryKwh: 0 }
    );
    expect(r.steps).toHaveLength(1);
    expect(r.totalCents).toBe(7 * 200_000 + 100_000);
  });

  it("does not apply step rule at exactly the threshold (strictly greater)", () => {
    const r = quote(
      {
        panelsBasePerKwhCents: 100_000,
        batteryBasePerKwhCents: 0,
        stepRules: [{ variable: "panels", thresholdKwh: 6, addCents: 100_000 }],
      },
      { panelsKwh: 6, batteryKwh: 0 }
    );
    expect(r.steps).toHaveLength(0);
    expect(r.totalCents).toBe(600_000);
  });

  it("applies multiple step rules when crossing more than one threshold", () => {
    const r = quote(
      {
        panelsBasePerKwhCents: 200_000,
        batteryBasePerKwhCents: 0,
        stepRules: [
          { variable: "panels", thresholdKwh: 6, addCents: 100_000, label: "small bonus" },
          { variable: "panels", thresholdKwh: 10, addCents: 3_000_000, label: "big bonus" },
        ],
      },
      { panelsKwh: 12, batteryKwh: 0 }
    );
    expect(r.steps).toHaveLength(2);
    expect(r.totalCents).toBe(12 * 200_000 + 100_000 + 3_000_000);
  });

  it("treats panels and battery rules independently", () => {
    const r = quote(
      {
        panelsBasePerKwhCents: 100_000,
        batteryBasePerKwhCents: 100_000,
        stepRules: [
          { variable: "panels", thresholdKwh: 5, addCents: 50_000 },
          { variable: "battery", thresholdKwh: 8, addCents: 25_000 },
        ],
      },
      { panelsKwh: 6, batteryKwh: 4 }
    );
    // panels triggers (6 > 5), battery doesn't (4 ≤ 8)
    expect(r.steps).toHaveLength(1);
    expect(r.totalCents).toBe(6 * 100_000 + 4 * 100_000 + 50_000);
  });

  it("rejects negative inputs", () => {
    expect(() =>
      quote(
        {
          panelsBasePerKwhCents: 100_000,
          batteryBasePerKwhCents: 100_000,
          stepRules: [],
        },
        { panelsKwh: -1, batteryKwh: 0 }
      )
    ).toThrow();
  });
});
