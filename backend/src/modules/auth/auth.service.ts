import bcrypt from "bcrypt";
import { User, type UserRole } from "../users/user.model";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../utils/jwt";
import { redis } from "../../config/redis";
import { HttpError } from "../../middleware/error";

const REFRESH_KEY = (userId: string, jti: string) => `refresh:${userId}:${jti}`;
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7;

export async function register(input: {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
}) {
  const existing = await User.findOne({ email: input.email.toLowerCase() });
  if (existing) throw new HttpError(409, "Email already registered");

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await User.create({
    email: input.email,
    passwordHash,
    fullName: input.fullName,
    role: input.role,
  });
  return issueTokens(user._id.toString(), user.role);
}

export async function login(email: string, password: string) {
  const user = await User.findOne({ email: email.toLowerCase(), deletedAt: null });
  if (!user) throw new HttpError(401, "Invalid credentials");

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new HttpError(401, "Invalid credentials");

  return issueTokens(user._id.toString(), user.role);
}

export async function refresh(token: string) {
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new HttpError(401, "Invalid refresh token");
  }

  const stored = await redis.get(REFRESH_KEY(payload.sub, token));
  if (!stored) throw new HttpError(401, "Refresh token revoked or unknown");

  await redis.del(REFRESH_KEY(payload.sub, token));
  return issueTokens(payload.sub, payload.role);
}

export async function logout(userId: string, token: string): Promise<void> {
  await redis.del(REFRESH_KEY(userId, token));
}

async function issueTokens(userId: string, role: string) {
  const accessToken = signAccessToken({ sub: userId, role });
  const refreshToken = signRefreshToken({ sub: userId, role });
  await redis.set(REFRESH_KEY(userId, refreshToken), "1", "EX", REFRESH_TTL_SECONDS);
  return { accessToken, refreshToken };
}
