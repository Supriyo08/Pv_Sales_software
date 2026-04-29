import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../store/auth";

export function RequireAuth() {
  const token = useAuth((s) => s.accessToken);
  if (!token) return <Navigate to="/signin" replace />;
  return <Outlet />;
}
