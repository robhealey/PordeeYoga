import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

export function LoginCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get("code");
    const state = params.get("state");
    const expectedState = sessionStorage.getItem("line_login_state");
    sessionStorage.removeItem("line_login_state");

    if (!code || !state || state !== expectedState) {
      setError("Login failed: invalid state. Please try again.");
      return;
    }

    api
      .lineCallback(code, `${window.location.origin}/login/callback`)
      .then(() => refresh())
      .then(() => navigate("/"))
      .catch((e) => setError(String(e)));
  }, [params]);

  if (error) return <p className="text-red-600">{error}</p>;
  return <p className="text-sage-500">Signing you in…</p>;
}
