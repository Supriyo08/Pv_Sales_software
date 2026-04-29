import { describe, expect, it } from "vitest";
import * as bonusRuleService from "../src/modules/catalog/bonus-rule.service";

describe("bonus rule role+condition validation", () => {
  it("accepts AGENT + AGENT_INSTALLATIONS_GTE", async () => {
    const r = await bonusRuleService.create({
      name: "ok agent",
      role: "AGENT",
      conditionType: "AGENT_INSTALLATIONS_GTE",
      threshold: 5,
      basisPoints: 1000,
      validFrom: new Date("2026-01-01"),
    });
    expect(r.role).toBe("AGENT");
  });

  it("accepts AREA_MANAGER + NETWORK_INSTALLATIONS_GTE", async () => {
    const r = await bonusRuleService.create({
      name: "ok manager",
      role: "AREA_MANAGER",
      conditionType: "NETWORK_INSTALLATIONS_GTE",
      threshold: 5,
      basisPoints: 1000,
      validFrom: new Date("2026-01-01"),
    });
    expect(r.role).toBe("AREA_MANAGER");
  });

  it("rejects ADMIN + AGENT_INSTALLATIONS_GTE", async () => {
    await expect(
      bonusRuleService.create({
        name: "bad",
        role: "ADMIN",
        conditionType: "AGENT_INSTALLATIONS_GTE",
        threshold: 5,
        basisPoints: 1000,
        validFrom: new Date("2026-01-01"),
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects AGENT + NETWORK_INSTALLATIONS_GTE", async () => {
    await expect(
      bonusRuleService.create({
        name: "bad2",
        role: "AGENT",
        conditionType: "NETWORK_INSTALLATIONS_GTE",
        threshold: 5,
        basisPoints: 1000,
        validFrom: new Date("2026-01-01"),
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects AREA_MANAGER + AGENT_INSTALLATIONS_GTE", async () => {
    await expect(
      bonusRuleService.create({
        name: "bad3",
        role: "AREA_MANAGER",
        conditionType: "AGENT_INSTALLATIONS_GTE",
        threshold: 5,
        basisPoints: 1000,
        validFrom: new Date("2026-01-01"),
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});
