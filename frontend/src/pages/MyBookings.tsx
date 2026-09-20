import { useEffect, useState } from "react";
import { api, type MyBooking, type MyWaitlistEntry } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { LoginPrompt } from "../components/LoginPrompt";
import { useLanguage } from "../lib/i18n";

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

const statusColor: Record<string, string> = {
  confirmed: "text-sage-600",
  attended: "text-sage-400",
  no_show: "text-red-400",
  cancelled_by_member: "text-sage-400",
  late_cancelled: "text-amber-600",
  cancelled_by_studio: "text-red-500",
};

export function MyBookings() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [bookings, setBookings] = useState<MyBooking[] | null>(null);
  const [waitlist, setWaitlist] = useState<MyWaitlistEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activePackageCount, setActivePackageCount] = useState(0);

  const statusLabel: Record<string, string> = {
    confirmed: t("bookingStatus.confirmed"),
    attended: t("bookingStatus.attended"),
    no_show: t("bookingStatus.no_show"),
    cancelled_by_member: t("bookingStatus.cancelled_by_member"),
    late_cancelled: t("bookingStatus.late_cancelled"),
    cancelled_by_studio: t("bookingStatus.cancelled_by_studio"),
  };

  function load() {
    if (!user) return;
    api
      .myBookings()
      .then((r) => setBookings(r.bookings))
      .catch((e) => setError(String(e)));
    api.myWaitlist().then((r) => setWaitlist(r.entries));
    api.myPackages().then((r) => setActivePackageCount(r.memberPackages.filter((mp) => mp.status === "active").length)).catch(() => {});
  }

  useEffect(load, [user]);

  async function cancel(id: number) {
    await api.cancelBooking(id);
    load();
  }

  async function leaveWaitlist(id: number) {
    await api.leaveWaitlist(id);
    load();
  }

  async function claim(id: number, memberPackageId: number | null) {
    if (!memberPackageId) return;
    await api.claimWaitlist(id, memberPackageId);
    load();
  }

  if (!user) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-4">{t("myBookings.title")}</h1>
        <LoginPrompt label={t("loginPrompt.bookingsLabel")} />
      </div>
    );
  }
  if (error) return <p className="text-red-600">{error}</p>;
  if (!bookings) return <p className="text-sage-500">{t("classDetail.loading")}</p>;

  // Only worth labelling the package when there's more than one to tell apart.
  const multiplePackages =
    activePackageCount > 1 || new Set(bookings.map((b) => b.member_package_id).filter((id) => id != null)).size > 1;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">{t("myBookings.title")}</h1>

      {waitlist && waitlist.length > 0 && (
        <div className="mb-6">
          <h2 className="font-medium mb-2">{t("myBookings.waitlist")}</h2>
          <div className="space-y-2">
            {waitlist.map((w) => (
              <div key={w.id} className="border border-amber-200 bg-amber-50 rounded-lg p-3 flex justify-between items-center">
                <div>
                  <p className="font-medium">{w.class_name}</p>
                  <p className="text-sm text-sage-500">{formatWhen(w.start_time)}</p>
                  <p className="text-xs mt-1 text-amber-700">
                    {w.status === "notified" ? t("myBookings.spotOpened") : t("myBookings.waiting")}
                  </p>
                </div>
                <div className="flex gap-2">
                  {w.status === "notified" && (
                    <button
                      onClick={() => void claim(w.id, w.member_package_id)}
                      className="text-sm text-sage-700 underline"
                    >
                      {t("myBookings.claim")}
                    </button>
                  )}
                  <button onClick={() => void leaveWaitlist(w.id)} className="text-sm text-red-500 hover:underline">
                    {t("myBookings.leave")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {bookings.length === 0 && <p className="text-sage-500">{t("myBookings.empty")}</p>}
      <div className="space-y-3">
        {bookings.map((b) => (
          <div key={b.id} className="border border-sage-200 rounded-lg p-4 bg-white flex justify-between items-center">
            <div>
              <p className="font-medium">{b.class_name}</p>
              <p className="text-sm text-sage-500">{formatWhen(b.start_time)}</p>
              <p className={`text-xs mt-1 ${statusColor[b.status] ?? ""}`}>{statusLabel[b.status] ?? b.status}</p>
              {b.package_name && (multiplePackages || b.package_note) && (
                <p className="text-xs text-sage-500">
                  {b.package_name}
                  {b.package_note && <span className="italic"> · {b.package_note}</span>}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {b.status === "confirmed" && new Date(b.start_time).getTime() > Date.now() && (
                <button onClick={() => void cancel(b.id)} className="text-sm text-red-500 hover:underline">
                  {t("myBookings.cancel")}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
