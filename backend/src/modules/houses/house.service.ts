import { House } from "./house.model";
import { Customer } from "../customers/customer.model";
import { HttpError } from "../../middleware/error";
import type { Scope } from "../../lib/scope";
import { customerScopeMatch } from "../../lib/scope";

type AddressInput = {
  line1?: string;
  city?: string;
  postalCode?: string;
  region?: string;
};

type CatastalInput = {
  sheet?: string;
  particel?: string;
  sub?: string;
  reference?: string;
};

type CreateInput = {
  customerId: string;
  label?: string;
  address?: AddressInput;
  catastal?: CatastalInput;
};

async function ensureCustomerVisible(customerId: string, scope: Scope) {
  const filter: Record<string, unknown> = {
    _id: customerId,
    deletedAt: null,
    ...customerScopeMatch(scope),
  };
  const c = await Customer.findOne(filter);
  if (!c) throw new HttpError(404, "Customer not found or out of scope");
  return c;
}

export async function listForCustomer(customerId: string, scope: Scope) {
  await ensureCustomerVisible(customerId, scope);
  return House.find({ customerId, deletedAt: null }).sort({ createdAt: 1 });
}

export async function getById(id: string, scope: Scope) {
  const house = await House.findOne({ _id: id, deletedAt: null });
  if (!house) throw new HttpError(404, "House not found");
  await ensureCustomerVisible(house.customerId.toString(), scope);
  return house;
}

export async function create(input: CreateInput, scope: Scope) {
  await ensureCustomerVisible(input.customerId, scope);
  return House.create({
    customerId: input.customerId,
    label: input.label ?? "",
    address: input.address ?? {},
    catastal: input.catastal ?? {},
  });
}

export async function update(
  id: string,
  patch: Partial<CreateInput>,
  scope: Scope
) {
  const house = await getById(id, scope);
  if (patch.label !== undefined) house.label = patch.label;
  if (patch.address) house.address = { ...house.address, ...patch.address };
  if (patch.catastal) house.catastal = { ...house.catastal, ...patch.catastal };
  await house.save();
  return house;
}

export async function softDelete(id: string, scope: Scope): Promise<void> {
  const house = await getById(id, scope);
  house.deletedAt = new Date();
  await house.save();
}
