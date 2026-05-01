import type { RequestHandler } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import * as userService from "./user.service";
import * as audit from "../audit/audit.service";
import { USER_ROLES } from "./user.model";
import { HttpError } from "../../middleware/error";

const objectId = z
  .string()
  .refine((v) => Types.ObjectId.isValid(v), { message: "Invalid ObjectId" });

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
  role: z.enum(USER_ROLES),
  managerId: objectId.nullish(),
  territoryId: objectId.nullish(),
});

const updateSchema = z.object({
  fullName: z.string().min(1).optional(),
  role: z.enum(USER_ROLES).optional(),
  managerId: objectId.nullish(),
  territoryId: objectId.nullish(),
});

export const me: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    res.json(await userService.getById(req.user.sub));
  } catch (err) {
    next(err);
  }
};

export const list: RequestHandler = async (req, res, next) => {
  try {
    const includeInactive = req.query.includeInactive === "true";
    res.json(await userService.list({ includeInactive }));
  } catch (err) {
    next(err);
  }
};

export const get: RequestHandler = async (req, res, next) => {
  try {
    res.json(await userService.getById(req.params.id!));
  } catch (err) {
    next(err);
  }
};

export const profile: RequestHandler = async (req, res, next) => {
  try {
    res.json(await userService.getProfile(req.params.id!));
  } catch (err) {
    next(err);
  }
};

export const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = createSchema.parse(req.body);
    const user = await userService.adminCreate(body);
    void audit.log({
      actorId: req.user.sub,
      action: "user.create",
      targetType: "User",
      targetId: user!._id.toString(),
      after: user!.toObject(),
      requestId: req.requestId,
    });
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
};

export const update: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const id = req.params.id!;
    const body = updateSchema.parse(req.body);
    const before = (await userService.getById(id)).toObject();
    const user = await userService.adminUpdate(id, body);
    void audit.log({
      actorId: req.user.sub,
      action: "user.update",
      targetType: "User",
      targetId: id,
      before,
      after: user?.toObject(),
      requestId: req.requestId,
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
};

export const remove: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const id = req.params.id!;
    const before = (await userService.getById(id)).toObject();
    await userService.softDelete(id);
    void audit.log({
      actorId: req.user.sub,
      action: "user.deactivate",
      targetType: "User",
      targetId: id,
      before,
      requestId: req.requestId,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

// Per Review 1.1 §5: re-activate a previously deactivated user.
export const reactivate: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const id = req.params.id!;
    const user = await userService.reactivate(id);
    void audit.log({
      actorId: req.user.sub,
      action: "user.reactivate",
      targetType: "User",
      targetId: id,
      after: user?.toObject(),
      requestId: req.requestId,
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
};

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8),
});

// Per Review 1.1 §5: admin sets a new password for any user; revokes their refresh tokens.
export const resetPassword: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = resetPasswordSchema.parse(req.body);
    const user = await userService.adminResetPassword(req.params.id!, body.newPassword);
    // Audit log records the action but never the password value.
    void audit.log({
      actorId: req.user.sub,
      action: "user.reset_password",
      targetType: "User",
      targetId: req.params.id!,
      metadata: { byAdmin: true },
      requestId: req.requestId,
    });
    res.json({ ok: true, userId: user._id.toString() });
  } catch (err) {
    next(err);
  }
};
