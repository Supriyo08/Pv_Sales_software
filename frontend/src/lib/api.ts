import axios from "axios";
import { useAuth } from "../store/auth";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE ?? "http://localhost:4000/v1",
});

/**
 * Build an absolute URL to a backend-served upload (e.g. .docx, generated PDF,
 * signed scan). The backend serves files at `/uploads/...` (no `/v1`), so we
 * resolve them against the API base's origin.
 */
export function uploadUrl(relative: string | null | undefined): string {
  if (!relative) return "";
  if (/^https?:\/\//.test(relative)) return relative;
  const base = (api.defaults.baseURL ?? "http://localhost:4000/v1").replace(
    /\/v1\/?$/,
    ""
  );
  return `${base}${relative.startsWith("/") ? "" : "/"}${relative}`;
}

api.interceptors.request.use((config) => {
  const token = useAuth.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || original?._retry) {
      return Promise.reject(error);
    }
    original._retry = true;

    refreshing ??= refreshTokens();
    const newToken = await refreshing;
    refreshing = null;

    if (!newToken) {
      useAuth.getState().clear();
      return Promise.reject(error);
    }

    original.headers.Authorization = `Bearer ${newToken}`;
    return api(original);
  }
);

async function refreshTokens(): Promise<string | null> {
  const { refreshToken, set } = useAuth.getState();
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post(`${api.defaults.baseURL}/auth/refresh`, { refreshToken });
    set({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    return data.accessToken;
  } catch {
    return null;
  }
}
