import type { RequestHandler, Request } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
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

const uploadSchema = z.object({
  ownerType: z.enum(DOCUMENT_OWNER_TYPES),
  ownerId: objectId,
  kind: z.enum(DOCUMENT_KINDS),
});

// ─── multer setup ──────────────────────────────────────────────────────────
// Per Review 1.0 §5: agents need to re-upload the signed contract scan.
// We store under backend/uploads/ — served as static at /uploads. For production,
// swap with S3 by replacing the storage adapter.

const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_ROOT)) fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const ownerType = (req.body?.ownerType as string) || "misc";
    const dir = path.join(UPLOAD_ROOT, ownerType);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${ts}-${safe}`);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB cap
}).single("file");

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

/**
 * POST /v1/documents/upload  (multipart/form-data)
 * Body fields: ownerType, ownerId, kind, file
 * Returns the persisted Document record with a relative URL.
 */
export const upload: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) throw new HttpError(400, "No file uploaded");

    const body = uploadSchema.parse(req.body);
    const relativeUrl = `/uploads/${body.ownerType}/${path.basename(file.path)}`;

    const doc = await documentService.create({
      ownerType: body.ownerType,
      ownerId: body.ownerId,
      kind: body.kind,
      url: relativeUrl,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploadedBy: req.user.sub,
    });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
};
