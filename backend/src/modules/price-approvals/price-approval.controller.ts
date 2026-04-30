import type { RequestHandler } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import * as service from "./price-approval.service";
import { PRICE_APPROVAL_STATUSES } from "./price-approval.model";
import * as audit from "../audit/audit.service";
import { HttpError } from "../../middleware/error";

const objectId = z
  .string()
  .refine((v) => Types.ObjectId.isValid(v), { message: "Invalid ObjectId" });

const createSchema = z.object({
  customerId: objectId,
  agentId: objectId,
  solutionVersionId: objectId,
  requestedAmountCents: z.number().int().min(0),
  note: z.string().optional(),
});

const decisionSchema = z.object({
  decisionNote: z.string().optional(),
});

export const list: RequestHandler = async (req, res, next) => {
  try {
    const status =
      typeof req.query.status === "string"
        ? (req.query.status as (typeof PRICE_APPROVAL_STATUSES)[number])
        : undefined;
    res.json(await service.list({ status }));
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
    const r = await service.create(body);
    void audit.log({
      actorId: req.user.sub,
      action: "price-approval.request",
      targetType: "PriceApprovalRequest",
      targetId: r._id.toString(),
      after: r.toObject(),
      requestId: req.requestId,
    });
    res.status(201).json(r);
  } catch (err) {
    next(err);
  }
};

export const approve: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = decisionSchema.parse(req.body ?? {});
    const result = await service.approve(req.params.id!, req.user.sub, body.decisionNote);
    void audit.log({
      actorId: req.user.sub,
      action: "price-approval.approve",
      targetType: "PriceApprovalRequest",
      targetId: req.params.id!,
      after: result.request.toObject(),
      metadata: { contractId: result.contract._id.toString() },
      requestId: req.requestId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const reject: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = decisionSchema.parse(req.body ?? {});
    const r = await service.reject(req.params.id!, req.user.sub, body.decisionNote);
    void audit.log({
      actorId: req.user.sub,
      action: "price-approval.reject",
      targetType: "PriceApprovalRequest",
      targetId: req.params.id!,
      after: r.toObject(),
      requestId: req.requestId,
    });
    res.json(r);
  } catch (err) {
    next(err);
  }
};

export const cancel: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const r = await service.cancel(req.params.id!);
    void audit.log({
      actorId: req.user.sub,
      action: "price-approval.cancel",
      targetType: "PriceApprovalRequest",
      targetId: req.params.id!,
      after: r.toObject(),
      requestId: req.requestId,
    });
    res.json(r);
  } catch (err) {
    next(err);
  }
};
