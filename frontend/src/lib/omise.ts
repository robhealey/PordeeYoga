declare global {
  interface Window {
    Omise?: {
      setPublicKey: (key: string) => void;
      createToken: (
        type: "card",
        card: Record<string, string>,
        cb: (statusCode: number, response: { id?: string; message?: string }) => void
      ) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadOmiseScript(): Promise<void> {
  if (window.Omise) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.omise.co/omise.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Omise.js"));
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export interface CardFields {
  name: string;
  number: string;
  expirationMonth: string;
  expirationYear: string;
  securityCode: string;
}

export async function createOmiseCardToken(card: CardFields): Promise<string> {
  const publicKey = import.meta.env.VITE_OMISE_PUBLIC_KEY as string | undefined;
  if (!publicKey) throw new Error("Card payments are not configured yet (missing Omise public key)");

  await loadOmiseScript();
  window.Omise!.setPublicKey(publicKey);

  return new Promise((resolve, reject) => {
    window.Omise!.createToken(
      "card",
      {
        name: card.name,
        number: card.number.replace(/\s+/g, ""),
        expiration_month: card.expirationMonth,
        expiration_year: card.expirationYear,
        security_code: card.securityCode,
      },
      (statusCode, response) => {
        if (statusCode === 200 && response.id) {
          resolve(response.id);
        } else {
          reject(new Error(response.message ?? "Card tokenization failed"));
        }
      }
    );
  });
}
