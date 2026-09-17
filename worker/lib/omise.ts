import type { Env } from "../env.d.ts";

const OMISE_API = "https://api.omise.co";

function authHeader(secretKey: string): string {
  return `Basic ${btoa(`${secretKey}:`)}`;
}

async function omiseFetch<T>(env: Env, path: string, init?: RequestInit): Promise<T> {
  if (!env.OMISE_SECRET_KEY) throw new Error("OMISE_SECRET_KEY is not configured");
  const res = await fetch(`${OMISE_API}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(env.OMISE_SECRET_KEY),
      "Content-Type": "application/x-www-form-urlencoded",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json()) as T & { object?: string; message?: string };
  if (!res.ok || (body as { object?: string }).object === "error") {
    throw new Error(`Omise API error: ${(body as { message?: string }).message ?? res.status}`);
  }
  return body;
}

export type OmiseChargeStatus = "pending" | "successful" | "failed" | "expired";

interface OmiseCharge {
  id: string;
  status: OmiseChargeStatus;
  amount: number;
  currency: string;
  source?: { scannable_code?: { image?: { download_uri?: string } } };
  authorize_uri?: string;
}

interface OmiseSource {
  id: string;
}

/** Charge a tokenized card (from the Omise.js card form on the checkout page). */
export async function createCardCharge(
  env: Env,
  params: { amountSatang: number; currency: string; cardToken: string; description: string }
): Promise<OmiseCharge> {
  return omiseFetch<OmiseCharge>(env, "/charges", {
    method: "POST",
    body: new URLSearchParams({
      amount: String(params.amountSatang),
      currency: params.currency,
      card: params.cardToken,
      description: params.description,
    }),
  });
}

/** Create a PromptPay source, then charge against it — returns a QR code image URI for the customer to scan. */
export async function createPromptPayCharge(
  env: Env,
  params: { amountSatang: number; currency: string; description: string }
): Promise<OmiseCharge> {
  const source = await omiseFetch<OmiseSource>(env, "/sources", {
    method: "POST",
    body: new URLSearchParams({
      type: "promptpay",
      amount: String(params.amountSatang),
      currency: params.currency,
    }),
  });
  return omiseFetch<OmiseCharge>(env, "/charges", {
    method: "POST",
    body: new URLSearchParams({
      amount: String(params.amountSatang),
      currency: params.currency,
      source: source.id,
      description: params.description,
    }),
  });
}

/**
 * Omise webhook payloads are not signed, so never trust the POSTed body directly.
 * Re-fetch the charge by id from Omise's API with our secret key to get an authoritative status.
 */
export async function fetchAuthoritativeCharge(env: Env, chargeId: string): Promise<OmiseCharge> {
  return omiseFetch<OmiseCharge>(env, `/charges/${chargeId}`, { method: "GET" });
}

export function mapOmiseStatus(status: OmiseChargeStatus): "pending" | "succeeded" | "failed" {
  if (status === "successful") return "succeeded";
  if (status === "pending") return "pending";
  return "failed";
}
