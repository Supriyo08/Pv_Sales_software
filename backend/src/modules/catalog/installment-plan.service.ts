import { InstallmentPlan } from "./installment-plan.model";
import { HttpError } from "../../middleware/error";

type CreateInput = {
  name: string;
  months: number;
  surchargeBp?: number;
  description?: string;
  active?: boolean;
};

export async function list(opts: { activeOnly?: boolean } = {}) {
  const q: Record<string, unknown> = { deletedAt: null };
  if (opts.activeOnly) q.active = true;
  return InstallmentPlan.find(q).sort({ months: 1 });
}

export async function getById(id: string) {
  const p = await InstallmentPlan.findOne({ _id: id, deletedAt: null });
  if (!p) throw new HttpError(404, "Installment plan not found");
  return p;
}

export async function create(input: CreateInput) {
  const exists = await InstallmentPlan.findOne({ name: input.name, deletedAt: null });
  if (exists) throw new HttpError(409, "Installment plan with this name already exists");
  return InstallmentPlan.create({
    name: input.name,
    months: input.months,
    surchargeBp: input.surchargeBp ?? 0,
    description: input.description ?? "",
    active: input.active ?? true,
  });
}

export async function update(
  id: string,
  input: Partial<CreateInput>
) {
  await getById(id);
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) updates[k] = v;
  }
  const updated = await InstallmentPlan.findOneAndUpdate(
    { _id: id, deletedAt: null },
    updates,
    { new: true }
  );
  if (!updated) throw new HttpError(404, "Installment plan not found");
  return updated;
}

export async function softDelete(id: string) {
  const result = await InstallmentPlan.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { deletedAt: new Date(), active: false },
    { new: true }
  );
  if (!result) throw new HttpError(404, "Installment plan not found");
  return result;
}
