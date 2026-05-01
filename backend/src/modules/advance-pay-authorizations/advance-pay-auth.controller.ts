import type { RequestHandler } from "express";
import { z } from "zod";
import * as service from "./advance-pay-auth.service";
import { ADVANCE_AUTH_STATUSES } from "./advance-pay-auth.model";
import * as audit from "../audit/audit.service";
import { HttpError } from "../../middleware/error";
import { buildScope } from "../../lib/scope";

const decideSchema = z.object({
  decision: z.enum(["AUTHORIZED", "DECLINED"]),
  note: z.string().max(2000).optional(),
});

export const list: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const scope = await buildScope(req.user);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const contractId =
      typeof req.query.contractId === "string" ? req.query.contractId : undefined;
    if (status && !ADVANCE_AUTH_STATUSES.includes(status as never)) {
      throw new HttpError(400, "Invalid status");
    }
    res.json(
      await service.list({ status: status as never, contractId }, scope)
    );
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
    const a = await service.decide(req.params.id!, body.decision, req.user.sub, body.note ?? "");
    void audit.log({
      actorId: req.user.sub,
      action: `advance-pay-auth.${body.decision.toLowerCase()}`,
      targetType: "AdvancePayAuthorization",
      targetId: a._id.toString(),
      after: a.toObject(),
      requestId: req.requestId,
    });
    res.json(a);
  } catch (err) {
    next(err);
  }
};

export const pendingCount: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const scope = await buildScope(req.user);
    res.json({ count: await service.pendingCount(scope) });
  } catch (err) {
    next(err);
  }
};
