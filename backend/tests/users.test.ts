import { describe, expect, it } from "vitest";
import * as userService from "../src/modules/users/user.service";
import { makeUser, makeTerritory } from "./factories";

describe("user.service hierarchy validation", () => {
  it("creates an ADMIN with no manager", async () => {
    const u = await userService.adminCreate({
      email: "admin@x.com",
      password: "password",
      fullName: "Admin",
      role: "ADMIN",
    });
    expect(u?.role).toBe("ADMIN");
    expect(u?.managerId).toBeNull();
  });

  it("rejects ADMIN with managerId", async () => {
    const am = await makeUser({ role: "AREA_MANAGER" });
    await expect(
      userService.adminCreate({
        email: "x@x.com",
        password: "password",
        fullName: "X",
        role: "ADMIN",
        managerId: am._id.toString(),
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects AGENT without manager", async () => {
    await expect(
      userService.adminCreate({
        email: "x@x.com",
        password: "password",
        fullName: "X",
        role: "AGENT",
      })
    ).rejects.toMatchObject({ status: 400, message: /must have a manager/ });
  });

  it("rejects AGENT under another AGENT", async () => {
    const am = await makeUser({ role: "AREA_MANAGER" });
    const otherAgent = await makeUser({ role: "AGENT", managerId: am._id.toString() });
    await expect(
      userService.adminCreate({
        email: "x@x.com",
        password: "password",
        fullName: "X",
        role: "AGENT",
        managerId: otherAgent._id.toString(),
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects AREA_MANAGER managed by non-ADMIN", async () => {
    const am = await makeUser({ role: "AREA_MANAGER" });
    await expect(
      userService.adminCreate({
        email: "x@x.com",
        password: "password",
        fullName: "X",
        role: "AREA_MANAGER",
        managerId: am._id.toString(),
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("creates AGENT under AREA_MANAGER", async () => {
    const am = await makeUser({ role: "AREA_MANAGER" });
    const agent = await userService.adminCreate({
      email: "agent@x.com",
      password: "password",
      fullName: "A",
      role: "AGENT",
      managerId: am._id.toString(),
    });
    expect(agent?.role).toBe("AGENT");
    expect(agent?.managerId?.toString()).toBe(am._id.toString());
  });

  it("rejects email duplicate", async () => {
    await makeUser({ email: "dup@x.com", role: "AREA_MANAGER" });
    await expect(
      userService.adminCreate({
        email: "dup@x.com",
        password: "password",
        fullName: "X",
        role: "AREA_MANAGER",
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("validates territory exists", async () => {
    const am = await makeUser({ role: "AREA_MANAGER" });
    await expect(
      userService.adminCreate({
        email: "agent@x.com",
        password: "password",
        fullName: "A",
        role: "AGENT",
        managerId: am._id.toString(),
        territoryId: "507f1f77bcf86cd799439011",
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("accepts valid territory assignment", async () => {
    const am = await makeUser({ role: "AREA_MANAGER" });
    const t = await makeTerritory();
    const agent = await userService.adminCreate({
      email: "agent@x.com",
      password: "password",
      fullName: "A",
      role: "AGENT",
      managerId: am._id.toString(),
      territoryId: t._id.toString(),
    });
    expect(agent?.territoryId?.toString()).toBe(t._id.toString());
  });

  it("update detects manager-cycle", async () => {
    const am1 = await makeUser({ role: "AREA_MANAGER" });
    const am2 = await makeUser({ role: "AREA_MANAGER" });
    const admin = await makeUser({ role: "ADMIN" });
    await userService.adminUpdate(am1._id.toString(), { managerId: admin._id.toString() });
    await userService.adminUpdate(am2._id.toString(), { managerId: admin._id.toString() });
    await expect(
      userService.adminUpdate(admin._id.toString(), { managerId: am1._id.toString() })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("soft-deletes user and excludes from list", async () => {
    const am = await makeUser({ role: "AREA_MANAGER" });
    await userService.softDelete(am._id.toString());
    const list = await userService.list();
    expect(list.find((u) => u._id.equals(am._id))).toBeUndefined();
  });
});
