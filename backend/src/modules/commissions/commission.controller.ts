import type { RequestHandler } from "express";
import * as commissionService from "./commission.service";
import * as audit from "../audit/audit.service";
import { HttpError } from "../../middleware/error";

export const list: RequestHandler = async (req, res, next) => {
  try {
    const beneficiaryUserId =
      typeof req.query.userId === "string" ? req.query.userId : undefined;
    const contractId =
      typeof req.query.contractId === "string" ? req.query.contractId : undefined;
    const period = typeof req.query.period === "string" ? req.query.period : undefined;
    const active = req.query.active === "true";
    res.json(
      await commissionService.list({ beneficiaryUserId, contractId, period, active })
    );
  } catch (err) {
    next(err);
  }
};

export const listForUser: RequestHandler = async (req, res, next) => {
  try {
    const period = typeof req.query.period === "string" ? req.query.period : undefined;
    const active = req.query.active === "true";
    res.json(
      await commissionService.list({
        beneficiaryUserId: req.params.userId!,
        period,
        active,
      })
    );
  } catch (err) {
    next(err);
  }
};

export const recalcContract: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const reason = typeof req.body?.reason === "string" ? req.body.reason : "manual recalc";
    const created = await commissionService.recalculateForContract(req.params.id!, reason);
    void audit.log({
      actorId: req.user.sub,
      action: "commission.recalculate",
      targetType: "Contract",
      targetId: req.params.id!,
      metadata: { reason, newCount: created.length },
      requestId: req.requestId,
    });
    res.json({ created: created.length });
  } catch (err) {
    next(err);
  }
};

export const recalcSolution: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const reason =
      typeof req.body?.reason === "string" ? req.body.reason : "manual solution-wide recalc";
    const result = await commissionService.recalculateContractsForSolution(
      req.params.id!,
      reason
    );
    void audit.log({
      actorId: req.user.sub,
      action: "commission.recalculate.solution",
      targetType: "Solution",
      targetId: req.params.id!,
      metadata: { reason, ...result },
      requestId: req.requestId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};
