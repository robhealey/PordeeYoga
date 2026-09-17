import { useEffect, useState } from "react";
import { api, type MyBooking, type MyWaitlistEntry } from "../lib/api";

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

const statusLabel: Record<string, string> = {
  confirmed: "Confirmed",
  attended: "Attended",
  no_show: "No-show",
  cancelled_by_member: "Cancelled",
  late_cancelled: "Late cancellation",
  cancelled_by_studio: "Cancelled by studio",
};

const statusColor: Record<string, string> = {
  confirmed: "text-sage-600",
  attended: "text-sage-400",
  no_show: "text-red-400",
  cancelled_by_member: "text-sage-400",
  late_cancelled: "text-amber-600",
  cancelled_by_studio: "text-red-500",
};

export function MyBookings() {
  const [bookings, setBookings] = useState<MyBooking[] | null>(null);
  const [waitlist, setWaitlist] = useState<MyWaitlistEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .myBookings()
      .then((r) => setBookings(r.bookings))
      .catch((e) => setError(String(e)));
    api.myWaitlist().then((r) => setWaitlist(r.entries));
  }

  useEffect(load, []);

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

  if (error) return <p className="text-red-600">{error}</p>;
  if (!bookings) return <p className="text-sage-500">Loading…</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">My Bookings</h1>

      {waitlist && waitlist.length > 0 && (
        <div className="mb-6">
          <h2 className="font-medium mb-2">Waitlist</h2>
          <div className="space-y-2">
            {waitlist.map((w) => (
              <div key={w.id} className="border border-amber-200 bg-amber-50 rounded-lg p-3 flex justify-between items-center">
                <div>
                  <p className="font-medium">{w.class_name}</p>
                  <p className="text-sm text-sage-500">{formatWhen(w.start_time)}</p>
                  <p className="text-xs mt-1 text-amber-700">
                    {w.status === "notified" ? "A spot opened — claim it before it expires!" : "Waiting for a spot"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {w.status === "notified" && (
                    <button
                      onClick={() => void claim(w.id, w.member_package_id)}
                      className="text-sm text-sage-700 underline"
                    >
                      Claim
                    </button>
                  )}
                  <button onClick={() => void leaveWaitlist(w.id)} className="text-sm text-red-500 hover:underline">
                    Leave
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {bookings.length === 0 && <p className="text-sage-500">No bookings yet — go book a class!</p>}
      <div className="space-y-3">
        {bookings.map((b) => (
          <div key={b.id} className="border border-sage-200 rounded-lg p-4 bg-white flex justify-between items-center">
            <div>
              <p className="font-medium">{b.class_name}</p>
              <p className="text-sm text-sage-500">{formatWhen(b.start_time)}</p>
              <p className={`text-xs mt-1 ${statusColor[b.status] ?? ""}`}>{statusLabel[b.status] ?? b.status}</p>
              {b.package_name && <p className="text-xs text-sage-400">{b.package_name}</p>}
            </div>
            <div className="flex gap-2">
              {b.status === "confirmed" && (
                <button onClick={() => void cancel(b.id)} className="text-sm text-red-500 hover:underline">
                  Cancel
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
