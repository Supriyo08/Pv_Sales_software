import type { RequestHandler } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import * as leadService from "./lead.service";
import { LEAD_STATUSES } from "./lead.model";
import * as audit from "../audit/audit.service";
import { HttpError } from "../../middleware/error";

const objectId = z
  .string()
  .refine((v) => Types.ObjectId.isValid(v), { message: "Invalid ObjectId" });

const createSchema = z.object({
  customerId: objectId,
  agentId: objectId,
  source: z.string().optional(),
  notes: z.string().optional(),
  expectedClose: z.coerce.date().nullish(),
});

const transitionSchema = z.object({ status: z.enum(LEAD_STATUSES) });

export const list: RequestHandler = async (req, res, next) => {
  try {
    const agentId = typeof req.query.agentId === "string" ? req.query.agentId : undefined;
    const status = typeof req.query.status === "string" ? (req.query.status as never) : undefined;
    res.json(await leadService.list({ agentId, status }));
  } catch (err) {
    next(err);
  }
};

export const get: RequestHandler = async (req, res, next) => {
  try {
    res.json(await leadService.getById(req.params.id!));
  } catch (err) {
    next(err);
  }
};

export const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = createSchema.parse(req.body);
    const lead = await leadService.create({
      ...body,
      expectedClose: body.expectedClose ?? null,
    });
    void audit.log({
      actorId: req.user.sub,
      action: "lead.create",
      targetType: "Lead",
      targetId: lead._id.toString(),
      after: lead.toObject(),
      requestId: req.requestId,
    });
    res.status(201).json(lead);
  } catch (err) {
    next(err);
  }
};

export const transition: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = transitionSchema.parse(req.body);
    const before = (await leadService.getById(req.params.id!)).toObject();
    const lead = await leadService.transition(req.params.id!, body.status);
    void audit.log({
      actorId: req.user.sub,
      action: "lead.transition",
      targetType: "Lead",
      targetId: lead._id.toString(),
      before,
      after: lead.toObject(),
      metadata: { from: before.status, to: body.status },
      requestId: req.requestId,
    });
    res.json(lead);
  } catch (err) {
    next(err);
  }
};
