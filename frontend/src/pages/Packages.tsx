import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type BirthdayCoupon, type MemberPackage, type PackageCatalogItem } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function validity(pkg: PackageCatalogItem): string {
  const credits = pkg.credits == null ? "Unlimited classes" : `${pkg.credits} class${pkg.credits > 1 ? "es" : ""}`;
  const period = pkg.validity_value ? ` · ${pkg.validity_value} ${pkg.validity_unit}${pkg.validity_value > 1 ? "s" : ""}` : "";
  return credits + period;
}

const statusLabel: Record<string, string> = {
  pending_payment: "Awaiting payment",
  paid_not_activated: "Paid — not yet activated",
  active: "Active",
  expired: "Expired",
  combined: "Combined into renewal",
  cancelled: "Cancelled",
};

export function Packages() {
  const { user, loginWithLine } = useAuth();
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<PackageCatalogItem[] | null>(null);
  const [mine, setMine] = useState<MemberPackage[] | null>(null);
  const [coupons, setCoupons] = useState<BirthdayCoupon[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trialFor, setTrialFor] = useState<PackageCatalogItem | null>(null);
  const [trialName, setTrialName] = useState("");
  const [trialPhone, setTrialPhone] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  function loadMine() {
    if (!user) return;
    api.myPackages().then((r) => setMine(r.memberPackages));
    api.myBirthdayCoupons().then((r) => setCoupons(r.coupons));
  }

  useEffect(() => {
    api.listPackages().then((r) => setCatalog(r.packages));
  }, []);
  useEffect(loadMine, [user]);

  async function purchase(pkg: PackageCatalogItem, renewOldMemberPackageId?: number) {
    if (!user) {
      await loginWithLine();
      return;
    }
    setBusyId(pkg.id);
    setError(null);
    try {
      const { memberPackage } = await api.purchasePackage({
        packageId: pkg.id,
        trialFullName: trialFor ? trialName : undefined,
        trialPhone: trialFor ? trialPhone : undefined,
        renewOldMemberPackageId,
      });
      setTrialFor(null);
      navigate(`/checkout/package/${memberPackage.id}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function extend(mp: MemberPackage) {
    setBusyId(mp.id);
    setError(null);
    try {
      const { renewalId } = await api.requestExtendRenewal(mp.id);
      navigate(`/checkout/renewal/${renewalId}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function activate(mp: MemberPackage) {
    setBusyId(mp.id);
    setError(null);
    try {
      await api.activatePackage(mp.id);
      loadMine();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Packages</h1>
      {error && <p className="text-red-600 mb-3">{error}</p>}

      {user && mine && mine.length > 0 && (
        <section className="mb-8">
          <h2 className="font-medium mb-2">My packages</h2>
          <div className="space-y-2">
            {mine.map((mp) => (
              <div key={mp.id} className="border border-sage-200 rounded-lg p-3 bg-white flex justify-between items-center">
                <div>
                  <p className="font-medium">{mp.package_name}</p>
                  <p className="text-sm text-sage-500">
                    {mp.credits_total == null ? "Unlimited" : `${mp.credits_total - mp.credits_used} of ${mp.credits_total} left`}
                    {mp.expires_at && ` · expires ${new Date(mp.expires_at).toLocaleDateString()}`}
                  </p>
                  <p className="text-xs text-sage-400">{statusLabel[mp.status] ?? mp.status}</p>
                </div>
                <div className="flex gap-2">
                  {mp.status === "paid_not_activated" && (
                    <button
                      onClick={() => void activate(mp)}
                      disabled={busyId === mp.id}
                      className="text-sm text-sage-600 underline"
                    >
                      Activate
                    </button>
                  )}
                  {mp.status === "active" && !mp.renewal_option_used && (
                    <button
                      onClick={() => void extend(mp)}
                      disabled={busyId === mp.id}
                      className="text-sm text-sage-600 underline"
                    >
                      Extend +1mo (500 THB)
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {user && coupons && coupons.length > 0 && (
        <section className="mb-8">
          <h2 className="font-medium mb-2">Birthday coupons</h2>
          <div className="space-y-2">
            {coupons.map((c) => (
              <div key={c.id} className="border border-sage-200 rounded-lg p-3 bg-white text-sm">
                <span className={c.status === "active" ? "text-sage-700" : "text-sage-400"}>
                  {c.status === "active" ? "Ready to use" : c.status === "used" ? "Used" : "Expired"}
                </span>
                <span className="text-sage-400"> · expires {new Date(c.expires_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-medium mb-2">Buy a package</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {catalog?.map((pkg) => (
            <div key={pkg.id} className="border border-sage-200 rounded-lg p-4 bg-white">
              <div className="flex justify-between items-start">
                <h3 className="font-medium">{pkg.name}</h3>
                <span className="text-sage-600 text-sm">{formatMoney(pkg.price_cents, pkg.currency)}</span>
              </div>
              <p className="text-sm text-sage-500 mt-1">{validity(pkg)}</p>
              {pkg.shared === 1 && <p className="text-xs text-sage-400 mt-1">Shared credit pool</p>}

              {trialFor?.id === pkg.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void purchase(pkg);
                  }}
                  className="mt-3 space-y-2"
                >
                  <input
                    required
                    placeholder="Full name"
                    value={trialName}
                    onChange={(e) => setTrialName(e.target.value)}
                    className="w-full border border-sage-200 rounded-md px-2 py-1 text-sm"
                  />
                  <input
                    required
                    placeholder="Phone number"
                    value={trialPhone}
                    onChange={(e) => setTrialPhone(e.target.value)}
                    className="w-full border border-sage-200 rounded-md px-2 py-1 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={busyId === pkg.id}
                    className="bg-sage-500 disabled:bg-sage-200 text-white px-3 py-1.5 rounded-md text-sm w-full"
                  >
                    Confirm trial purchase
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => {
                    if (pkg.one_time_per_person) {
                      setTrialFor(pkg);
                      setTrialName(user?.display_name ?? "");
                    } else {
                      void purchase(pkg);
                    }
                  }}
                  disabled={busyId === pkg.id}
                  className="mt-3 bg-sage-500 disabled:bg-sage-200 text-white px-3 py-1.5 rounded-md text-sm"
                >
                  {busyId === pkg.id ? "Starting…" : user ? "Buy" : "Log in to buy"}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
