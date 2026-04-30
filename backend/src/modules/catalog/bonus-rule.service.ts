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
  userId?: string | null;
};

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
    userId: input.userId ?? null,
  });
}

export async function softDelete(id: string) {
  const result = await BonusRule.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { deletedAt: new Date() },
    { new: true }
  );
  if (!result) throw new HttpError(404, "Bonus rule not found");
  return result;
}

/**
 * Active rules for a given role at a given date, including:
 * - Global rules (userId=null)
 * - User-scoped rules (userId matches)
 *
 * The bonus engine groups by ruleId so user-scoped overrides naturally take precedence
 * (a single Bonus row exists per user+period+rule, and a user-scoped rule and a global
 * rule are independent rows). For the engine to *prefer* user-scoped, see
 * `pickEffectiveRulesForUser` below.
 */
export async function activeForRoleAt(role: UserRole, at: Date, userId?: string) {
  const userScope: Record<string, unknown>[] = [{ userId: null }];
  if (userId) userScope.push({ userId });
  return BonusRule.find({
    role,
    deletedAt: null,
    validFrom: { $lte: at },
    $or: [{ validTo: null }, { validTo: { $gt: at } }],
    $and: [{ $or: userScope }],
  }).sort({ basisPoints: -1 });
}

export { BONUS_CONDITIONS, USER_ROLES, VALID_COMBOS };
