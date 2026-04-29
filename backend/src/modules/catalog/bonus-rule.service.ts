import { BonusRule, BONUS_CONDITIONS, type BonusCondition } from "./bonus-rule.model";
import { USER_ROLES, type UserRole } from "../users/user.model";
import { HttpError } from "../../middleware/error";

type CreateInput = {
  name: string;
  role: UserRole;
  conditionType: BonusCondition;
  threshold: number;
  basisPoints: number;
  validFrom: Date;
  validTo?: Date | null;
};

// Which (role, conditionType) combos are valid:
// - AGENT_INSTALLATIONS_GTE counts the user's own activated installations → only AGENT
// - NETWORK_INSTALLATIONS_GTE counts the manager's network's activated installations → only AREA_MANAGER
const VALID_COMBOS: Record<BonusCondition, UserRole[]> = {
  AGENT_INSTALLATIONS_GTE: ["AGENT"],
  NETWORK_INSTALLATIONS_GTE: ["AREA_MANAGER"],
};

export function validateRoleConditionCombo(role: UserRole, conditionType: BonusCondition): void {
  const allowed = VALID_COMBOS[conditionType];
  if (!allowed?.includes(role)) {
    throw new HttpError(
      400,
      `Condition ${conditionType} can only apply to roles: ${allowed?.join(", ") ?? "(none)"}`
    );
  }
}

export async function list() {
  return BonusRule.find({ deletedAt: null }).sort({ role: 1, validFrom: -1 });
}

export async function create(input: CreateInput) {
  validateRoleConditionCombo(input.role, input.conditionType);
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

export { BONUS_CONDITIONS, USER_ROLES, VALID_COMBOS };
