import type { Env } from "./env.d.ts";
import type { SessionUser } from "./lib/session.ts";

export interface AppEnv {
  Bindings: Env;
  Variables: {
    user: SessionUser | null;
  };
}
