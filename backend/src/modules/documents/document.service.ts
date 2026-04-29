import {
  PvDocument,
  DOCUMENT_OWNER_TYPES,
  DOCUMENT_KINDS,
} from "./document.model";

export type CreateInput = {
  ownerType: (typeof DOCUMENT_OWNER_TYPES)[number];
  ownerId: string;
  kind: (typeof DOCUMENT_KINDS)[number];
  url: string;
  mimeType?: string;
  sizeBytes?: number;
  uploadedBy: string;
};

export async function listForOwner(ownerType: string, ownerId: string) {
  return PvDocument.find({ ownerType, ownerId }).sort({ createdAt: -1 });
}

export async function create(input: CreateInput) {
  return PvDocument.create({
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    kind: input.kind,
    url: input.url,
    mimeType: input.mimeType ?? "application/octet-stream",
    sizeBytes: input.sizeBytes ?? 0,
    uploadedBy: input.uploadedBy,
  });
}

export { DOCUMENT_OWNER_TYPES, DOCUMENT_KINDS };
