import type { RequestHandler } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import * as solutions from "./solution.service";
import * as bonusRules from "./bonus-rule.service";
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
  currency: z.string().length(3).optional(),
  agentBp: z.number().int().min(0).max(10_000),
  managerBp: z.number().int().min(0).max(10_000),
  changeReason: z.string().optional(),
});

const createBonusRuleSchema = z.object({
  name: z.string().min(1),
  role: z.enum(USER_ROLES),
  conditionType: z.enum(BONUS_CONDITIONS),
  threshold: z.number().int().min(0),
  basisPoints: z.number().int().min(0).max(10_000),
  validFrom: z.coerce.date(),
  validTo: z.coerce.date().nullish(),
});

export const listSolutions: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await solutions.listSolutions());
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

export { objectId };
