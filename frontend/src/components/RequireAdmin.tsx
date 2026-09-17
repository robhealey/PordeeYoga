import type { ReactNode } from "react";
import { useAuth } from "../lib/AuthContext";

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="text-sage-500">Loading…</p>;
  if (!user || user.role !== "admin") {
    return <p className="text-red-600">You need admin access to view this page.</p>;
  }
  return <>{children}</>;
}
