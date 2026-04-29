import { Customer } from "./customer.model";
import { HttpError } from "../../middleware/error";

type CreateInput = {
  fiscalCode: string;
  fullName: string;
  email?: string;
  phone?: string;
  address?: Record<string, string>;
};

export async function list(query: { search?: string }) {
  const filter: Record<string, unknown> = { deletedAt: null };
  if (query.search) {
    const re = new RegExp(query.search, "i");
    filter.$or = [{ fullName: re }, { email: re }, { fiscalCode: re }];
  }
  return Customer.find(filter).sort({ createdAt: -1 }).limit(100);
}

export async function getById(id: string) {
  const c = await Customer.findOne({ _id: id, deletedAt: null });
  if (!c) throw new HttpError(404, "Customer not found");
  return c;
}

export async function create(input: CreateInput) {
  const exists = await Customer.findOne({ fiscalCode: input.fiscalCode.toUpperCase() });
  if (exists) throw new HttpError(409, "Customer with this fiscal code already exists");
  return Customer.create(input);
}

export async function update(id: string, input: Partial<CreateInput>) {
  const updates: Record<string, unknown> = { ...input };
  if (input.fiscalCode) updates.fiscalCode = input.fiscalCode.toUpperCase();
  const updated = await Customer.findOneAndUpdate(
    { _id: id, deletedAt: null },
    updates,
    { new: true }
  );
  if (!updated) throw new HttpError(404, "Customer not found");
  return updated;
}

export async function softDelete(id: string) {
  const result = await Customer.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { deletedAt: new Date(), email: "", phone: "", address: {} },
    { new: true }
  );
  if (!result) throw new HttpError(404, "Customer not found");
}
