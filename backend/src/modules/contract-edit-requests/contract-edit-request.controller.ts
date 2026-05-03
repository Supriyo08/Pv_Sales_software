import type { RequestHandler } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import * as service from "./contract-edit-request.service";
import { EDIT_REQUEST_STATUSES } from "./contract-edit-request.model";
import { PAYMENT_METHODS } from "../contracts/contract.model";
import * as contractService from "../contracts/contract.service";
import * as audit from "../audit/audit.service";
import { HttpError } from "../../middleware/error";
import { buildScope } from "../../lib/scope";

const objectId = z
  .string()
  .refine((v) => Types.ObjectId.isValid(v), { message: "Invalid ObjectId" });

// Per Review 1.2 (2026-05-04): expanded whitelist mirroring the service-layer
// EDITABLE_KEYS so the API accepts every field the spec asks for.
const changesSchema = z
  .object({
    amountCents: z.number().int().min(0).optional(),
    currency: z.string().length(3).optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    advanceCents: z.number().int().min(0).optional(),
    installmentPlanId: objectId.nullish(),
    solutionVersionId: objectId.optional(),
    agentId: objectId.optional(),
    customerId: objectId.optional(),
    leadId: objectId.nullish(),
  })
  .strict();

const createSchema = z.object({
  changes: changesSchema,
  reason: z.string().max(2000).optional(),
});

const decideSchema = z.object({
  note: z.string().max(2000).optional(),
});

export const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = createSchema.parse(req.body);

    // Visibility check: caller must be able to see the contract.
    const scope = await buildScope(req.user);
    await contractService.getById(req.params.id!, scope);

    const er = await service.create({
      contractId: req.params.id!,
      requestedBy: req.user.sub,
      changes: body.changes as Record<string, unknown>,
      reason: body.reason,
    });
    void audit.log({
      actorId: req.user.sub,
      action: "contract-edit-request.create",
      targetType: "ContractEditRequest",
      targetId: er._id.toString(),
      after: er.toObject(),
      requestId: req.requestId,
    });
    res.status(201).json(er);
  } catch (err) {
    next(err);
  }
};

export const list: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const scope = await buildScope(req.user);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const contractId =
      typeof req.query.contractId === "string" ? req.query.contractId : undefined;
    if (status && !EDIT_REQUEST_STATUSES.includes(status as never)) {
      throw new HttpError(400, "Invalid status");
    }
    res.json(
      await service.list(
        { status: status as never, contractId },
        scope
      )
    );
  } catch (err) {
    next(err);
  }
};

export const get: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const er = await service.getById(req.params.id!);
    res.json(er);
  } catch (err) {
    next(err);
  }
};

export const approve: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = decideSchema.parse(req.body);
    const er = await service.approve(req.params.id!, req.user.sub, body.note ?? "");
    void audit.log({
      actorId: req.user.sub,
      action: "contract-edit-request.approve",
      targetType: "ContractEditRequest",
      targetId: er._id.toString(),
      after: er.toObject(),
      requestId: req.requestId,
    });
    res.json(er);
  } catch (err) {
    next(err);
  }
};

export const reject: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = decideSchema.parse(req.body);
    const er = await service.reject(req.params.id!, req.user.sub, body.note ?? "");
    void audit.log({
      actorId: req.user.sub,
      action: "contract-edit-request.reject",
      targetType: "ContractEditRequest",
      targetId: er._id.toString(),
      after: er.toObject(),
      requestId: req.requestId,
    });
    res.json(er);
  } catch (err) {
    next(err);
  }
};

export const cancel: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const er = await service.cancel(req.params.id!, req.user.sub);
    void audit.log({
      actorId: req.user.sub,
      action: "contract-edit-request.cancel",
      targetType: "ContractEditRequest",
      targetId: er._id.toString(),
      after: er.toObject(),
      requestId: req.requestId,
    });
    res.json(er);
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
