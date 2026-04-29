import type { RequestHandler } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { AuditLog } from "./audit.model";

const objectId = z
  .string()
  .refine((v) => Types.ObjectId.isValid(v), { message: "Invalid ObjectId" });

const querySchema = z.object({
  targetType: z.string().optional(),
  targetId: objectId.optional(),
  actorId: objectId.optional(),
  action: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: z.string().optional(),
});

export const list: RequestHandler = async (req, res, next) => {
  try {
    const q = querySchema.parse(req.query);
    const filter: Record<string, unknown> = {};
    if (q.targetType) filter.targetType = q.targetType;
    if (q.targetId) filter.targetId = q.targetId;
    if (q.actorId) filter.actorId = q.actorId;
    if (q.action) filter.action = q.action;
    if (q.from || q.to) {
      const range: Record<string, Date> = {};
      if (q.from) range.$gte = q.from;
      if (q.to) range.$lte = q.to;
      filter.createdAt = range;
    }
    if (q.cursor) {
      filter._id = { $lt: new Types.ObjectId(q.cursor) };
    }

    const items = await AuditLog.find(filter)
      .sort({ _id: -1 })
      .limit(q.limit + 1);

    const hasMore = items.length > q.limit;
    const trimmed = hasMore ? items.slice(0, q.limit) : items;
    const nextCursor = hasMore ? trimmed[trimmed.length - 1]?._id?.toString() : null;

    res.json({ items: trimmed, nextCursor });
  } catch (err) {
    next(err);
  }
};
