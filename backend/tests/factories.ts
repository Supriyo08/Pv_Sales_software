import bcrypt from "bcrypt";
import { User, type UserRole } from "../src/modules/users/user.model";
import { Territory } from "../src/modules/territories/territory.model";
import { Customer } from "../src/modules/customers/customer.model";
import { Solution } from "../src/modules/catalog/solution.model";
import { SolutionVersion } from "../src/modules/catalog/solution-version.model";
import { BonusRule } from "../src/modules/catalog/bonus-rule.model";
import { Contract } from "../src/modules/contracts/contract.model";

let counter = 0;

export async function makeUser(input: Partial<{
  email: string;
  fullName: string;
  role: UserRole;
  managerId: string | null;
  territoryId: string | null;
}> = {}) {
  counter++;
  return User.create({
    email: input.email ?? `user${counter}@test.com`,
    passwordHash: await bcrypt.hash("password", 4),
    fullName: input.fullName ?? `User ${counter}`,
    role: input.role ?? "AGENT",
    managerId: input.managerId ?? null,
    territoryId: input.territoryId ?? null,
  });
}

export async function makeTerritory(input: Partial<{ name: string; managerId: string | null }> = {}) {
  counter++;
  return Territory.create({
    name: input.name ?? `Territory ${counter}`,
    managerId: input.managerId ?? null,
  });
}

export async function makeCustomer() {
  counter++;
  return Customer.create({
    fiscalCode: `TEST${String(counter).padStart(8, "0")}`,
    fullName: `Customer ${counter}`,
  });
}

export async function makeSolutionWithVersion(
  createdBy: string,
  override: Partial<{ basePriceCents: number; agentBp: number; managerBp: number }> = {}
) {
  counter++;
  const solution = await Solution.create({
    name: `Solution ${counter}`,
    description: "test",
  });
  const version = await SolutionVersion.create({
    solutionId: solution._id,
    validFrom: new Date("2026-01-01"),
    basePriceCents: override.basePriceCents ?? 1_000_000,
    agentBp: override.agentBp ?? 1500,
    managerBp: override.managerBp ?? 500,
    createdBy,
  });
  return { solution, version };
}

export async function makeBonusRule(input: Partial<{
  role: UserRole;
  conditionType: "AGENT_INSTALLATIONS_GTE" | "NETWORK_INSTALLATIONS_GTE";
  threshold: number;
  basisPoints: number;
  validFrom: Date;
  name: string;
  userId: string | null;
}> = {}) {
  return BonusRule.create({
    name: input.name ?? "Test rule",
    role: input.role ?? "AGENT",
    conditionType: input.conditionType ?? "AGENT_INSTALLATIONS_GTE",
    threshold: input.threshold ?? 2,
    basisPoints: input.basisPoints ?? 1000,
    validFrom: input.validFrom ?? new Date("2026-01-01"),
    userId: input.userId ?? null,
  });
}

export async function makeSignedContract(input: {
  customerId: string;
  agentId: string;
  managerId?: string | null;
  solutionVersionId: string;
  amountCents: number;
}) {
  return Contract.create({
    customerId: input.customerId,
    agentId: input.agentId,
    managerId: input.managerId ?? null,
    solutionVersionId: input.solutionVersionId,
    amountCents: input.amountCents,
    status: "SIGNED",
    signedAt: new Date(),
  });
}
