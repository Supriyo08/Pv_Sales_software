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
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value !== "object") return value;
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
    });
  } catch (err) {
    logger.error({ err, input }, "Failed to write audit log");
  }
}
