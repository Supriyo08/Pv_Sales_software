import { Territory } from "./territory.model";
import { User } from "../users/user.model";
import { HttpError } from "../../middleware/error";
import { ensureNoCycle } from "../../utils/hierarchy";

type CreateInput = {
  name: string;
  parentId?: string | null;
  managerId?: string | null;
};

type UpdateInput = Partial<CreateInput>;

export async function list() {
  return Territory.find({ deletedAt: null }).sort({ name: 1 });
}

export async function getById(id: string) {
  const t = await Territory.findOne({ _id: id, deletedAt: null });
  if (!t) throw new HttpError(404, "Territory not found");
  return t;
}

export async function create(input: CreateInput) {
  await validateParent(null, input.parentId ?? null);
  await validateManager(input.managerId ?? null);
  return Territory.create({
    name: input.name,
    parentId: input.parentId ?? null,
    managerId: input.managerId ?? null,
  });
}

export async function update(id: string, input: UpdateInput) {
  await getById(id);
  if (input.parentId !== undefined) await validateParent(id, input.parentId);
  if (input.managerId !== undefined) await validateManager(input.managerId);

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.parentId !== undefined) updates.parentId = input.parentId ?? null;
  if (input.managerId !== undefined) updates.managerId = input.managerId ?? null;

  const updated = await Territory.findOneAndUpdate(
    { _id: id, deletedAt: null },
    updates,
    { new: true }
  );
  if (!updated) throw new HttpError(404, "Territory not found");
  return updated;
}

export async function softDelete(id: string) {
  const result = await Territory.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { deletedAt: new Date() },
    { new: true }
  );
  if (!result) throw new HttpError(404, "Territory not found");
}

async function validateParent(selfId: string | null, parentId: string | null) {
  if (!parentId) return;
  const parent = await Territory.findOne({ _id: parentId, deletedAt: null });
  if (!parent) throw new HttpError(400, "Parent territory not found");
  if (selfId) {
    await ensureNoCycle(selfId, parentId, async (id) => {
      const t = await Territory.findById(id);
      return t?.parentId?.toString() ?? null;
    });
  }
}

async function validateManager(managerId: string | null) {
  if (!managerId) return;
  const manager = await User.findOne({ _id: managerId, deletedAt: null });
  if (!manager) throw new HttpError(400, "Manager user not found");
  if (manager.role !== "AREA_MANAGER") {
    throw new HttpError(400, "Territory manager must be AREA_MANAGER");
  }
}
