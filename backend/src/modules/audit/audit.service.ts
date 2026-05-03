import { Types } from "mongoose";
import { AuditLog } from "./audit.model";
import { logger } from "../../utils/logger";

export type AuditInput = {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
};

const SENSITIVE_KEYS = new Set(["password", "passwordHash", "refreshToken", "accessToken"]);

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;

  // Convert special Mongo/JS objects into JSON-friendly primitives BEFORE recursing,
  // otherwise we end up with the underlying { buffer: { 0: ..., 1: ... } } shape.
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Types.ObjectId) return value.toString();
  if (Buffer.isBuffer(value)) return value.toString("hex");
  // Mongoose Decimal128, Long etc. all have toString — fall back if it's not a plain object.
  const proto = Object.getPrototypeOf(value);
  const isPlain = proto === Object.prototype || proto === null;
  if (!isPlain && !Array.isArray(value)) {
    if (typeof (value as { toString?: () => string }).toString === "function") {
      const s = (value as { toString: () => string }).toString();
      if (s !== "[object Object]") return s;
    }
  }

  if (Array.isArray(value)) return value.map(redact);

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.has(k) ? "[redacted]" : redact(v);
  }
  return out;
}

export async function log(input: AuditInput): Promise<void> {
  try {
    await AuditLog.create({
      ...input,
      before: input.before === undefined ? null : redact(input.before),
      after: input.after === undefined ? null : redact(input.after),
      metadata:
        input.metadata === undefined || input.metadata === null
          ? input.metadata ?? null
          : (redact(input.metadata) as Record<string, unknown>),
    });
  } catch (err) {
    logger.error({ err, input }, "Failed to write audit log");
  }
}

/**
 * Per Review 1.2 (2026-05-04): retrieve every audit entry that touched a given
 * target (e.g. a contract template) — used to build a per-record version
 * history. Returns chronological ascending so the UI can render a timeline
 * + diff between successive `after` snapshots.
 */
export async function listForTarget(
  targetType: string,
  targetId: string
): Promise<unknown[]> {
  return AuditLog.find({ targetType, targetId })
    .sort({ createdAt: 1 })
    .limit(500)
    .lean();
}
