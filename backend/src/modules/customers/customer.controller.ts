import type { RequestHandler } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import * as customerService from "./customer.service";
import * as audit from "../audit/audit.service";
import { HttpError } from "../../middleware/error";
import { buildScope } from "../../lib/scope";

const objectId = z
  .string()
  .refine((v) => Types.ObjectId.isValid(v), { message: "Invalid ObjectId" });

const addressSchema = z
  .object({
    line1: z.string().optional(),
    line2: z.string().optional(),
    city: z.string().optional(),
    region: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional(),
  })
  .partial();

const createSchema = z.object({
  fiscalCode: z.string().min(3),
  fullName: z.string().min(1),
  email: z.string().email().or(z.literal("")).optional(),
  phone: z.string().optional(),
  address: addressSchema.optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  assignedAgentId: objectId.nullish(),
});

const updateSchema = createSchema.partial();

const reassignSchema = z.object({
  agentId: objectId.nullable(),
});

export const list: RequestHandler = async (req, res, next) => {
  try {
    const scope = await buildScope(req.user);
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    res.json(await customerService.list({ search }, scope));
  } catch (err) {
    next(err);
  }
};

export const get: RequestHandler = async (req, res, next) => {
  try {
    const scope = await buildScope(req.user);
    res.json(await customerService.getById(req.params.id!, scope));
  } catch (err) {
    next(err);
  }
};

export const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const scope = await buildScope(req.user);
    const body = createSchema.parse(req.body);
    const c = await customerService.create(
      body as Parameters<typeof customerService.create>[0],
      scope
    );
    void audit.log({
      actorId: req.user.sub,
      action: "customer.create",
      targetType: "Customer",
      targetId: c._id.toString(),
      after: c.toObject(),
      requestId: req.requestId,
    });
    res.status(201).json(c);
  } catch (err) {
    next(err);
  }
};

export const update: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const scope = await buildScope(req.user);
    const body = updateSchema.parse(req.body);
    const before = (await customerService.getById(req.params.id!, scope)).toObject();
    const c = await customerService.update(
      req.params.id!,
      body as Parameters<typeof customerService.update>[1],
      scope
    );
    void audit.log({
      actorId: req.user.sub,
      action: "customer.update",
      targetType: "Customer",
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

export const remove: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const scope = await buildScope(req.user);
    const id = req.params.id!;
    const before = (await customerService.getById(id, scope)).toObject();
    await customerService.softDelete(id, scope);
    void audit.log({
      actorId: req.user.sub,
      action: "customer.delete",
      targetType: "Customer",
      targetId: id,
      before,
      requestId: req.requestId,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const reassign: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const scope = await buildScope(req.user);
    const body = reassignSchema.parse(req.body);
    const id = req.params.id!;
    const before = (await customerService.getById(id, scope)).toObject();
    const updated = await customerService.reassign(id, body.agentId, scope);
    void audit.log({
      actorId: req.user.sub,
      action: "customer.reassign",
      targetType: "Customer",
      targetId: id,
      before,
      after: updated.toObject(),
      metadata: { newAgentId: body.agentId },
      requestId: req.requestId,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};
