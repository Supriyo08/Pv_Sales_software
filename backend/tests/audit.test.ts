import { describe, expect, it } from "vitest";
import { Types } from "mongoose";
import * as auditService from "../src/modules/audit/audit.service";
import { AuditLog } from "../src/modules/audit/audit.model";

describe("audit.service redaction", () => {
  it("converts ObjectIds to hex strings (not Buffer dumps)", async () => {
    const oid = new Types.ObjectId();
    await auditService.log({
      actorId: oid.toString(),
      action: "test.create",
      targetType: "Test",
      targetId: oid.toString(),
      after: { _id: oid, nested: { ref: oid } },
    });
    const row = await AuditLog.findOne({ action: "test.create" });
    const after = row!.after as { _id: string; nested: { ref: string } };
    expect(typeof after._id).toBe("string");
    expect(after._id).toBe(oid.toString());
    expect(after.nested.ref).toBe(oid.toString());
  });

  it("converts Dates to ISO strings", async () => {
    const d = new Date("2026-04-15T10:00:00Z");
    await auditService.log({
      actorId: new Types.ObjectId().toString(),
      action: "test.date",
      targetType: "Test",
      targetId: "x",
      after: { signedAt: d },
    });
    const row = await AuditLog.findOne({ action: "test.date" });
    const after = row!.after as { signedAt: string };
    expect(after.signedAt).toBe("2026-04-15T10:00:00.000Z");
  });

  it("redacts sensitive keys", async () => {
    await auditService.log({
      actorId: new Types.ObjectId().toString(),
      action: "test.secret",
      targetType: "Test",
      targetId: "x",
      after: { email: "x@y.com", passwordHash: "abc", refreshToken: "rt" },
    });
    const row = await AuditLog.findOne({ action: "test.secret" });
    const after = row!.after as Record<string, string>;
    expect(after.email).toBe("x@y.com");
    expect(after.passwordHash).toBe("[redacted]");
    expect(after.refreshToken).toBe("[redacted]");
  });

  it("handles arrays and nested structures", async () => {
    const oid = new Types.ObjectId();
    await auditService.log({
      actorId: oid.toString(),
      action: "test.deep",
      targetType: "Test",
      targetId: "x",
      after: {
        items: [
          { id: oid, when: new Date("2026-01-01") },
          { id: oid, when: new Date("2026-02-01") },
        ],
      },
    });
    const row = await AuditLog.findOne({ action: "test.deep" });
    const after = row!.after as { items: { id: string; when: string }[] };
    expect(after.items[0]!.id).toBe(oid.toString());
    expect(after.items[1]!.when).toBe("2026-02-01T00:00:00.000Z");
  });
});
