import type { RequestHandler } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import * as documentService from "./document.service";
import { DOCUMENT_KINDS, DOCUMENT_OWNER_TYPES } from "./document.model";
import { HttpError } from "../../middleware/error";

const objectId = z
  .string()
  .refine((v) => Types.ObjectId.isValid(v), { message: "Invalid ObjectId" });

const createSchema = z.object({
  ownerType: z.enum(DOCUMENT_OWNER_TYPES),
  ownerId: objectId,
  kind: z.enum(DOCUMENT_KINDS),
  url: z.string().url(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().min(0).optional(),
});

export const listForOwner: RequestHandler = async (req, res, next) => {
  try {
    const ownerType = String(req.query.ownerType ?? "");
    const ownerId = String(req.query.ownerId ?? "");
    if (!ownerType || !ownerId) throw new HttpError(400, "ownerType and ownerId required");
    res.json(await documentService.listForOwner(ownerType, ownerId));
  } catch (err) {
    next(err);
  }
};

export const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = createSchema.parse(req.body);
    const doc = await documentService.create({
      ...body,
      uploadedBy: req.user.sub,
    });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
};
