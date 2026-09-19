import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type MemberPackage, type PackageRenewal } from "../lib/api";
import { useLanguage } from "../lib/i18n";

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
  const { t } = useLanguage();
  const [payable, setPayable] = useState<Payable | null>(null);
  const [notified, setNotified] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      description: t("checkout.renewalDescription"),
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
    // Poll for the admin having confirmed the payment manually (no live bank integration yet).
    pollRef.current = setInterval(async () => {
      const p = await load().catch(() => null);
      if (p && (p.isPaid || p.isTerminal) && pollRef.current) {
        clearInterval(pollRef.current);
      }
    }, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, targetId]);

  async function notifyPaid() {
    setNotifying(true);
    setError(null);
    try {
      if (kind === "renewal") await api.notifyRenewalPaid(targetId);
      else await api.notifyPackagePaid(targetId);
      setNotified(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setNotifying(false);
    }
  }

  if (error) return <p className="text-red-600">{error}</p>;
  if (!payable) return <p className="text-sage-500">{t("classDetail.loading")}</p>;

  if (payable.isPaid) {
    return (
      <div className="max-w-md">
        <h1 className="text-2xl font-semibold text-sage-700">{t("checkout.paymentReceived")}</h1>
        <p className="mt-2 text-sage-600">{payable.description}</p>
        <Link to={kind === "renewal" ? "/packages" : "/"} className="inline-block mt-4 text-sage-600 underline">
          {kind === "renewal" ? t("checkout.backToPackages") : t("checkout.browseClasses")}
        </Link>
      </div>
    );
  }

  if (payable.isTerminal) {
    return <p className="text-red-600">{t("checkout.terminal")}</p>;
  }

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-semibold">{t("checkout.title")}</h1>
      <p className="mt-1 text-sage-600">{payable.description}</p>
      <p className="mt-1 font-medium">{formatMoney(payable.amountCents, payable.currency)}</p>

      <div className="mt-4 border border-sage-200 rounded-lg p-4 bg-white">
        <img src="/promptpay-qr.jpg" alt="PromptPay QR code" className="w-64 h-64 mx-auto object-contain" />
        <p className="mt-3 text-sm text-sage-600 text-center">
          {t("checkout.scanInstructions", { amount: formatMoney(payable.amountCents, payable.currency) })}
        </p>
      </div>

      <div className="mt-4">
        {notified ? (
          <p className="text-sm text-sage-600 bg-sage-50 border border-sage-200 rounded-md p-3">{t("checkout.thanks")}</p>
        ) : (
          <button
            onClick={() => void notifyPaid()}
            disabled={notifying}
            className="w-full bg-sage-500 disabled:bg-sage-200 text-white px-4 py-2 rounded-md hover:bg-sage-600"
          >
            {notifying ? t("checkout.notifying") : t("checkout.ivePaid")}
          </button>
        )}
      </div>
    </div>
  );
}
