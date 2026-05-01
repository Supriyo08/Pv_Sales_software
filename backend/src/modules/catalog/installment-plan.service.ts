import { InstallmentPlan } from "./installment-plan.model";
import { HttpError } from "../../middleware/error";

type CreateInput = {
  name: string;
  months: number;
  surchargeBp?: number;
  description?: string;
  active?: boolean;
  // Per Review 1.1 §4.
  solutionIds?: string[];
  advanceMinCents?: number | null;
  advanceMaxCents?: number | null;
};

export async function list(opts: { activeOnly?: boolean; solutionId?: string } = {}) {
  const q: Record<string, unknown> = { deletedAt: null };
  if (opts.activeOnly) q.active = true;
  // Per Review 1.1 §4: filter by solution. A plan with empty solutionIds applies
  // to all solutions; one with explicit ids only applies to those.
  if (opts.solutionId) {
    q.$or = [{ solutionIds: { $size: 0 } }, { solutionIds: opts.solutionId }];
  }
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
  validateAdvanceRange(input.advanceMinCents, input.advanceMaxCents);
  return InstallmentPlan.create({
    name: input.name,
    months: input.months,
    surchargeBp: input.surchargeBp ?? 0,
    description: input.description ?? "",
    active: input.active ?? true,
    solutionIds: input.solutionIds ?? [],
    advanceMinCents: input.advanceMinCents ?? null,
    advanceMaxCents: input.advanceMaxCents ?? null,
  });
}

function validateAdvanceRange(
  min: number | null | undefined,
  max: number | null | undefined
) {
  if (min !== null && min !== undefined && max !== null && max !== undefined) {
    if (min > max) {
      throw new HttpError(400, "advanceMinCents must be <= advanceMaxCents");
    }
  }
}

export async function update(
  id: string,
  input: Partial<CreateInput>
) {
  const current = await getById(id);
  validateAdvanceRange(
    input.advanceMinCents !== undefined ? input.advanceMinCents : current.advanceMinCents,
    input.advanceMaxCents !== undefined ? input.advanceMaxCents : current.advanceMaxCents
  );
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
