import type { RequestHandler } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import * as territoryService from "./territory.service";
import * as audit from "../audit/audit.service";
import { HttpError } from "../../middleware/error";

const objectId = z
  .string()
  .refine((v) => Types.ObjectId.isValid(v), { message: "Invalid ObjectId" });

const createSchema = z.object({
  name: z.string().min(1),
  parentId: objectId.nullish(),
  managerId: objectId.nullish(),
});

const updateSchema = createSchema.partial();

export const list: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await territoryService.list());
  } catch (err) {
    next(err);
  }
};

export const get: RequestHandler = async (req, res, next) => {
  try {
    res.json(await territoryService.getById(req.params.id!));
  } catch (err) {
    next(err);
  }
};

export const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = createSchema.parse(req.body);
    const t = await territoryService.create(body);
    void audit.log({
      actorId: req.user.sub,
      action: "territory.create",
      targetType: "Territory",
      targetId: t._id.toString(),
      after: t.toObject(),
      requestId: req.requestId,
    });
    res.status(201).json(t);
  } catch (err) {
    next(err);
  }
};

export const update: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const id = req.params.id!;
    const body = updateSchema.parse(req.body);
    const before = (await territoryService.getById(id)).toObject();
    const t = await territoryService.update(id, body);
    void audit.log({
      actorId: req.user.sub,
      action: "territory.update",
      targetType: "Territory",
      targetId: t._id.toString(),
      before,
      after: t.toObject(),
      requestId: req.requestId,
    });
    res.json(t);
  } catch (err) {
    next(err);
  }
};

export const remove: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const id = req.params.id!;
    const before = (await territoryService.getById(id)).toObject();
    await territoryService.softDelete(id);
    void audit.log({
      actorId: req.user.sub,
      action: "territory.delete",
      targetType: "Territory",
      targetId: id,
      before,
      requestId: req.requestId,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};
