import type { RequestHandler } from "express";
import { z } from "zod";
import * as service from "./advance-pay-auth.service";
import { ADVANCE_AUTH_STATUSES } from "./advance-pay-auth.model";
import * as audit from "../audit/audit.service";
import { HttpError } from "../../middleware/error";
import { buildScope } from "../../lib/scope";

const decideSchema = z.object({
  decision: z.enum(["APPROVED", "DECLINED"]),
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

/**
 * Per Review 1.2 (2026-05-04): stage-1 decision by the assigned area manager.
 * Approval escalates to PENDING_ADMIN; decline is terminal.
 */
export const decideManager: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = decideSchema.parse(req.body);
    const a = await service.decideManager(
      req.params.id!,
      body.decision,
      req.user.sub,
      body.note ?? ""
    );
    void audit.log({
      actorId: req.user.sub,
      action: `advance-pay-auth.manager.${body.decision.toLowerCase()}`,
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

/**
 * Per Review 1.2 (2026-05-04): stage-2 decision by admin (only if manager
 * already approved). Approval triggers commission generation.
 */
export const decideAdmin: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = decideSchema.parse(req.body);
    const a = await service.decideAdmin(
      req.params.id!,
      body.decision,
      req.user.sub,
      body.note ?? ""
    );
    void audit.log({
      actorId: req.user.sub,
      action: `advance-pay-auth.admin.${body.decision.toLowerCase()}`,
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
    const stage = req.query.stage === "MANAGER" || req.query.stage === "ADMIN"
      ? (req.query.stage as "MANAGER" | "ADMIN")
      : "ANY";
    res.json({ count: await service.pendingCount(scope, stage) });
  } catch (err) {
    next(err);
  }
};
