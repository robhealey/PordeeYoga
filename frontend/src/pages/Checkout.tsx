import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type MemberPackage, type PackageRenewal } from "../lib/api";
import { createOmiseCardToken } from "../lib/omise";

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

interface Payable {
  description: string;
  amountCents: number;
  currency: string;
  isPaid: boolean;
  isTerminal: boolean; // cancelled/expired — nothing more to do
}

export function Checkout() {
  const { kind, id } = useParams<{ kind: "package" | "renewal"; id: string }>();
  const targetId = Number(id);
  const [payable, setPayable] = useState<Payable | null>(null);
  const [method, setMethod] = useState<"promptpay" | "card">("promptpay");
  const [qrImageUri, setQrImageUri] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState({ name: "", number: "", expirationMonth: "", expirationYear: "", securityCode: "" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadPackage(): Promise<Payable> {
    const { memberPackages } = await api.myPackages();
    const mp = memberPackages.find((m) => m.id === targetId) as MemberPackage | undefined;
    if (!mp) throw new Error("Package purchase not found");
    return {
      description: mp.package_name,
      amountCents: mp.price_paid_cents,
      currency: mp.currency,
      isPaid: mp.status !== "pending_payment",
      isTerminal: mp.status === "cancelled",
    };
  }

  async function loadRenewal(): Promise<Payable> {
    const { renewal } = await api.getRenewal(targetId);
    const r = renewal as PackageRenewal;
    return {
      description: "Package extension (+1 month)",
      amountCents: r.fee_cents ?? 0,
      currency: "THB",
      isPaid: r.status === "applied",
      isTerminal: r.status === "cancelled",
    };
  }

  async function load() {
    const p = kind === "renewal" ? await loadRenewal() : await loadPackage();
    setPayable(p);
    return p;
  }

  useEffect(() => {
    load().catch((e) => setError(String(e)));
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, targetId]);

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const p = await load();
      if (p.isPaid || p.isTerminal) {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 3000);
  }

  function chargeBody(method: "card" | "promptpay", cardToken?: string) {
    return kind === "renewal"
      ? { packageRenewalId: targetId, method, cardToken }
      : { memberPackageId: targetId, method, cardToken };
  }

  async function payPromptPay() {
    setPaying(true);
    setError(null);
    try {
      const result = await api.chargeOmise(chargeBody("promptpay"));
      setQrImageUri(result.qrImageUri);
      startPolling();
    } catch (e) {
      setError(String(e));
    } finally {
      setPaying(false);
    }
  }

  async function payCard(e: React.FormEvent) {
    e.preventDefault();
    setPaying(true);
    setError(null);
    try {
      const cardToken = await createOmiseCardToken(card);
      await api.chargeOmise(chargeBody("card", cardToken));
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setPaying(false);
    }
  }

  if (error) return <p className="text-red-600">{error}</p>;
  if (!payable) return <p className="text-sage-500">Loading…</p>;

  if (payable.isPaid) {
    return (
      <div className="max-w-md">
        <h1 className="text-2xl font-semibold text-sage-700">Payment received! 🎉</h1>
        <p className="mt-2 text-sage-600">{payable.description}</p>
        <Link to={kind === "renewal" ? "/packages" : "/"} className="inline-block mt-4 text-sage-600 underline">
          {kind === "renewal" ? "Back to my packages" : "Browse classes"}
        </Link>
      </div>
    );
  }

  if (payable.isTerminal) {
    return <p className="text-red-600">This purchase was cancelled or expired.</p>;
  }

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-semibold">Checkout</h1>
      <p className="mt-1 text-sage-600">{payable.description}</p>
      <p className="mt-1 font-medium">{formatMoney(payable.amountCents, payable.currency)}</p>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setMethod("promptpay")}
          className={`px-3 py-1.5 rounded-md text-sm ${method === "promptpay" ? "bg-sage-500 text-white" : "bg-sage-100"}`}
        >
          PromptPay
        </button>
        <button
          onClick={() => setMethod("card")}
          className={`px-3 py-1.5 rounded-md text-sm ${method === "card" ? "bg-sage-500 text-white" : "bg-sage-100"}`}
        >
          Card
        </button>
      </div>

      {method === "promptpay" && (
        <div className="mt-4">
          {!qrImageUri ? (
            <button
              onClick={() => void payPromptPay()}
              disabled={paying}
              className="bg-sage-500 disabled:bg-sage-200 text-white px-4 py-2 rounded-md hover:bg-sage-600"
            >
              {paying ? "Generating QR…" : "Generate PromptPay QR"}
            </button>
          ) : (
            <div>
              <img src={qrImageUri} alt="PromptPay QR code" className="w-64 h-64 border border-sage-200 rounded-md" />
              <p className="mt-2 text-sm text-sage-500">Scan with your banking app. This page updates automatically.</p>
            </div>
          )}
        </div>
      )}

      {method === "card" && (
        <form onSubmit={(e) => void payCard(e)} className="mt-4 space-y-3">
          <input
            required
            placeholder="Cardholder name"
            value={card.name}
            onChange={(e) => setCard({ ...card, name: e.target.value })}
            className="w-full border border-sage-200 rounded-md px-3 py-2"
          />
          <input
            required
            placeholder="Card number"
            value={card.number}
            onChange={(e) => setCard({ ...card, number: e.target.value })}
            className="w-full border border-sage-200 rounded-md px-3 py-2"
          />
          <div className="flex gap-2">
            <input
              required
              placeholder="MM"
              value={card.expirationMonth}
              onChange={(e) => setCard({ ...card, expirationMonth: e.target.value })}
              className="w-16 border border-sage-200 rounded-md px-3 py-2"
            />
            <input
              required
              placeholder="YYYY"
              value={card.expirationYear}
              onChange={(e) => setCard({ ...card, expirationYear: e.target.value })}
              className="w-20 border border-sage-200 rounded-md px-3 py-2"
            />
            <input
              required
              placeholder="CVC"
              value={card.securityCode}
              onChange={(e) => setCard({ ...card, securityCode: e.target.value })}
              className="w-20 border border-sage-200 rounded-md px-3 py-2"
            />
          </div>
          <button
            type="submit"
            disabled={paying}
            className="bg-sage-500 disabled:bg-sage-200 text-white px-4 py-2 rounded-md hover:bg-sage-600"
          >
            {paying ? "Charging…" : `Pay ${formatMoney(payable.amountCents, payable.currency)}`}
          </button>
        </form>
      )}
    </div>
  );
}
