import type { RequestHandler } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import * as service from "./house.service";
import * as audit from "../audit/audit.service";
import { HttpError } from "../../middleware/error";
import { buildScope } from "../../lib/scope";

const objectId = z
  .string()
  .refine((v) => Types.ObjectId.isValid(v), { message: "Invalid ObjectId" });

const addressSchema = z
  .object({
    line1: z.string().optional(),
    city: z.string().optional(),
    postalCode: z.string().optional(),
    region: z.string().optional(),
  })
  .partial();

const catastalSchema = z
  .object({
    sheet: z.string().optional(),
    particel: z.string().optional(),
    sub: z.string().optional(),
    reference: z.string().optional(),
  })
  .partial();

const createSchema = z.object({
  customerId: objectId,
  label: z.string().max(120).optional(),
  address: addressSchema.optional(),
  catastal: catastalSchema.optional(),
});

const updateSchema = createSchema.omit({ customerId: true }).partial();

export const listForCustomer: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const scope = await buildScope(req.user);
    const customerId = req.params.customerId!;
    res.json(await service.listForCustomer(customerId, scope));
  } catch (err) {
    next(err);
  }
};

export const get: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const scope = await buildScope(req.user);
    res.json(await service.getById(req.params.id!, scope));
  } catch (err) {
    next(err);
  }
};

export const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const scope = await buildScope(req.user);
    const body = createSchema.parse(req.body);
    const house = await service.create(body, scope);
    void audit.log({
      actorId: req.user.sub,
      action: "house.create",
      targetType: "House",
      targetId: house._id.toString(),
      after: house.toObject(),
      requestId: req.requestId,
    });
    res.status(201).json(house);
  } catch (err) {
    next(err);
  }
};

export const update: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const scope = await buildScope(req.user);
    const body = updateSchema.parse(req.body);
    const before = (await service.getById(req.params.id!, scope)).toObject();
    const house = await service.update(req.params.id!, body, scope);
    void audit.log({
      actorId: req.user.sub,
      action: "house.update",
      targetType: "House",
      targetId: house._id.toString(),
      before,
      after: house.toObject(),
      requestId: req.requestId,
    });
    res.json(house);
  } catch (err) {
    next(err);
  }
};

export const remove: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const scope = await buildScope(req.user);
    const before = (await service.getById(req.params.id!, scope)).toObject();
    await service.softDelete(req.params.id!, scope);
    void audit.log({
      actorId: req.user.sub,
      action: "house.delete",
      targetType: "House",
      targetId: req.params.id!,
      before,
      requestId: req.requestId,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};
