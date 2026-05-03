import type { RequestHandler } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import * as solutions from "./solution.service";
import * as bonusRules from "./bonus-rule.service";
import * as installmentPlans from "./installment-plan.service";
import { BONUS_CONDITIONS } from "./bonus-rule.model";
import { USER_ROLES } from "../users/user.model";
import * as audit from "../audit/audit.service";
import { HttpError } from "../../middleware/error";

const objectId = z
  .string()
  .refine((v) => Types.ObjectId.isValid(v), { message: "Invalid ObjectId" });

const createSolutionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const createVersionSchema = z.object({
  validFrom: z.coerce.date(),
  validTo: z.coerce.date().nullish(),
  basePriceCents: z.number().int().min(0),
  minPriceCents: z.number().int().min(0).nullish(),
  maxPriceCents: z.number().int().min(0).nullish(),
  currency: z.string().length(3).optional(),
  agentBp: z.number().int().min(0).max(10_000),
  managerBp: z.number().int().min(0).max(10_000),
  changeReason: z.string().optional(),
  active: z.boolean().optional(),
  boundToUserIds: z.array(objectId).optional(),
  boundToTerritoryIds: z.array(objectId).optional(),
  boundToCustomerIds: z.array(objectId).optional(),
});

// Per Review 1.2 (2026-05-04): pricing matrix row schema. Mirrors the SolutionVersion
// model (see solution-version.model.ts).
const pricingMatrixRowSchema = z.object({
  label: z.string().max(120).optional(),
  paymentMethod: z.enum([
    "ONE_TIME",
    "ADVANCE_INSTALLMENTS",
    "FULL_INSTALLMENTS",
  ]),
  installmentPlanId: objectId.nullish(),
  advanceMinCents: z.number().int().min(0).nullish(),
  advanceMaxCents: z.number().int().min(0).nullish(),
  finalPriceCents: z.number().int().min(0).nullish(),
  finalPricePct: z.number().min(0).max(1000).nullish(),
  agentBp: z.number().int().min(0).max(10_000).nullish(),
  agentPct: z.number().min(0).max(100).nullish(),
  managerBp: z.number().int().min(0).max(10_000).nullish(),
  managerPct: z.number().min(0).max(100).nullish(),
});

const updateVersionSchema = z.object({
  active: z.boolean().optional(),
  minPriceCents: z.number().int().min(0).nullish(),
  maxPriceCents: z.number().int().min(0).nullish(),
  boundToUserIds: z.array(objectId).optional(),
  boundToTerritoryIds: z.array(objectId).optional(),
  boundToCustomerIds: z.array(objectId).optional(),
  pricingMatrix: z.array(pricingMatrixRowSchema).optional(),
});

const createBonusRuleSchema = z.object({
  name: z.string().min(1),
  role: z.enum(USER_ROLES),
  conditionType: z.enum(BONUS_CONDITIONS),
  threshold: z.number().int().min(0),
  basisPoints: z.number().int().min(0).max(10_000),
  validFrom: z.coerce.date(),
  validTo: z.coerce.date().nullish(),
  userId: objectId.nullish(),
});

const createInstallmentPlanSchema = z.object({
  name: z.string().min(1),
  months: z.number().int().min(1).max(240),
  surchargeBp: z.number().int().min(0).max(10_000).optional(),
  description: z.string().optional(),
  active: z.boolean().optional(),
  // Per Review 1.1 §4.
  solutionIds: z.array(objectId).optional(),
  advanceMinCents: z.number().int().min(0).nullish(),
  advanceMaxCents: z.number().int().min(0).nullish(),
});

const updateInstallmentPlanSchema = createInstallmentPlanSchema.partial();

export const listSolutions: RequestHandler = async (req, res, next) => {
  try {
    const enriched = req.query.enriched === "true";
    const includeArchived = req.query.includeArchived === "true";
    if (enriched) {
      res.json(await solutions.listSolutionsEnriched({ includeArchived }));
    } else {
      res.json(await solutions.listSolutions({ includeArchived }));
    }
  } catch (err) {
    next(err);
  }
};

// Per Review 1.1 §3: deactivate / activate / archive a whole solution.
export const setSolutionActive: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const active = req.body?.active === true;
    const s = await solutions.setActive(req.params.id!, active);
    void audit.log({
      actorId: req.user.sub,
      action: active ? "solution.activate" : "solution.deactivate",
      targetType: "Solution",
      targetId: s._id.toString(),
      after: s.toObject(),
      requestId: req.requestId,
    });
    res.json(s);
  } catch (err) {
    next(err);
  }
};

export const archiveSolution: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const s = await solutions.archive(req.params.id!);
    void audit.log({
      actorId: req.user.sub,
      action: "solution.archive",
      targetType: "Solution",
      targetId: s._id.toString(),
      after: s.toObject(),
      requestId: req.requestId,
    });
    res.json(s);
  } catch (err) {
    next(err);
  }
};

export const unarchiveSolution: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const s = await solutions.unarchive(req.params.id!);
    void audit.log({
      actorId: req.user.sub,
      action: "solution.unarchive",
      targetType: "Solution",
      targetId: s._id.toString(),
      after: s.toObject(),
      requestId: req.requestId,
    });
    res.json(s);
  } catch (err) {
    next(err);
  }
};

export const getSolution: RequestHandler = async (req, res, next) => {
  try {
    res.json(await solutions.getSolution(req.params.id!));
  } catch (err) {
    next(err);
  }
};

// Per Review 1.2 (2026-05-04): per-solution dashboard with summary + recent.
// Scope is enforced by passing the requesting user's visible agents.
export const solutionDashboard: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const { buildScope } = await import("../../lib/scope");
    const scope = await buildScope(req.user);
    const opts = scope.isAdmin
      ? {}
      : { agentIds: scope.agentIds };
    res.json(await solutions.dashboard(req.params.id!, opts));
  } catch (err) {
    next(err);
  }
};

export const getVersion: RequestHandler = async (req, res, next) => {
  try {
    res.json(await solutions.getVersion(req.params.id!));
  } catch (err) {
    next(err);
  }
};

export const getInstallmentPlan: RequestHandler = async (req, res, next) => {
  try {
    res.json(await installmentPlans.getById(req.params.id!));
  } catch (err) {
    next(err);
  }
};

export const createSolution: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = createSolutionSchema.parse(req.body);
    const s = await solutions.createSolution(body);
    void audit.log({
      actorId: req.user.sub,
      action: "solution.create",
      targetType: "Solution",
      targetId: s._id.toString(),
      after: s.toObject(),
      requestId: req.requestId,
    });
    res.status(201).json(s);
  } catch (err) {
    next(err);
  }
};

export const listVersions: RequestHandler = async (req, res, next) => {
  try {
    res.json(await solutions.listVersions(req.params.id!));
  } catch (err) {
    next(err);
  }
};

export const activeVersion: RequestHandler = async (req, res, next) => {
  try {
    const at = req.query.at ? new Date(String(req.query.at)) : new Date();
    res.json(await solutions.activeVersionAt(req.params.id!, at));
  } catch (err) {
    next(err);
  }
};

export const createVersion: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = createVersionSchema.parse(req.body);
    const v = await solutions.createVersion(req.params.id!, req.user.sub, body);
    void audit.log({
      actorId: req.user.sub,
      action: "solution.version.create",
      targetType: "SolutionVersion",
      targetId: v._id.toString(),
      after: v.toObject(),
      requestId: req.requestId,
    });
    res.status(201).json(v);
  } catch (err) {
    next(err);
  }
};

export const updateVersion: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = updateVersionSchema.parse(req.body);
    const v = await solutions.updateVersion(req.params.versionId!, body);
    void audit.log({
      actorId: req.user.sub,
      action: "solution.version.update",
      targetType: "SolutionVersion",
      targetId: v._id.toString(),
      after: v.toObject(),
      requestId: req.requestId,
    });
    res.json(v);
  } catch (err) {
    next(err);
  }
};

export const listInstallmentPlans: RequestHandler = async (req, res, next) => {
  try {
    const activeOnly = req.query.active === "true";
    const solutionId = typeof req.query.solutionId === "string" ? req.query.solutionId : undefined;
    res.json(await installmentPlans.list({ activeOnly, solutionId }));
  } catch (err) {
    next(err);
  }
};

export const createInstallmentPlan: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = createInstallmentPlanSchema.parse(req.body);
    const p = await installmentPlans.create(body);
    void audit.log({
      actorId: req.user.sub,
      action: "installment-plan.create",
      targetType: "InstallmentPlan",
      targetId: p._id.toString(),
      after: p.toObject(),
      requestId: req.requestId,
    });
    res.status(201).json(p);
  } catch (err) {
    next(err);
  }
};

export const updateInstallmentPlan: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = updateInstallmentPlanSchema.parse(req.body);
    const p = await installmentPlans.update(req.params.id!, body);
    void audit.log({
      actorId: req.user.sub,
      action: "installment-plan.update",
      targetType: "InstallmentPlan",
      targetId: p._id.toString(),
      after: p.toObject(),
      requestId: req.requestId,
    });
    res.json(p);
  } catch (err) {
    next(err);
  }
};

export const deleteInstallmentPlan: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const id = req.params.id!;
    const before = await installmentPlans.softDelete(id);
    void audit.log({
      actorId: req.user.sub,
      action: "installment-plan.delete",
      targetType: "InstallmentPlan",
      targetId: id,
      before: before.toObject(),
      requestId: req.requestId,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const listBonusRules: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await bonusRules.list());
  } catch (err) {
    next(err);
  }
};

export const createBonusRule: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = createBonusRuleSchema.parse(req.body);
    const rule = await bonusRules.create(body);
    void audit.log({
      actorId: req.user.sub,
      action: "bonus-rule.create",
      targetType: "BonusRule",
      targetId: rule._id.toString(),
      after: rule.toObject(),
      requestId: req.requestId,
    });
    res.status(201).json(rule);
  } catch (err) {
    next(err);
  }
};

export const deleteBonusRule: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const id = req.params.id!;
    const before = await bonusRules.softDelete(id);
    void audit.log({
      actorId: req.user.sub,
      action: "bonus-rule.delete",
      targetType: "BonusRule",
      targetId: id,
      before: before.toObject(),
      requestId: req.requestId,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export { objectId };
