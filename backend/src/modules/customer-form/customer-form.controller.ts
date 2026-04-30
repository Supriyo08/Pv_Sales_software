import type { RequestHandler } from "express";
import { z } from "zod";
import * as service from "./customer-form.service";
import { CUSTOMER_FIELD_TYPES } from "./customer-form.model";
import * as audit from "../audit/audit.service";
import { HttpError } from "../../middleware/error";

const fieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(CUSTOMER_FIELD_TYPES),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  helpText: z.string().optional(),
  options: z.array(z.string()).optional(),
  order: z.number().int().optional(),
});

const updateSchema = z.object({
  fields: z.array(fieldSchema),
});

export const get: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await service.get());
  } catch (err) {
    next(err);
  }
};

export const update: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = updateSchema.parse(req.body);
    const cfg = await service.update(body.fields, req.user.sub);
    void audit.log({
      actorId: req.user.sub,
      action: "customer-form.update",
      targetType: "CustomerFormConfig",
      targetId: cfg._id.toString(),
      after: cfg.toObject(),
      requestId: req.requestId,
    });
    res.json(cfg);
  } catch (err) {
    next(err);
  }
};
