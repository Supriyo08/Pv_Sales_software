import { BonusRule, BONUS_CONDITIONS, type BonusCondition } from "./bonus-rule.model";
import { USER_ROLES, type UserRole } from "../users/user.model";

type CreateInput = {
  name: string;
  role: UserRole;
  conditionType: BonusCondition;
  threshold: number;
  basisPoints: number;
  validFrom: Date;
  validTo?: Date | null;
};

export async function list() {
  return BonusRule.find({ deletedAt: null }).sort({ role: 1, validFrom: -1 });
}

export async function create(input: CreateInput) {
  return BonusRule.create({
    ...input,
    validTo: input.validTo ?? null,
  });
}

export async function activeForRoleAt(role: UserRole, at: Date) {
  return BonusRule.find({
    role,
    deletedAt: null,
    validFrom: { $lte: at },
    $or: [{ validTo: null }, { validTo: { $gt: at } }],
  }).sort({ basisPoints: -1 });
}

export { BONUS_CONDITIONS, USER_ROLES };
