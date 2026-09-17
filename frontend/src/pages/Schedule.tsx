import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ClassSession } from "../lib/api";

const statusLabel: Record<string, string> = {
  scheduled: "Open",
  confirmed: "Confirmed",
  full: "Full",
  cancelled_by_studio: "Cancelled",
  completed: "Completed",
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
      <h1 className="text-2xl font-semibold mb-4">Upcoming Classes</h1>
      {error && <p className="text-red-600">{error}</p>}
      {!sessions && !error && <p className="text-sage-500">Loading classes…</p>}
      {sessions && sessions.length === 0 && <p className="text-sage-500">No upcoming classes yet.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {sessions?.map((s) => (
          <Link
            key={s.id}
            to={`/class/${s.id}`}
            className="block border border-sage-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start">
              <h2 className="font-medium">{s.class_name}</h2>
              <span className="text-sage-500 text-xs">{statusLabel[s.status] ?? s.status}</span>
            </div>
            <p className="text-sm text-sage-500 mt-1">{formatWhen(s.start_time)}</p>
            {s.instructor_name && <p className="text-sm text-sage-500">with {s.instructor_name}</p>}
            <p className="text-xs mt-2 text-sage-400">
              {s.spots_left > 0 ? `${s.spots_left} spots left` : "Full — join the waitlist"}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
