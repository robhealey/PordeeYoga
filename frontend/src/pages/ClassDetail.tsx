import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type ClassSession, type MemberPackage } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { useLanguage } from "../lib/i18n";

export function ClassDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loginWithLine } = useAuth();
  const { t } = useLanguage();
  const [session, setSession] = useState<ClassSession | null>(null);
  const [packages, setPackages] = useState<MemberPackage[] | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waitlisted, setWaitlisted] = useState(false);
  const [attendees, setAttendees] = useState<Awaited<ReturnType<typeof api.classAttendees>>["attendees"] | null>(null);

  function remaining(mp: MemberPackage): string {
    if (mp.credits_total == null) return t("classDetail.unlimited");
    return t("classDetail.creditsLeft", { n: mp.credits_total - mp.credits_used });
  }

  useEffect(() => {
    if (!id) return;
    api
      .getClass(Number(id))
      .then((r) => setSession(r.session))
      .catch((e) => setError(String(e)));
  }, [id]);

  useEffect(() => {
    if (!user) return;
    api.usablePackages().then((r) => setPackages(r.memberPackages));
  }, [user]);

  // Packages this member has already used to book this class — each package can only hold one spot.
  const bookedPackageIds = new Set(
    (attendees ?? []).filter((a) => a.mine && a.memberPackageId != null).map((a) => a.memberPackageId as number)
  );
  const alreadyBooked = bookedPackageIds.size > 0;

  // Keep the selection on a package that can still book this class.
  useEffect(() => {
    if (!packages) return;
    if (selectedPackageId && packages.some((p) => p.id === selectedPackageId) && !bookedPackageIds.has(selectedPackageId)) return;
    setSelectedPackageId(packages.find((p) => !bookedPackageIds.has(p.id))?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packages, attendees]);

  useEffect(() => {
    if (!id || !user) return;
    api.classAttendees(Number(id)).then((r) => setAttendees(r.attendees));
  }, [id, user]);

  async function handleBook() {
    if (!session) return;
    if (!user) {
      await loginWithLine();
      return;
    }
    if (!selectedPackageId) return;
    const chosen = packages?.find((p) => p.id === selectedPackageId);
    const pkgLabel = chosen ? `${chosen.package_name}${chosen.note ? ` (${chosen.note})` : ""}` : "";
    const when = new Date(session.start_time).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
    const left = chosen && chosen.credits_total != null ? chosen.credits_total - chosen.credits_used - 1 : null;
    const message =
      (alreadyBooked
        ? t("classDetail.confirmBookAgain", { pkg: pkgLabel })
        : t("classDetail.confirmBook", { cls: session.class_name, when, pkg: pkgLabel })) +
      (left != null ? `\n\n${t("classDetail.confirmCredits", { n: left })}` : "");
    if (!window.confirm(message)) return;
    setBusy(true);
    setError(null);
    try {
      await api.createBooking(session.id, selectedPackageId);
      navigate("/my-bookings");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleJoinWaitlist() {
    if (!session) return;
    if (!user) {
      await loginWithLine();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.joinWaitlist(session.id, selectedPackageId ?? undefined);
      setWaitlisted(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (error && !session) return <p className="text-red-600">{error}</p>;
  if (!session) return <p className="text-sage-500">{t("classDetail.loading")}</p>;

  const isFull = session.spots_left <= 0;
  const isCancelled = session.status === "cancelled_by_studio";

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold">{session.class_name}</h1>
      <p className="text-sage-500 mt-1">
        {new Date(session.start_time).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })}
      </p>
      {session.instructor_name && <p className="text-sage-500">{t("classDetail.with", { name: session.instructor_name })}</p>}
      <p className="mt-2 text-sage-700">{t("classDetail.minutes", { n: session.duration_minutes })}</p>
      <p className="mt-1 text-sm text-sage-400">
        {isCancelled
          ? session.cancellation_reason
            ? t("classDetail.cancelledReason", { reason: session.cancellation_reason })
            : t("classDetail.cancelled")
          : isFull
            ? t("classDetail.full")
            : t("classDetail.spotsLeft", { n: session.spots_left })}
      </p>

      {error && <p className="mt-3 text-red-600 text-sm">{error}</p>}

      {!isCancelled && user && packages && packages.length === 0 && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-md p-3 text-sm">
          {t("classDetail.noPackage")}{" "}
          <Link to="/packages" className="underline text-sage-700">
            {t("classDetail.buyPackage")}
          </Link>{" "}
          {t("classDetail.toBook")}
        </div>
      )}

      {!isCancelled && user && packages && packages.length > 0 && (
        <div className="mt-4">
          <label className="text-sm text-sage-600">{t("classDetail.usePackage")}</label>
          <div className="mt-1 space-y-2">
            {packages.map((mp) => (
              <label
                key={mp.id}
                className={`flex items-start gap-3 border rounded-md px-3 py-2 ${
                  bookedPackageIds.has(mp.id)
                    ? "border-sage-100 bg-sage-50 opacity-60 cursor-not-allowed"
                    : selectedPackageId === mp.id
                      ? "border-sage-500 bg-sage-50 cursor-pointer"
                      : "border-sage-200 bg-white cursor-pointer"
                }`}
              >
                <input
                  type="radio"
                  name="member-package"
                  disabled={bookedPackageIds.has(mp.id)}
                  checked={selectedPackageId === mp.id}
                  onChange={() => setSelectedPackageId(mp.id)}
                  className="mt-1"
                />
                <span className="flex-1">
                  <span className="block font-medium text-sage-800">
                    {mp.package_name}
                    {mp.note && <span className="font-normal text-sage-600"> · {mp.note}</span>}
                  </span>
                  <span className="block text-sm text-sage-500">
                    {bookedPackageIds.has(mp.id) && <span className="text-sage-600">{t("classDetail.alreadyBookedWith")} · </span>}
                    {remaining(mp)}
                    {mp.expires_at ? ` — ${t("classDetail.expires", { date: new Date(mp.expires_at).toLocaleDateString() })}` : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {!isCancelled && !isFull && (
        <button
          onClick={() => void handleBook()}
          disabled={busy || (!!user && (!packages || packages.length === 0 || selectedPackageId == null))}
          className="mt-4 bg-sage-500 disabled:bg-sage-200 text-white px-4 py-2 rounded-md hover:bg-sage-600"
        >
          {busy ? t("classDetail.booking") : user ? t("classDetail.book") : t("classDetail.loginToBook")}
        </button>
      )}

      {!isCancelled && isFull && (
        <button
          onClick={() => void handleJoinWaitlist()}
          disabled={busy || waitlisted}
          className="mt-4 bg-sage-500 disabled:bg-sage-200 text-white px-4 py-2 rounded-md hover:bg-sage-600"
        >
          {waitlisted
            ? t("classDetail.onWaitlist")
            : busy
              ? t("classDetail.joining")
              : user
                ? t("classDetail.joinWaitlist")
                : t("classDetail.loginToWaitlist")}
        </button>
      )}

      <div className="mt-8 border-t border-sage-100 pt-4">
        <h2 className="font-medium text-sage-800 mb-2">{t("classDetail.whosComing")}</h2>
        {!user && <p className="text-sm text-sage-400">{t("classDetail.loginToSeeAttendees")}</p>}
        {user && attendees == null && <p className="text-sm text-sage-400">{t("classDetail.loading")}</p>}
        {user && attendees != null && attendees.length === 0 && (
          <p className="text-sm text-sage-400">{t("classDetail.noAttendees")}</p>
        )}
        {user && attendees != null && attendees.length > 0 && (
          <ul className="space-y-1 text-sm text-sage-700">
            {attendees.map((a, i) => (
              <li key={i}>
                {a.name}
                {a.mine && <span className="text-sage-400"> ({t("classDetail.you")})</span>}
                {a.note && <span className="text-sage-500 italic"> · {a.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
