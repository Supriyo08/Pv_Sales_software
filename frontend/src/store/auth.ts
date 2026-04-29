import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role } from "../lib/api-types";

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  set: (tokens: { accessToken: string; refreshToken: string }) => void;
  clear: () => void;
};

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      set: (tokens) => set(tokens),
      clear: () => set({ accessToken: null, refreshToken: null }),
    }),
    { name: "pv-auth" }
  )
);

export function decodeRole(token: string | null): Role | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]!));
    return (payload?.role as Role) ?? null;
  } catch {
    return null;
  }
}

export function useRole(): Role | null {
  const token = useAuth((s) => s.accessToken);
  return decodeRole(token);
}

export function decodeUserId(token: string | null): string | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]!));
    return (payload?.sub as string) ?? null;
  } catch {
    return null;
  }
}
