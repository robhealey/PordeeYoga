import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ClassSession, type MemberPackage, type MyBooking } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { useLanguage } from "../lib/i18n";

// The studio operates in Asia/Bangkok — group/label days in that timezone regardless of the
// viewer's own device timezone, so "today"/"tomorrow" always matches what the studio means.
const STUDIO_TZ = "Asia/Bangkok";

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

function MemberSummary() {
  const { user } = useAuth();
  const { t } = useLanguage();
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

  function creditsLabel(mp: MemberPackage): string {
    if (mp.credits_total == null) return t("classDetail.unlimited");
    return t("classDetail.creditsLeft", { n: Math.max(0, mp.credits_total - mp.credits_used) });
  }

  return (
    <div className="mt-6 bg-sage-600 text-white rounded-lg p-4">
      <p className="text-sm text-sage-100">{t("schedule.hi", { name: user.display_name.split(" ")[0] })}</p>
      {nextBooking ? (
        <p className="mt-1 font-medium">
          {t("schedule.nextClass", { className: nextBooking.class_name, when: formatWhen(nextBooking.start_time) })}
        </p>
      ) : (
        <p className="mt-1 font-medium">{t("schedule.noUpcomingBooked")}</p>
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
        {t("schedule.managePackages")}
      </Link>
    </div>
  );
}

function DaySchedule({ sessions, onChanged }: { sessions: ClassSession[]; onChanged: () => void }) {
  const { t } = useLanguage();
  const { user } = useAuth();

  const statusLabel: Record<string, string> = {
    scheduled: t("status.scheduled"),
    confirmed: t("status.confirmed"),
    full: t("status.full"),
    cancelled_by_studio: t("status.cancelled_by_studio"),
    completed: t("status.completed"),
  };

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

  if (days.length === 0) return <p className="text-sage-500">{t("schedule.empty")}</p>;

  const current = days[Math.min(index, days.length - 1)];

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          aria-label={t("schedule.prevDay")}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full border border-sage-200 bg-white disabled:opacity-30 hover:border-sage-400"
        >
          ‹
        </button>
        <h2 className="flex-1 text-center font-medium text-sage-800">{dayHeaderLabel(current.items[0].start_time)}</h2>
        <button
          onClick={() => setIndex((i) => Math.min(days.length - 1, i + 1))}
          disabled={index === days.length - 1}
          aria-label={t("schedule.nextDay")}
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
        {current.items.map((s) => {
          const started = new Date(s.start_time).getTime() <= Date.now();
          const content = (
            <>
              <div className={`w-16 shrink-0 font-medium ${started ? "text-sage-400" : "text-sage-700"}`}>
                {formatTime(s.start_time)}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <h3 className={`font-medium ${started ? "text-sage-500" : ""}`}>{s.class_name}</h3>
                  <span className="text-sage-500 text-xs">{started ? t("schedule.started") : statusLabel[s.status] ?? s.status}</span>
                </div>
                {s.instructor_name && <p className="text-sm text-sage-500">{t("classDetail.with", { name: s.instructor_name })}</p>}
                {!started && (
                  <div className="flex justify-between items-end mt-2">
                    <p className="text-xs text-sage-400">
                      {s.spots_left > 0 ? t("schedule.spotsLeft", { n: s.spots_left }) : t("schedule.full")}
                    </p>
                  </div>
                )}
              </div>
            </>
          );
          if (started) {
            return (
              <div key={s.id} className="flex gap-4 border border-sage-100 bg-sage-50 opacity-60 rounded-lg p-4 cursor-not-allowed">
                {content}
              </div>
            );
          }
          return (
            <Link
              key={s.id}
              to={`/class/${s.id}`}
              className="flex gap-4 border border-sage-200 bg-white hover:shadow-md rounded-lg p-4 transition-shadow"
            >
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function Schedule() {
  const { t } = useLanguage();
  const [sessions, setSessions] = useState<ClassSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .listClasses()
      .then((r) => setSessions(r.sessions))
      .catch((e) => setError(String(e)));
  }

  useEffect(load, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">{t("schedule.title")}</h1>
      {error && <p className="text-red-600">{error}</p>}
      {!sessions && !error && <p className="text-sage-500">{t("schedule.loading")}</p>}
      {sessions && <DaySchedule sessions={sessions} onChanged={load} />}
      <MemberSummary />
    </div>
  );
}
