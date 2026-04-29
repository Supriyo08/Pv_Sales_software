import type { RequestHandler } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import * as contractService from "./contract.service";
import { CONTRACT_STATUSES } from "./contract.model";
import * as audit from "../audit/audit.service";
import { HttpError } from "../../middleware/error";

const objectId = z
  .string()
  .refine((v) => Types.ObjectId.isValid(v), { message: "Invalid ObjectId" });

const createSchema = z.object({
  customerId: objectId,
  agentId: objectId,
  solutionVersionId: objectId.optional(),
  solutionId: objectId.optional(),
  contractDate: z.coerce.date().optional(),
  amountCents: z.number().int().min(0),
  currency: z.string().length(3).optional(),
  leadId: objectId.nullish(),
}).refine((v) => v.solutionVersionId || v.solutionId, {
  message: "Either solutionVersionId or solutionId must be provided",
  path: ["solutionVersionId"],
});

const cancelSchema = z.object({ reason: z.string().optional() });

export const list: RequestHandler = async (req, res, next) => {
  try {
    const agentId = typeof req.query.agentId === "string" ? req.query.agentId : undefined;
    const status = typeof req.query.status === "string" ? (req.query.status as never) : undefined;
    res.json(await contractService.list({ agentId, status }));
  } catch (err) {
    next(err);
  }
};

export const get: RequestHandler = async (req, res, next) => {
  try {
    res.json(await contractService.getById(req.params.id!));
  } catch (err) {
    next(err);
  }
};

export const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = createSchema.parse(req.body);
    const c = await contractService.create({
      ...body,
      leadId: body.leadId ?? null,
    });
    void audit.log({
      actorId: req.user.sub,
      action: "contract.create",
      targetType: "Contract",
      targetId: c._id.toString(),
      after: c.toObject(),
      requestId: req.requestId,
    });
    res.status(201).json(c);
  } catch (err) {
    next(err);
  }
};

export const sign: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const before = (await contractService.getById(req.params.id!)).toObject();
    const c = await contractService.sign(req.params.id!);
    void audit.log({
      actorId: req.user.sub,
      action: "contract.sign",
      targetType: "Contract",
      targetId: c._id.toString(),
      before,
      after: c.toObject(),
      requestId: req.requestId,
    });
    res.json(c);
  } catch (err) {
    next(err);
  }
};

export const cancel: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = cancelSchema.parse(req.body);
    const before = (await contractService.getById(req.params.id!)).toObject();
    const c = await contractService.cancel(req.params.id!, body.reason ?? "");
    void audit.log({
      actorId: req.user.sub,
      action: "contract.cancel",
      targetType: "Contract",
      targetId: c._id.toString(),
      before,
      after: c.toObject(),
      requestId: req.requestId,
    });
    res.json(c);
  } catch (err) {
    next(err);
  }
};

export { CONTRACT_STATUSES };
