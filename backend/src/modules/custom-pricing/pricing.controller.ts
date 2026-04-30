import type { RequestHandler } from "express";
import { z } from "zod";
import * as service from "./pricing.service";
import { PRICING_VARIABLES } from "./pricing.model";
import * as audit from "../audit/audit.service";
import { HttpError } from "../../middleware/error";

const stepRuleSchema = z.object({
  variable: z.enum(PRICING_VARIABLES),
  thresholdKwh: z.number().min(0),
  addCents: z.number().int(),
  label: z.string().optional(),
});

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  panelsBasePerKwhCents: z.number().int().min(0),
  batteryBasePerKwhCents: z.number().int().min(0),
  stepRules: z.array(stepRuleSchema).optional(),
  currency: z.string().length(3).optional(),
  active: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

const quoteSchema = z.object({
  panelsKwh: z.number().min(0),
  batteryKwh: z.number().min(0),
});

export const list: RequestHandler = async (req, res, next) => {
  try {
    const activeOnly = req.query.active === "true";
    res.json(await service.list({ activeOnly }));
  } catch (err) {
    next(err);
  }
};

export const get: RequestHandler = async (req, res, next) => {
  try {
    res.json(await service.getById(req.params.id!));
  } catch (err) {
    next(err);
  }
};

export const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = createSchema.parse(req.body);
    const f = await service.create({ ...body, createdBy: req.user.sub });
    void audit.log({
      actorId: req.user.sub,
      action: "pricing-formula.create",
      targetType: "PricingFormula",
      targetId: f._id.toString(),
      after: f.toObject(),
      requestId: req.requestId,
    });
    res.status(201).json(f);
  } catch (err) {
    next(err);
  }
};

export const update: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = updateSchema.parse(req.body);
    const f = await service.update(req.params.id!, body);
    void audit.log({
      actorId: req.user.sub,
      action: "pricing-formula.update",
      targetType: "PricingFormula",
      targetId: f._id.toString(),
      after: f.toObject(),
      requestId: req.requestId,
    });
    res.json(f);
  } catch (err) {
    next(err);
  }
};

export const remove: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const id = req.params.id!;
    const before = await service.softDelete(id);
    void audit.log({
      actorId: req.user.sub,
      action: "pricing-formula.delete",
      targetType: "PricingFormula",
      targetId: id,
      before: before.toObject(),
      requestId: req.requestId,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const quote: RequestHandler = async (req, res, next) => {
  try {
    const body = quoteSchema.parse(req.body);
    const f = await service.getById(req.params.id!);
    res.json(service.quote(f, body));
  } catch (err) {
    next(err);
  }
};
