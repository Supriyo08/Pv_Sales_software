import type { RequestHandler } from "express";
import { z } from "zod";
import * as customerService from "./customer.service";
import * as audit from "../audit/audit.service";
import { HttpError } from "../../middleware/error";

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
});

const updateSchema = createSchema.partial();

export const list: RequestHandler = async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    res.json(await customerService.list({ search }));
  } catch (err) {
    next(err);
  }
};

export const get: RequestHandler = async (req, res, next) => {
  try {
    res.json(await customerService.getById(req.params.id!));
  } catch (err) {
    next(err);
  }
};

export const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = createSchema.parse(req.body);
    const c = await customerService.create(body as Parameters<typeof customerService.create>[0]);
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
    const body = updateSchema.parse(req.body);
    const before = (await customerService.getById(req.params.id!)).toObject();
    const c = await customerService.update(req.params.id!, body as Parameters<typeof customerService.update>[1]);
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
    const id = req.params.id!;
    const before = (await customerService.getById(id)).toObject();
    await customerService.softDelete(id);
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
