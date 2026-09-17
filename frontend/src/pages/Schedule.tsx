import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ClassSession, type MemberPackage, type MyBooking } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

// The studio operates in Asia/Bangkok — group/label days in that timezone regardless of the
// viewer's own device timezone, so "today"/"tomorrow" always matches what the studio means.
const STUDIO_TZ = "Asia/Bangkok";

const statusLabel: Record<string, string> = {
  scheduled: "Open",
  confirmed: "Confirmed",
  full: "Full",
  cancelled_by_studio: "Cancelled",
  completed: "Completed",
};

function dateKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: STUDIO_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso)
  );
}

function dayChipLabel(iso: string): { weekday: string; day: string } {
  const d = new Date(iso);
  return {
    weekday: new Intl.DateTimeFormat("en-US", { timeZone: STUDIO_TZ, weekday: "short" }).format(d),
    day: new Intl.DateTimeFormat("en-US", { timeZone: STUDIO_TZ, day: "numeric" }).format(d),
  };
}

function dayHeaderLabel(iso: string): string {
  const today = dateKey(new Date().toISOString());
  const tomorrow = dateKey(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
  const key = dateKey(iso);
  const full = new Intl.DateTimeFormat("en-US", { timeZone: STUDIO_TZ, weekday: "long", month: "short", day: "numeric" }).format(
    new Date(iso)
  );
  if (key === today) return `Today · ${full}`;
  if (key === tomorrow) return `Tomorrow · ${full}`;
  return full;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { timeZone: STUDIO_TZ, hour: "numeric", minute: "2-digit" });
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: STUDIO_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function creditsLabel(mp: MemberPackage): string {
  if (mp.credits_total == null) return "Unlimited";
  return `${Math.max(0, mp.credits_total - mp.credits_used)} left`;
}

function MemberSummary() {
  const { user } = useAuth();
  const [packages, setPackages] = useState<MemberPackage[] | null>(null);
  const [nextBooking, setNextBooking] = useState<MyBooking | null>(null);

  useEffect(() => {
    if (!user) return;
    api.myPackages().then((r) => setPackages(r.memberPackages.filter((mp) => mp.status === "active")));
    api.myBookings().then((r) => {
      const upcoming = r.bookings
        .filter((b) => b.status === "confirmed" && new Date(b.start_time).getTime() > Date.now())
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
      setNextBooking(upcoming[0] ?? null);
    });
  }, [user]);

  if (!user) return null;
  if (packages == null) return null; // still loading, or nothing to show yet
  if (packages.length === 0 && !nextBooking) return null;

  return (
    <div className="mb-6 bg-sage-600 text-white rounded-lg p-4">
      <p className="text-sm text-sage-100">Hi {user.display_name.split(" ")[0]},</p>
      {nextBooking ? (
        <p className="mt-1 font-medium">
          Next class: {nextBooking.class_name} — {formatWhen(nextBooking.start_time)}
        </p>
      ) : (
        <p className="mt-1 font-medium">No upcoming classes booked yet.</p>
      )}
      {packages.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {packages.map((mp) => (
            <li key={mp.id} className="flex justify-between text-sage-50">
              <span>{mp.package_name}</span>
              <span className="font-medium">{creditsLabel(mp)}</span>
            </li>
          ))}
        </ul>
      )}
      <Link to="/packages" className="inline-block mt-3 text-xs text-sage-100 underline">
        Manage packages
      </Link>
    </div>
  );
}

function DaySchedule({ sessions }: { sessions: ClassSession[] }) {
  const days = useMemo(() => {
    const groups = new Map<string, ClassSession[]>();
    for (const s of sessions) {
      const key = dateKey(s.start_time);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({
        key,
        items: items.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()),
      }));
  }, [sessions]);

  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
  }, [days.length]);

  if (days.length === 0) return <p className="text-sage-500">No upcoming classes yet.</p>;

  const current = days[Math.min(index, days.length - 1)];

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          aria-label="Previous day"
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full border border-sage-200 bg-white disabled:opacity-30 hover:border-sage-400"
        >
          ‹
        </button>
        <h2 className="flex-1 text-center font-medium text-sage-800">{dayHeaderLabel(current.items[0].start_time)}</h2>
        <button
          onClick={() => setIndex((i) => Math.min(days.length - 1, i + 1))}
          disabled={index === days.length - 1}
          aria-label="Next day"
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full border border-sage-200 bg-white disabled:opacity-30 hover:border-sage-400"
        >
          ›
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1">
        {days.map((d, i) => {
          const { weekday, day } = dayChipLabel(d.items[0].start_time);
          const active = i === index;
          return (
            <button
              key={d.key}
              onClick={() => setIndex(i)}
              className={`shrink-0 w-14 rounded-lg py-2 text-center border ${
                active ? "bg-sage-500 border-sage-500 text-white" : "bg-white border-sage-200 text-sage-600"
              }`}
            >
              <div className="text-[11px] uppercase">{weekday}</div>
              <div className="text-lg font-semibold leading-tight">{day}</div>
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {current.items.map((s) => (
          <Link
            key={s.id}
            to={`/class/${s.id}`}
            className="flex gap-4 border border-sage-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow"
          >
            <div className="w-16 shrink-0 text-sage-700 font-medium">{formatTime(s.start_time)}</div>
            <div className="flex-1">
              <div className="flex justify-between items-start">
                <h3 className="font-medium">{s.class_name}</h3>
                <span className="text-sage-500 text-xs">{statusLabel[s.status] ?? s.status}</span>
              </div>
              {s.instructor_name && <p className="text-sm text-sage-500">with {s.instructor_name}</p>}
              <p className="text-xs mt-2 text-sage-400">
                {s.spots_left > 0 ? `${s.spots_left} spots left` : "Full — join the waitlist"}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function Schedule() {
  const [sessions, setSessions] = useState<ClassSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listClasses()
      .then((r) => setSessions(r.sessions))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div>
      <MemberSummary />
      <h1 className="text-2xl font-semibold mb-4">Upcoming Classes</h1>
      {error && <p className="text-red-600">{error}</p>}
      {!sessions && !error && <p className="text-sage-500">Loading classes…</p>}
      {sessions && <DaySchedule sessions={sessions} />}
    </div>
  );
}
