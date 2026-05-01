import bcrypt from "bcrypt";
import { Types } from "mongoose";
import { User, type UserRole } from "./user.model";
import { Territory } from "../territories/territory.model";
import { Contract } from "../contracts/contract.model";
import { Commission } from "../commissions/commission.model";
import { Payment } from "../payments/payment.model";
import { Bonus } from "../bonuses/bonus.model";
import { revokeAllRefreshTokens } from "../auth/auth.service";
import { HttpError } from "../../middleware/error";
import { ensureNoCycle } from "../../utils/hierarchy";

export async function getById(id: string, opts: { includeInactive?: boolean } = {}) {
  const q: Record<string, unknown> = { _id: id };
  if (!opts.includeInactive) q.deletedAt = null;
  const user = await User.findOne(q).select("-passwordHash");
  if (!user) throw new HttpError(404, "User not found");
  return user;
}

export async function list(opts: { includeInactive?: boolean } = {}) {
  const q: Record<string, unknown> = {};
  if (!opts.includeInactive) q.deletedAt = null;
  return User.find(q).select("-passwordHash").sort({ createdAt: -1 });
}

/**
 * Aggregated profile for a user — used to render the per-user "performance + payments" view.
 * Per Review 1.0 §2: each user profile should include a report covering their specific
 * payments and performance.
 */
export async function getProfile(id: string) {
  const user = await getById(id);
  const userId = new Types.ObjectId(id);

  const [
    contractsByStatus,
    activeCommissions,
    bonusesByPeriod,
    paymentsByStatus,
  ] = await Promise.all([
    Contract.aggregate<{ _id: string; count: number; totalCents: number }>([
      { $match: { agentId: userId } },
      { $group: { _id: "$status", count: { $sum: 1 }, totalCents: { $sum: "$amountCents" } } },
    ]),
    Commission.aggregate<{ _id: string; total: number; count: number }>([
      {
        $match: {
          beneficiaryUserId: userId,
          supersededAt: null,
        },
      },
      {
        $group: {
          _id: "$sourceEvent",
          total: { $sum: "$amountCents" },
          count: { $sum: 1 },
        },
      },
    ]),
    Bonus.aggregate<{ _id: string; bonusCents: number; baseCents: number; count: number }>([
      { $match: { userId } },
      {
        $group: {
          _id: "$period",
          bonusCents: { $sum: "$bonusAmountCents" },
          baseCents: { $sum: "$baseAmountCents" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 24 },
    ]),
    Payment.aggregate<{ _id: string; count: number; totalCents: number; paidCents: number }>([
      { $match: { userId } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalCents: { $sum: "$totalAmountCents" },
          paidCents: { $sum: "$paidCents" },
        },
      },
    ]),
  ]);

  const recentContracts = await Contract.find({ agentId: userId })
    .sort({ createdAt: -1 })
    .limit(20)
    .select("_id customerId status amountCents currency signedAt createdAt");

  const recentPayments = await Payment.find({ userId })
    .sort({ period: -1 })
    .limit(12)
    .select("_id period totalAmountCents paidCents status currency createdAt");

  return {
    user: user.toObject(),
    contractsByStatus,
    activeCommissions,
    bonusesByPeriod,
    paymentsByStatus,
    recentContracts,
    recentPayments,
  };
}

type CreateInput = {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  managerId?: string | null;
  territoryId?: string | null;
};

type UpdateInput = {
  fullName?: string;
  role?: UserRole;
  managerId?: string | null;
  territoryId?: string | null;
};

export async function adminCreate(input: CreateInput) {
  const exists = await User.findOne({ email: input.email.toLowerCase() });
  if (exists) throw new HttpError(409, "Email already registered");
  await validateHierarchy(null, input.role, input.managerId ?? null);
  await validateTerritory(input.territoryId ?? null);

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await User.create({
    email: input.email,
    passwordHash,
    fullName: input.fullName,
    role: input.role,
    managerId: input.managerId ?? null,
    territoryId: input.territoryId ?? null,
  });
  return User.findById(user._id).select("-passwordHash");
}

export async function adminUpdate(id: string, input: UpdateInput) {
  const user = await User.findOne({ _id: id, deletedAt: null });
  if (!user) throw new HttpError(404, "User not found");

  const newRole = (input.role ?? user.role) as UserRole;
  const newManager =
    input.managerId !== undefined ? input.managerId : user.managerId?.toString() ?? null;

  await validateHierarchy(id, newRole, newManager);
  if (input.territoryId !== undefined) await validateTerritory(input.territoryId);

  const updates: Record<string, unknown> = {};
  if (input.fullName !== undefined) updates.fullName = input.fullName;
  if (input.role !== undefined) updates.role = input.role;
  if (input.managerId !== undefined) updates.managerId = input.managerId ?? null;
  if (input.territoryId !== undefined) updates.territoryId = input.territoryId ?? null;

  return User.findOneAndUpdate({ _id: id, deletedAt: null }, updates, { new: true }).select(
    "-passwordHash"
  );
}

export async function softDelete(id: string) {
  const result = await User.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { deletedAt: new Date() },
    { new: true }
  );
  if (!result) throw new HttpError(404, "User not found");
  // Per Review 1.1 §5: deactivating a user must invalidate their sessions so
  // they can't keep using the app via a still-valid refresh token.
  await revokeAllRefreshTokens(id);
  return result;
}

/**
 * Per Review 1.1 §5: admin can re-activate a previously deactivated user.
 * Hierarchy is re-validated because the manager/territory may have changed
 * while the user was offline.
 */
export async function reactivate(id: string) {
  const user = await User.findById(id);
  if (!user) throw new HttpError(404, "User not found");
  if (!user.deletedAt) return user;

  // Re-verify the manager link is still sound (manager may have been deleted).
  await validateHierarchy(id, user.role as UserRole, user.managerId?.toString() ?? null);

  user.deletedAt = null;
  await user.save();
  return User.findById(id).select("-passwordHash");
}

/**
 * Per Review 1.1 §5: admin sets a new password for any user (e.g. agent forgot
 * their credentials). Hashes via bcrypt and revokes any active refresh tokens
 * so the user has to log in fresh.
 */
export async function adminResetPassword(id: string, newPassword: string) {
  if (newPassword.length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters");
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const result = await User.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { passwordHash },
    { new: true }
  ).select("-passwordHash");
  if (!result) throw new HttpError(404, "User not found");
  await revokeAllRefreshTokens(id);
  return result;
}

async function validateHierarchy(
  selfId: string | null,
  role: UserRole,
  managerId: string | null
) {
  if (role === "ADMIN") {
    if (managerId) throw new HttpError(400, "ADMIN cannot have a manager");
    return;
  }
  // Per Review 1.0 §2: Agents can exist without an Area Manager.
  // managerId becomes optional; if absent, the agent is unassigned.
  if (!managerId) return;

  const manager = await User.findOne({ _id: managerId, deletedAt: null });
  if (!manager) throw new HttpError(400, "Manager not found");

  if (role === "AREA_MANAGER" && manager.role !== "ADMIN") {
    throw new HttpError(400, "AREA_MANAGER must be managed by ADMIN");
  }
  if (role === "AGENT" && manager.role !== "AREA_MANAGER") {
    throw new HttpError(400, "AGENT must be managed by AREA_MANAGER");
  }

  if (selfId) {
    await ensureNoCycle(selfId, managerId, async (id) => {
      const u = await User.findById(id);
      return u?.managerId?.toString() ?? null;
    });
  }
}

async function validateTerritory(territoryId: string | null) {
  if (!territoryId) return;
  const t = await Territory.findOne({ _id: territoryId, deletedAt: null });
  if (!t) throw new HttpError(400, "Territory not found");
}
