import type { RequestHandler } from "express";
import { z } from "zod";
import * as service from "./reversal-review.service";
import {
  REVERSAL_REVIEW_DECISIONS,
  REVERSAL_REVIEW_STATUSES,
} from "./reversal-review.model";
import * as audit from "../audit/audit.service";
import { HttpError } from "../../middleware/error";
import { buildScope } from "../../lib/scope";

const decideSchema = z.object({
  decision: z.enum(REVERSAL_REVIEW_DECISIONS),
  reduceCents: z.number().int().min(0).nullish(),
  note: z.string().max(2000).optional(),
});

export const list: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const scope = await buildScope(req.user);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const kind = typeof req.query.kind === "string" ? req.query.kind : undefined;
    if (status && !REVERSAL_REVIEW_STATUSES.includes(status as never)) {
      throw new HttpError(400, "Invalid status");
    }
    res.json(await service.list({ status: status as never, kind }, scope));
  } catch (err) {
    next(err);
  }
};

export const get: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    res.json(await service.getById(req.params.id!));
  } catch (err) {
    next(err);
  }
};

export const decide: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = decideSchema.parse(req.body);
    const r = await service.decide(
      req.params.id!,
      body.decision,
      body.reduceCents ?? null,
      req.user.sub,
      body.note ?? ""
    );
    void audit.log({
      actorId: req.user.sub,
      action: `reversal-review.${body.decision.toLowerCase()}`,
      targetType: "ReversalReview",
      targetId: r._id.toString(),
      after: r.toObject(),
      requestId: req.requestId,
    });
    res.json(r);
  } catch (err) {
    next(err);
  }
};

export const pendingCount: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    res.json({ count: await service.pendingCount() });
  } catch (err) {
    next(err);
  }
};
