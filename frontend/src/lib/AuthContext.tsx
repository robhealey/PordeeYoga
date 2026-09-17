import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type ApiUser } from "./api";
import { getLiffIdToken, initLiff, isInLiff, liffLogin } from "./liff";

interface AuthState {
  user: ApiUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  loginWithLine: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const { user } = await api.me();
    setUser(user);
  }

  useEffect(() => {
    (async () => {
      const inLiff = await initLiff();
      if (inLiff && isInLiff()) {
        liffLogin();
        const idToken = getLiffIdToken();
        if (idToken) {
          try {
            const { user } = await api.liffVerify(idToken);
            setUser(user);
          } catch (err) {
            console.error("LIFF auto-login failed", err);
          }
        }
      } else {
        await refresh().catch(() => {});
      }
      setLoading(false);
    })();
  }, []);

  async function loginWithLine() {
    if (isInLiff()) {
      liffLogin();
      return;
    }
    const clientId = import.meta.env.VITE_LINE_LOGIN_CHANNEL_ID as string | undefined;
    if (!clientId) {
      console.warn("VITE_LINE_LOGIN_CHANNEL_ID not set; falling back to dev mock login");
      const { user } = await api.devMockLogin("Dev Tester");
      setUser(user);
      return;
    }
    const redirectUri = `${window.location.origin}/login/callback`;
    const state = crypto.randomUUID();
    sessionStorage.setItem("line_login_state", state);
    const url = new URL("https://access.line.me/oauth2/v2.1/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", "profile openid");
    window.location.href = url.toString();
  }

  async function logout() {
    await api.logout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, refresh, loginWithLine, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
