import { useAuth } from "../../store/AuthContext";
import type { ReactNode } from "react";

interface AuthGateProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export default function AuthGate({ children, fallback }: AuthGateProps) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <>{fallback ?? null}</>;

  return <>{children}</>;
}
