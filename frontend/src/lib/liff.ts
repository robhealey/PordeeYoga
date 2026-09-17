import liff from "@line/liff";

const LIFF_ID = import.meta.env.VITE_LIFF_ID as string | undefined;

let initPromise: Promise<boolean> | null = null;

/** Initializes LIFF if a LIFF ID is configured. Returns whether we're running inside the LINE app. */
export function initLiff(): Promise<boolean> {
  if (!LIFF_ID) return Promise.resolve(false);
  if (!initPromise) {
    initPromise = liff
      .init({ liffId: LIFF_ID })
      .then(() => liff.isInClient())
      .catch((err) => {
        console.error("LIFF init failed", err);
        return false;
      });
  }
  return initPromise;
}

export function liffLogin(): void {
  if (!liff.isLoggedIn()) {
    liff.login();
  }
}

export function getLiffIdToken(): string | null {
  return liff.getIDToken();
}

export function isInLiff(): boolean {
  try {
    return liff.isInClient();
  } catch {
    return false;
  }
}
