import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type BirthdayCoupon, type MemberPackage, type PackageCatalogItem } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { LoginPrompt } from "../components/LoginPrompt";
import { useLanguage } from "../lib/i18n";

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function CheckBadge({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <circle cx="12" cy="12" r="12" fill="currentColor" />
      <path d="M7.5 12.5l3 3 6-6.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Free-text label on a package. Saves itself shortly after typing stops, and on blur. */
function NoteInput({ mp }: { mp: MemberPackage }) {
  const { t } = useLanguage();
  const [value, setValue] = useState(mp.note ?? "");
  const [saved, setSaved] = useState(mp.note ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const savedRef = useRef(saved);
  savedRef.current = saved;

  async function save(next: string) {
    if (next.trim() === savedRef.current.trim()) return;
    setState("saving");
    try {
      await api.updatePackageNote(mp.id, next.trim());
      setSaved(next.trim());
      setState("saved");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void save(value), 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="flex items-center gap-2 mt-1">
      <input
        maxLength={100}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setState("idle");
        }}
        onBlur={() => void save(value)}
        placeholder={t("packages.addNote")}
        className="flex-1 min-w-0 border border-sage-200 rounded-md px-2 py-1 text-sm bg-white"
      />
      <span className={`text-xs w-12 ${state === "error" ? "text-red-500" : "text-sage-400"}`}>
        {state === "saving" ? "…" : state === "saved" ? "✓" : state === "error" ? "Failed" : ""}
      </span>
    </div>
  );
}

export function Packages() {
  const { user, loginWithLine } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [catalog, setCatalog] = useState<PackageCatalogItem[] | null>(null);
  const [mine, setMine] = useState<MemberPackage[] | null>(null);
  const [coupons, setCoupons] = useState<BirthdayCoupon[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trialFor, setTrialFor] = useState<PackageCatalogItem | null>(null);
  const [trialName, setTrialName] = useState("");
  const [trialPhone, setTrialPhone] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [renewFor, setRenewFor] = useState<MemberPackage | null>(null);
  const statusLabel: Record<string, string> = {
    pending_payment: t("packageStatus.pending_payment"),
    paid_not_activated: t("packageStatus.paid_not_activated"),
    active: t("packageStatus.active"),
    expired: t("packageStatus.expired"),
    combined: t("packageStatus.combined"),
    cancelled: t("packageStatus.cancelled"),
  };

  function validity(pkg: PackageCatalogItem): string {
    const credits =
      pkg.credits == null
        ? t("packages.unlimitedShort")
        : t(pkg.credits > 1 ? "packages.classCount_other" : "packages.classCount_one", { n: pkg.credits });
    const period = pkg.validity_value
      ? ` · ${t(pkg.validity_value > 1 ? "packages.period_other" : "packages.period_one", {
          n: pkg.validity_value,
          unit: t(`unit.${pkg.validity_unit}`),
        })}`
      : "";
    return credits + period;
  }

  function loadMine() {
    if (!user) return;
    api.myPackages().then((r) => setMine(r.memberPackages));
    api.myBirthdayCoupons().then((r) => setCoupons(r.coupons));
  }

  useEffect(() => {
    api.listPackages().then((r) => setCatalog(r.packages));
  }, []);
  useEffect(loadMine, [user]);

  async function purchase(pkg: PackageCatalogItem, renewOldMemberPackageId: number | undefined = renewFor?.id) {
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
        note: notes[pkg.id]?.trim() || undefined,
      });
      setRenewFor(null);
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

  if (!user) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-4">{t("packages.title")}</h1>
        <LoginPrompt label={t("loginPrompt.packagesLabel")} />
        <section className="mt-8">
          <h2 className="font-medium mb-2">{t("packages.available")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {catalog?.map((pkg) => (
              <div key={pkg.id} className="border border-sage-200 rounded-lg p-4 bg-white">
                <div className="flex justify-between items-start">
                  <h3 className="font-medium">{pkg.name}</h3>
                  <span className="text-sage-600 text-sm">{formatMoney(pkg.price_cents, pkg.currency)}</span>
                </div>
                <p className="text-sm text-sage-500 mt-1">{validity(pkg)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  const activeMine = (mine ?? []).filter((mp) => mp.status === "active");
  const [primaryActive, ...otherActive] = activeMine;
  const historyMine = (mine ?? []).filter((mp) => mp.status !== "active");
  const activePackageIds = new Set(activeMine.map((mp) => mp.package_id));

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">{t("packages.title")}</h1>
      {error && <p className="text-red-600 mb-3">{error}</p>}

      {(mine ?? [])
        .filter((mp) => mp.renewal)
        .map((mp) => {
          const r = mp.renewal!;
          const date = (iso: string) => new Date(iso).toLocaleDateString();
          const fee = formatMoney(r.extendFeeCents, mp.currency);
          return (
            <section key={`renew-${mp.id}`} className="mb-6 border border-amber-300 bg-amber-50 rounded-lg p-4">
              <h2 className="font-medium text-sage-800">
                {t(r.expired ? "renewal.titleExpired" : "renewal.titleSoon", {
                  name: mp.package_name,
                  date: date(mp.expires_at!),
                })}
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="bg-white border border-sage-200 rounded-md p-3 text-sm flex flex-col">
                  <p className="font-medium">{t("renewal.opt1Title")}</p>
                  <p className="text-sage-600 mt-1 flex-1">
                    {t("renewal.opt1Body", { n: r.extendMonths, fee, date: date(r.newExpiresAt) })}
                  </p>
                  <button
                    onClick={() => void extend(mp)}
                    disabled={busyId === mp.id}
                    className="mt-2 bg-sage-500 disabled:bg-sage-200 text-white px-3 py-1.5 rounded-md"
                  >
                    {t("renewal.opt1Button", { fee })}
                  </button>
                </div>
                <div className="bg-white border border-sage-200 rounded-md p-3 text-sm flex flex-col">
                  <p className="font-medium">{t("renewal.opt2Title")}</p>
                  <p className="text-sage-600 mt-1 flex-1">
                    {t("renewal.opt2Body", { date: date(r.activateBy), n: r.remainingCredits ?? "∞" })}
                  </p>
                  {r.canCombine ? (
                    <button
                      onClick={() => {
                        setRenewFor(mp);
                        document.getElementById("package-catalog")?.scrollIntoView({ behavior: "smooth" });
                      }}
                      className="mt-2 border border-sage-500 text-sage-700 px-3 py-1.5 rounded-md"
                    >
                      {t("renewal.opt2Button")}
                    </button>
                  ) : (
                    <p className="mt-2 text-xs text-sage-400">{t("renewal.opt2Unavailable")}</p>
                  )}
                </div>
              </div>
              <p className="text-xs text-sage-600 mt-3">{t("renewal.payBy", { date: date(r.payBy) })}</p>
            </section>
          );
        })}

      {primaryActive && (
        <section className="mb-8">
          <h2 className="font-medium mb-2">{t("packages.yourPackage")}</h2>
          <div className="border border-sage-300 bg-sage-50 rounded-lg p-4 flex items-center gap-3">
            <CheckBadge className="w-9 h-9 text-sage-500 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-sage-800">{primaryActive.package_name}</p>
              <NoteInput key={primaryActive.id} mp={primaryActive} />
              <p className="text-sm text-sage-600">
                {primaryActive.credits_total == null
                  ? t("packages.unlimitedClasses")
                  : t("packages.classesLeft", {
                      used: primaryActive.credits_total - primaryActive.credits_used,
                      total: primaryActive.credits_total,
                    })}
                {primaryActive.expires_at &&
                  ` · ${t("packages.expires", { date: new Date(primaryActive.expires_at).toLocaleDateString() })}`}
              </p>
            </div>
          </div>

          {otherActive.length > 0 && (
            <div className="mt-2 space-y-1">
              {otherActive.map((mp) => (
                <div key={mp.id} className="flex items-start gap-2 text-sm text-sage-600 pl-1">
                  <CheckBadge className="w-4 h-4 text-sage-400 shrink-0 mt-0.5" />
                  <div>
                  <span>{mp.package_name}</span>
                  <span className="text-sage-400">
                    ·{" "}
                    {mp.credits_total == null
                      ? t("classDetail.unlimited")
                      : t("packages.classesLeft", { used: mp.credits_total - mp.credits_used, total: mp.credits_total })}
                  </span>
                  <NoteInput key={mp.id} mp={mp} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {historyMine.length > 0 && (
        <section className="mb-8">
          <h2 className="font-medium mb-2 text-sage-500 text-sm">{t("packages.otherPackages")}</h2>
          <div className="space-y-2">
            {historyMine.map((mp) => (
              <div key={mp.id} className="border border-sage-200 rounded-lg p-3 bg-white flex justify-between items-center">
                <div>
                  <p className="font-medium">{mp.package_name}{mp.note && <span className="font-normal text-sage-600 italic"> · “{mp.note}”</span>}</p>
                  <p className="text-sm text-sage-500">
                    {mp.credits_total == null
                      ? t("classDetail.unlimited")
                      : t("packages.classesLeft", { used: mp.credits_total - mp.credits_used, total: mp.credits_total })}
                    {mp.expires_at && ` · ${t("packages.expires", { date: new Date(mp.expires_at).toLocaleDateString() })}`}
                  </p>
                  <p className="text-xs text-sage-400">
                    {statusLabel[mp.status] ?? mp.status}
                    {mp.combine_activate_by && ` · ${t("renewal.activateBy", { date: new Date(mp.combine_activate_by).toLocaleDateString() })}`}
                  </p>
                </div>
                {mp.status === "paid_not_activated" && (
                  <button
                    onClick={() => void activate(mp)}
                    disabled={busyId === mp.id}
                    className="text-sm text-sage-600 underline"
                  >
                    {t("packages.activate")}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {coupons && coupons.length > 0 && (
        <section className="mb-8">
          <h2 className="font-medium mb-2">{t("packages.birthdayCoupons")}</h2>
          <div className="space-y-2">
            {coupons.map((c) => (
              <div key={c.id} className="border border-sage-200 rounded-lg p-3 bg-white text-sm">
                <span className={c.status === "active" ? "text-sage-700" : "text-sage-400"}>
                  {c.status === "active" ? t("packages.couponReady") : c.status === "used" ? t("packages.couponUsed") : t("packages.couponExpired")}
                </span>
                <span className="text-sage-400"> · {t("packages.expires", { date: new Date(c.expires_at).toLocaleDateString() })}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section id="package-catalog">
        <h2 className="font-medium mb-2">{t("packages.buyAPackage")}</h2>
        {renewFor && (
          <p className="mb-3 text-sm bg-amber-50 border border-amber-300 rounded-md p-3">
            {t("renewal.pickBanner", { n: renewFor.renewal?.remainingCredits ?? "∞", name: renewFor.package_name })}{" "}
            <button onClick={() => setRenewFor(null)} className="underline text-sage-700">
              {t("renewal.cancel")}
            </button>
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {catalog?.map((pkg) => {
            const signedUp = !renewFor && activePackageIds.has(pkg.id);
            return (
              <div key={pkg.id} className="border border-sage-200 rounded-lg p-4 bg-white">
                <div className="flex justify-between items-start">
                  <h3 className="font-medium">{pkg.name}</h3>
                  <span className="text-sage-600 text-sm">{formatMoney(pkg.price_cents, pkg.currency)}</span>
                </div>
                <p className="text-sm text-sage-500 mt-1">{validity(pkg)}</p>
                {pkg.shared === 1 && <p className="text-xs text-sage-400 mt-1">{t("packages.sharedPool")}</p>}

                {signedUp ? (
                  <div className="mt-3 flex items-center gap-2 text-sage-600 text-sm">
                    <CheckBadge className="w-5 h-5 text-sage-500" />
                    {t("packages.signedUp")}
                  </div>
                ) : trialFor?.id === pkg.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void purchase(pkg);
                    }}
                    className="mt-3 space-y-2"
                  >
                    <input
                      required
                      placeholder={t("packages.fullNamePlaceholder")}
                      value={trialName}
                      onChange={(e) => setTrialName(e.target.value)}
                      className="w-full border border-sage-200 rounded-md px-2 py-1 text-sm"
                    />
                    <input
                      required
                      placeholder={t("packages.phonePlaceholder")}
                      value={trialPhone}
                      onChange={(e) => setTrialPhone(e.target.value)}
                      className="w-full border border-sage-200 rounded-md px-2 py-1 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={busyId === pkg.id}
                      className="bg-sage-500 disabled:bg-sage-200 text-white px-3 py-1.5 rounded-md text-sm w-full"
                    >
                      {t("packages.confirmTrial")}
                    </button>
                  </form>
                ) : (
                  <>
                  <input
                    maxLength={100}
                    placeholder={t("packages.notePlaceholder")}
                    value={notes[pkg.id] ?? ""}
                    onChange={(e) => setNotes({ ...notes, [pkg.id]: e.target.value })}
                    className="mt-3 w-full border border-sage-200 rounded-md px-2 py-1 text-sm"
                  />
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
                    {busyId === pkg.id ? t("packages.starting") : t("packages.buy")}
                  </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
