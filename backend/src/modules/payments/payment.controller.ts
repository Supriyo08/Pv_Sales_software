import type { RequestHandler } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import * as paymentService from "./payment.service";
import { TRANSACTION_KINDS, PAYMENT_METHODS } from "./payment-transaction.model";
import * as audit from "../audit/audit.service";
import { HttpError } from "../../middleware/error";

const objectId = z
  .string()
  .refine((v) => Types.ObjectId.isValid(v), { message: "Invalid ObjectId" });

const createSchema = z.object({
  userId: objectId,
  period: z.string().regex(/^\d{4}-\d{2}$/),
});

const txSchema = z.object({
  kind: z.enum(TRANSACTION_KINDS),
  amountCents: z.number().int().min(1),
  method: z.enum(PAYMENT_METHODS).nullish(),
  referenceNumber: z.string().min(1).nullish(),
  proofUrl: z.string().url().optional(),
  notes: z.string().optional(),
});

export const list: RequestHandler = async (req, res, next) => {
  try {
    const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
    const period = typeof req.query.period === "string" ? req.query.period : undefined;
    res.json(await paymentService.list({ userId, period }));
  } catch (err) {
    next(err);
  }
};

export const get: RequestHandler = async (req, res, next) => {
  try {
    res.json(await paymentService.getById(req.params.id!));
  } catch (err) {
    next(err);
  }
};

export const listTransactions: RequestHandler = async (req, res, next) => {
  try {
    res.json(await paymentService.listTransactions(req.params.id!));
  } catch (err) {
    next(err);
  }
};

export const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = createSchema.parse(req.body);
    const payment = await paymentService.createOrUpdateForUserPeriod(body);
    void audit.log({
      actorId: req.user.sub,
      action: "payment.upsert",
      targetType: "Payment",
      targetId: payment._id.toString(),
      after: payment.toObject(),
      requestId: req.requestId,
    });
    res.status(201).json(payment);
  } catch (err) {
    next(err);
  }
};

export const addTransaction: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = txSchema.parse(req.body);
    const tx = await paymentService.addTransaction({
      paymentId: req.params.id!,
      kind: body.kind,
      amountCents: body.amountCents,
      method: body.method ?? null,
      referenceNumber: body.referenceNumber ?? null,
      proofUrl: body.proofUrl,
      notes: body.notes,
      createdBy: req.user.sub,
    });
    void audit.log({
      actorId: req.user.sub,
      action: "payment.transaction.add",
      targetType: "Payment",
      targetId: req.params.id!,
      metadata: {
        kind: body.kind,
        amountCents: body.amountCents,
        method: body.method,
        referenceNumber: body.referenceNumber,
      },
      requestId: req.requestId,
    });
    res.status(201).json(tx);
  } catch (err) {
    next(err);
  }
};

export const cancel: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const before = (await paymentService.getById(req.params.id!)).toObject();
    const payment = await paymentService.cancelPayment(req.params.id!);
    void audit.log({
      actorId: req.user.sub,
      action: "payment.cancel",
      targetType: "Payment",
      targetId: payment._id.toString(),
      before,
      after: payment.toObject(),
      requestId: req.requestId,
    });
    res.json(payment);
  } catch (err) {
    next(err);
  }
};
