import { Fragment, useEffect, useState } from "react";
import { PromptModal } from "../components/PromptModal";
import {
  adminApi,
  type AdminBookingRow,
  type AdminPaymentRow,
  type ClassTypeRow,
  type HolidayRow,
  type InstructorRow,
  type MemberDetail,
  type MemberPackageRow,
  type MemberRow,
  type PackageCatalogRow,
  type ParsedScheduleSession,
  type PendingPaymentRow,
  type SessionBookingRow,
  type SessionRow,
  type WaitlistRow,
} from "../lib/adminApi";
import { formatDate, formatDateOnly, formatDateTime } from "../lib/dateFormat";

type Tab =
  | "sessions"
  | "class-types"
  | "instructors"
  | "members"
  | "packages"
  | "pending-payments"
  | "flags"
  | "holidays"
  | "settings"
  | "bookings"
  | "payments";

const TABS: Tab[] = [
  "sessions",
  "class-types",
  "instructors",
  "members",
  "packages",
  "pending-payments",
  "flags",
  "holidays",
  "settings",
  "bookings",
  "payments",
];

export function Admin() {
  const [tab, setTab] = useState<Tab>("sessions");

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Studio Admin</h1>
      <div className="flex gap-2 mb-4 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-md text-sm ${tab === t ? "bg-sage-500 text-white" : "bg-sage-100"}`}
          >
            {t.replace("-", " ")}
          </button>
        ))}
      </div>
      {tab === "sessions" && <SessionsTab />}
      {tab === "class-types" && <ClassTypesTab />}
      {tab === "instructors" && <InstructorsTab />}
      {tab === "members" && <MembersTab />}
      {tab === "packages" && <PackageCatalogTab />}
      {tab === "pending-payments" && <PendingPaymentsTab />}
      {tab === "flags" && <ExpiryFlagsTab />}
      {tab === "holidays" && <HolidaysTab />}
      {tab === "settings" && <SettingsTab />}
      {tab === "bookings" && <BookingsTab />}
      {tab === "payments" && <PaymentsTab />}
    </div>
  );
}

// -- Class types --------------------------------------------------------------

function ClassTypesTab() {
  const [items, setItems] = useState<ClassTypeRow[]>([]);
  const [form, setForm] = useState({
    name: "",
    durationMinutes: 60,
    capacity: 11,
    priceCents: 50000,
    minConfirmCount: 2,
  });
  const [error, setError] = useState<string | null>(null);

  function load() {
    adminApi.listClassTypes().then((r) => setItems(r.classTypes));
  }
  useEffect(load, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await adminApi.createClassType(form);
      setForm({ name: "", durationMinutes: 60, capacity: 11, priceCents: 50000, minConfirmCount: 2 });
      load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function toggleActive(ct: ClassTypeRow) {
    await adminApi.updateClassType(ct.id, { active: ct.active ? 0 : 1 });
    load();
  }

  return (
    <div>
      <form onSubmit={(e) => void submit(e)} className="flex flex-wrap gap-3 mb-4 bg-white p-3 rounded-lg border border-sage-200">
        <label className="flex flex-col text-xs text-sage-500 gap-1">
          Name
          <input
            required
            placeholder="e.g. Vinyasa Flow"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="border border-sage-200 rounded-md px-2 py-1 text-sm text-sage-800"
          />
        </label>
        <label className="flex flex-col text-xs text-sage-500 gap-1">
          Duration (minutes)
          <input
            type="number"
            value={form.durationMinutes}
            onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
            className="w-24 border border-sage-200 rounded-md px-2 py-1 text-sm text-sage-800"
          />
        </label>
        <label className="flex flex-col text-xs text-sage-500 gap-1">
          Capacity (spots)
          <input
            type="number"
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
            className="w-24 border border-sage-200 rounded-md px-2 py-1 text-sm text-sage-800"
          />
        </label>
        <label className="flex flex-col text-xs text-sage-500 gap-1">
          Min bookings to confirm
          <input
            type="number"
            value={form.minConfirmCount}
            onChange={(e) => setForm({ ...form, minConfirmCount: Number(e.target.value) })}
            className="w-28 border border-sage-200 rounded-md px-2 py-1 text-sm text-sage-800"
          />
        </label>
        <label className="flex flex-col text-xs text-sage-500 gap-1">
          Price (THB)
          <input
            type="number"
            min={0}
            step={1}
            value={form.priceCents / 100}
            onChange={(e) => setForm({ ...form, priceCents: Math.round(Number(e.target.value) * 100) })}
            className="w-28 border border-sage-200 rounded-md px-2 py-1 text-sm text-sage-800"
          />
        </label>
        <button className="bg-sage-500 text-white px-3 py-1 rounded-md self-end">Add class type</button>
      </form>
      {error && <p className="text-red-600 mb-2">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm bg-white rounded-lg overflow-hidden border border-sage-200">
          <thead className="bg-sage-100 text-left">
            <tr>
              <th className="p-2">Name</th>
              <th className="p-2">Minutes</th>
              <th className="p-2">Capacity</th>
              <th className="p-2">Min to confirm</th>
              <th className="p-2">Active</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t border-sage-100">
                <td className="p-2">{i.name}</td>
                <td className="p-2">{i.duration_minutes}</td>
                <td className="p-2">{i.capacity}</td>
                <td className="p-2">
                  {i.min_confirm_count}
                  {i.min_confirm_value_cents != null && ` or ${(i.min_confirm_value_cents / 100).toFixed(0)} THB value`}
                </td>
                <td className="p-2">{i.active ? "Yes" : "No"}</td>
                <td className="p-2">
                  <button onClick={() => void toggleActive(i)} className="text-sage-600 hover:underline">
                    {i.active ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// -- Instructors ----------------------------------------------------------------

function InstructorsTab() {
  const [items, setItems] = useState<InstructorRow[]>([]);
  const [name, setName] = useState("");
  const [lineMembers, setLineMembers] = useState<MemberRow[]>([]);
  const [memberSearch, setMemberSearch] = useState("");

  function load() {
    adminApi.listInstructors().then((r) => setItems(r.instructors));
  }
  useEffect(load, []);
  useEffect(() => {
    adminApi.listMembers(memberSearch.trim() || undefined).then((r) => setLineMembers(r.members.filter((m) => m.line_user_id)));
  }, [memberSearch]);

  async function link(i: InstructorRow, userId: string) {
    await adminApi.updateInstructor(i.id, { userId: userId ? Number(userId) : null });
    load();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await adminApi.createInstructor({ name });
    setName("");
    load();
  }

  return (
    <div>
      <form onSubmit={(e) => void submit(e)} className="flex gap-2 mb-4 bg-white p-3 rounded-lg border border-sage-200">
        <input
          required
          placeholder="Instructor name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border border-sage-200 rounded-md px-2 py-1"
        />
        <button className="bg-sage-500 text-white px-3 py-1 rounded-md">Add instructor</button>
      </form>
      <p className="text-sm text-sage-500 mb-2">
        Link each instructor to their LINE account so they're messaged when one of their classes is confirmed or
        cancelled. They need to have logged in to this app with LINE once to appear in the list.
      </p>
      <input
        placeholder="Search members to link…"
        value={memberSearch}
        onChange={(e) => setMemberSearch(e.target.value)}
        className="border border-sage-200 rounded-md px-2 py-1 text-sm mb-2"
      />
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i.id} className="bg-white border border-sage-200 rounded-md p-2 flex flex-wrap items-center justify-between gap-2">
            <span>{i.name}</span>
            <label className="text-xs text-sage-500 flex items-center gap-1">
              LINE account
              <select
                value={i.user_id ?? ""}
                onChange={(e) => void link(i, e.target.value)}
                className="border border-sage-200 rounded-md px-2 py-1 text-sm text-sage-800"
              >
                <option value="">Not linked (no notifications)</option>
                {i.user_id && !lineMembers.some((m) => m.id === i.user_id) && (
                  <option value={i.user_id}>{i.user_name ?? `Member #${i.user_id}`}{i.has_line ? "" : " (no LINE)"}</option>
                )}
                {lineMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name}
                  </option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

// -- Sessions ---------------------------------------------------------------------

function SessionsTab() {
  const [items, setItems] = useState<SessionRow[]>([]);
  const [classTypes, setClassTypes] = useState<{ id: number; name: string }[]>([]);
  const [instructors, setInstructors] = useState<{ id: number; name: string }[]>([]);
  const [form, setForm] = useState({ classTypeId: "", instructorId: "", startTime: "", endTime: "" });
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [roster, setRoster] = useState<SessionBookingRow[]>([]);
  const [cancelTargetId, setCancelTargetId] = useState<number | null>(null);
  const [waitlist, setWaitlist] = useState<WaitlistRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [instructorFilter, setInstructorFilter] = useState("");
  const [range, setRange] = useState<"upcoming" | "today" | "week" | "past" | "all">("upcoming");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const todayKey = tzDateKey(new Date().toISOString());
  const weekStartKey = toDateKey(mondayOfWeek(todayKey));
  const weekEndKey = toDateKey(addDays(mondayOfWeek(todayKey), 6));
  const q = search.trim().toLowerCase();
  const filtered = items
    .filter((s) => {
      const day = tzDateKey(s.start_time);
      if (dateFrom || dateTo) {
        if (dateFrom && day < dateFrom) return false;
        if (dateTo && day > dateTo) return false;
      } else if (range === "upcoming" && new Date(s.start_time).getTime() < Date.now()) return false;
      else if (range === "past" && new Date(s.start_time).getTime() >= Date.now()) return false;
      else if (range === "today" && day !== todayKey) return false;
      else if (range === "week" && (day < weekStartKey || day > weekEndKey)) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      if (instructorFilter && String(s.instructor_id ?? "") !== instructorFilter) return false;
      if (q && !`${s.class_name} ${s.instructor_name ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => {
      const d = new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      return range === "past" ? -d : d;
    });
  const filtersActive = !!(q || statusFilter || instructorFilter || dateFrom || dateTo || range !== "upcoming");

  async function resetData() {
    if (!window.confirm("Delete ALL class sessions, bookings and waitlist entries? Users and packages are kept, and package credits are restored. This cannot be undone.")) return;
    const typed = window.prompt('Type DELETE to confirm');
    if (typed !== "DELETE") return;
    try {
      const r = await adminApi.resetScheduleData();
      setExpanded(null);
      setError(null);
      load();
      window.alert(`Cleared ${r.deletedSessions} sessions and ${r.deletedBookings} bookings.`);
    } catch (e) {
      setError(String(e));
    }
  }

  function load() {
    adminApi.listSessions().then((r) => setItems(r.sessions));
    adminApi.listClassTypes().then((r) => setClassTypes(r.classTypes));
    adminApi.listInstructors().then((r) => setInstructors(r.instructors));
  }
  useEffect(load, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await adminApi.createSession({
        classTypeId: Number(form.classTypeId),
        instructorId: form.instructorId ? Number(form.instructorId) : null,
        startTime: new Date(form.startTime).toISOString(),
        endTime: new Date(form.endTime).toISOString(),
      });
      setForm({ classTypeId: "", instructorId: "", startTime: "", endTime: "" });
      load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function cancel(id: number, reason?: string) {
    await adminApi.cancelSession(id, reason);
    load();
  }

  async function openManually(id: number) {
    await adminApi.openSessionManually(id);
    load();
  }

  async function refreshRoster(id: number) {
    const [b, w] = await Promise.all([adminApi.sessionBookings(id), adminApi.sessionWaitlist(id)]);
    setRoster(b.bookings);
    setWaitlist(w.entries);
  }

  async function toggleExpand(id: number) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    await refreshRoster(id);
  }

  async function noShow(bookingId: number, sessionId: number) {
    await adminApi.markNoShow(bookingId);
    await refreshRoster(sessionId);
    load();
  }

  async function attended(bookingId: number, sessionId: number) {
    await adminApi.markAttended(bookingId);
    await refreshRoster(sessionId);
    load();
  }

  return (
    <div>
      <form onSubmit={(e) => void submit(e)} className="flex flex-wrap gap-2 mb-4 bg-white p-3 rounded-lg border border-sage-200">
        <select
          required
          value={form.classTypeId}
          onChange={(e) => setForm({ ...form, classTypeId: e.target.value })}
          className="border border-sage-200 rounded-md px-2 py-1"
        >
          <option value="">Class type…</option>
          {classTypes.map((ct) => (
            <option key={ct.id} value={ct.id}>
              {ct.name}
            </option>
          ))}
        </select>
        <select
          value={form.instructorId}
          onChange={(e) => setForm({ ...form, instructorId: e.target.value })}
          className="border border-sage-200 rounded-md px-2 py-1"
        >
          <option value="">No instructor</option>
          {instructors.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <input
          required
          type="datetime-local"
          value={form.startTime}
          onChange={(e) => setForm({ ...form, startTime: e.target.value })}
          className="border border-sage-200 rounded-md px-2 py-1"
        />
        <input
          required
          type="datetime-local"
          value={form.endTime}
          onChange={(e) => setForm({ ...form, endTime: e.target.value })}
          className="border border-sage-200 rounded-md px-2 py-1"
        />
        <button className="bg-sage-500 text-white px-3 py-1 rounded-md">Schedule class</button>
      </form>

      <ScheduleImportPanel classTypes={classTypes} instructors={instructors} onImported={load} />

      {error && <p className="text-red-600 mb-2">{error}</p>}

      <div className="mb-3 bg-white p-3 rounded-lg border border-sage-200 space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search class or instructor…"
            className="border border-sage-200 rounded-md px-2 py-1 flex-1 min-w-[12rem]"
          />
          <select value={instructorFilter} onChange={(e) => setInstructorFilter(e.target.value)} className="border border-sage-200 rounded-md px-2 py-1">
            <option value="">All instructors</option>
            {instructors.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-sage-200 rounded-md px-2 py-1">
            <option value="">All statuses</option>
            {["scheduled", "confirmed", "full", "completed", "cancelled_by_studio"].map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2 items-center text-sm">
          {(["upcoming", "today", "week", "past", "all"] as const).map((r) => (
            <button
              key={r}
              onClick={() => { setRange(r); setDateFrom(""); setDateTo(""); }}
              className={`px-2.5 py-1 rounded-full border ${!dateFrom && !dateTo && range === r ? "bg-sage-500 text-white border-sage-500" : "border-sage-200 text-sage-600"}`}
            >
              {r === "week" ? "This week" : r[0].toUpperCase() + r.slice(1)}
            </button>
          ))}
          <span className="text-sage-400 ml-2">From</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border border-sage-200 rounded-md px-2 py-0.5" />
          <span className="text-sage-400">to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border border-sage-200 rounded-md px-2 py-0.5" />
          {filtersActive && (
            <button
              onClick={() => { setSearch(""); setStatusFilter(""); setInstructorFilter(""); setRange("upcoming"); setDateFrom(""); setDateTo(""); }}
              className="text-sage-600 underline"
            >
              Clear filters
            </button>
          )}
          <span className="text-sage-400 ml-auto">{filtered.length} of {items.length} sessions</span>
        </div>
        <div className="flex justify-end">
          <button onClick={() => void resetData()} className="text-xs text-red-500 hover:underline">
            Clear all sessions &amp; bookings (testing)
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm bg-white rounded-lg overflow-hidden border border-sage-200">
          <thead className="bg-sage-100 text-left">
            <tr>
              <th className="p-2">Class</th>
              <th className="p-2">Instructor</th>
              <th className="p-2">Start</th>
              <th className="p-2">Booked</th>
              <th className="p-2">Status</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="p-4 text-center text-sage-400">No sessions match these filters.</td></tr>
            )}
            {filtered.map((s) => (
              <Fragment key={s.id}>
                <tr className="border-t border-sage-100 cursor-pointer" onClick={() => void toggleExpand(s.id)}>
                  <td className="p-2">{s.class_name}</td>
                  <td className="p-2">{s.instructor_name ?? "—"}</td>
                  <td className="p-2">{formatDateTime(s.start_time)}</td>
                  <td className="p-2">{s.booked_count}</td>
                  <td className="p-2">{s.status}{s.opened_manually ? " (manual)" : ""}</td>
                  <td className="p-2 space-x-2" onClick={(e) => e.stopPropagation()}>
                    {s.status !== "cancelled_by_studio" && !s.opened_manually && (
                      <button onClick={() => void openManually(s.id)} className="text-sage-600 hover:underline">
                        Open manually
                      </button>
                    )}
                    {s.status !== "cancelled_by_studio" && (
                      <button onClick={() => setCancelTargetId(s.id)} className="text-red-500 hover:underline">
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
                {expanded === s.id && (
                  <tr key={`${s.id}-detail`} className="border-t border-sage-100 bg-sage-50">
                    <td colSpan={6} className="p-3">
                      <p className="font-medium mb-1">Roster</p>
                      {roster.length === 0 && <p className="text-sage-400">No bookings.</p>}
                      <ul className="space-y-1 mb-3">
                        {roster.map((b) => (
                          <li key={b.id} className="flex justify-between items-center">
                            <span>
                              {b.user_name} {b.phone && `· ${b.phone}`} {b.package_name && `· ${b.package_name}`} — {b.status}
                            </span>
                            {b.status === "confirmed" && (
                              <span className="space-x-2">
                                <button onClick={() => void attended(b.id, s.id)} className="text-sage-600 hover:underline">
                                  Attended
                                </button>
                                <button onClick={() => void noShow(b.id, s.id)} className="text-red-500 hover:underline">
                                  No-show
                                </button>
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                      <p className="font-medium mb-1">Waitlist</p>
                      {waitlist.length === 0 && <p className="text-sage-400">Nobody waiting.</p>}
                      <ul className="space-y-1">
                        {waitlist.map((w) => (
                          <li key={w.id}>
                            user #{w.user_id} — {w.status}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {cancelTargetId != null && (
        <PromptModal
          title="Cancellation reason (optional)"
          placeholder="Reason"
          submitLabel="Cancel session"
          onClose={() => setCancelTargetId(null)}
          onSubmit={(value) => {
            const id = cancelTargetId;
            setCancelTargetId(null);
            void cancel(id, value.trim() || undefined);
          }}
        />
      )}

      <WeeklyCalendar sessions={items} onSelect={(id) => void toggleExpand(id)} />
    </div>
  );
}

// -- Weekly calendar view ----------------------------------------------------------

const STUDIO_TZ = "Asia/Bangkok";
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function tzDateKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: STUDIO_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso)
  );
}

/** Monday (in STUDIO_TZ) of the week containing `dateKey` (a "YYYY-MM-DD" civil date). */
function mondayOfWeek(dateKey: string): Date {
  const d = new Date(`${dateKey}T00:00:00Z`);
  const day = d.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDayTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { timeZone: STUDIO_TZ, hour: "numeric", minute: "2-digit" });
}

/** "21 Sep" (or "21 Sep 2026" with the year), day first — `d` is a UTC-midnight civil-date marker. */
function dayMonthLabel(d: Date, withYear = false): string {
  const day = d.toLocaleDateString("en-US", { timeZone: "UTC", day: "numeric" });
  const month = d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short" });
  const year = withYear ? ` ${d.toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric" })}` : "";
  return `${day} ${month}${year}`;
}

const CALENDAR_STATUS_STYLE: Record<string, string> = {
  cancelled_by_studio: "bg-red-50 border-red-200 text-red-500 line-through",
  full: "bg-amber-50 border-amber-200 text-amber-700",
  confirmed: "bg-sage-100 border-sage-300 text-sage-800",
  scheduled: "bg-white border-sage-200 text-sage-700",
  completed: "bg-sage-50 border-sage-100 text-sage-400",
};

function WeeklyCalendar({ sessions, onSelect }: { sessions: SessionRow[]; onSelect: (id: number) => void }) {
  const [weekStart, setWeekStart] = useState(() => mondayOfWeek(tzDateKey(new Date().toISOString())));

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const byDay = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    const key = tzDateKey(s.start_time);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(s);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }

  const rangeLabel = `${dayMonthLabel(weekStart)} – ${dayMonthLabel(addDays(weekStart, 6), true)}`;

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="font-medium text-sage-800 flex-1">Weekly calendar</h2>
        <button
          onClick={() => setWeekStart((d) => addDays(d, -7))}
          className="w-8 h-8 flex items-center justify-center rounded-full border border-sage-200 bg-white hover:border-sage-400"
          aria-label="Previous week"
        >
          ‹
        </button>
        <span className="text-sm text-sage-600 w-40 text-center">{rangeLabel}</span>
        <button
          onClick={() => setWeekStart((d) => addDays(d, 7))}
          className="w-8 h-8 flex items-center justify-center rounded-full border border-sage-200 bg-white hover:border-sage-400"
          aria-label="Next week"
        >
          ›
        </button>
        <button
          onClick={() => setWeekStart(mondayOfWeek(tzDateKey(new Date().toISOString())))}
          className="text-sm text-sage-600 underline"
        >
          This week
        </button>
      </div>
      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 gap-2 min-w-[700px]">
          {days.map((d) => {
            const key = toDateKey(d);
            const daySessions = byDay.get(key) ?? [];
            const isToday = key === tzDateKey(new Date().toISOString());
            return (
              <div key={key} className={`rounded-lg border p-2 min-h-[8rem] ${isToday ? "border-sage-400 bg-sage-50/50" : "border-sage-200 bg-white"}`}>
                <div className="text-xs font-medium text-sage-500 mb-1">
                  {WEEKDAY_LABELS[(d.getUTCDay() + 6) % 7]}{" "}
                  {dayMonthLabel(d)}
                </div>
                <div className="space-y-1">
                  {daySessions.length === 0 && <p className="text-xs text-sage-300">—</p>}
                  {daySessions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => onSelect(s.id)}
                      className={`w-full text-left text-xs rounded-md border px-1.5 py-1 hover:shadow-sm ${
                        CALENDAR_STATUS_STYLE[s.status] ?? "bg-white border-sage-200 text-sage-700"
                      }`}
                    >
                      <div className="font-medium">{formatDayTime(s.start_time)} {s.class_name}</div>
                      <div className="text-[11px] opacity-80">
                        {s.instructor_name ?? "—"} · {s.booked_count}/{s.capacity_override ?? s.class_capacity}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// -- Import schedule from a photo (AI-assisted) -----------------------------------

const DAY_INDEX: Record<string, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

interface ImportRow extends ParsedScheduleSession {
  include: boolean;
  classTypeId: string;
  instructorName: string;
  time: string;
  durationMinutes: number;
}

function nextMonday(): string {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 1 ? 0 : ((8 - day) % 7) || 7;
  d.setDate(d.getDate() + (day === 1 ? 0 : diff));
  return d.toISOString().slice(0, 10);
}

function ScheduleImportPanel({
  classTypes,
  instructors,
  onImported,
}: {
  classTypes: { id: number; name: string }[];
  instructors: { id: number; name: string }[];
  onImported: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [weekStart, setWeekStart] = useState(nextMonday());
  const [creating, setCreating] = useState(false);

  function matchClassTypeId(name: string): string {
    const norm = (v: string) =>
      v.toLowerCase().replace(/&/g, " and ").replace(/\b(class|yoga)\b/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    const target = norm(name);
    if (!target) return "";
    const compact = (v: string) => v.replace(/\s/g, "");
    const scored = classTypes.map((ct) => {
      const n = norm(ct.name);
      let score = 0;
      if (n === target || compact(n) === compact(target)) score = 100;
      else if (n && (compact(n).includes(compact(target)) || compact(target).includes(compact(n)))) score = 60;
      else {
        const a = new Set(n.split(" "));
        const b = target.split(" ");
        const shared = b.filter((w) => a.has(w)).length;
        score = (shared / Math.max(a.size, b.length)) * 50;
      }
      return { ct, score };
    });
    const best = scored.sort((x, y) => y.score - x.score)[0];
    return best && best.score >= 25 ? String(best.ct.id) : "";
  }

  async function handleFile(file: File) {
    setBusy(true);
    setModelUsed(null);
    setError(null);
    setRows([]);
    try {
      const imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { sessions, model } = await adminApi.parseScheduleImage(imageBase64);
      setModelUsed(model ?? null);
      setRows(
        sessions.map((s) => ({
          ...s,
          include: true,
          classTypeId: matchClassTypeId(s.className),
          instructorName: s.instructorName ?? "",
          time: s.time ?? "09:00",
          durationMinutes: s.durationMinutes ?? 60,
        }))
      );
      if (sessions.length === 0) setError("Couldn't find any sessions in that image — try a clearer photo.");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function updateRow(i: number, patch: Partial<ImportRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function createSessions() {
    setCreating(true);
    setError(null);
    try {
      const instructorIdByName = new Map<string, number>(
        instructors.map((i) => [i.name.toLowerCase(), i.id] as const)
      );
      for (const row of rows) {
        if (!row.include || !row.classTypeId) continue;

        let instructorId: number | null = null;
        const name = row.instructorName.trim();
        if (name) {
          const existing = instructorIdByName.get(name.toLowerCase());
          if (existing) {
            instructorId = existing;
          } else {
            const { instructor } = await adminApi.createInstructor({ name });
            instructorIdByName.set(name.toLowerCase(), instructor.id);
            instructorId = instructor.id;
          }
        }

        const validDate = row.date && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && !isNaN(new Date(`${row.date}T00:00:00`).getTime());
        const dateStr = validDate ? (row.date as string) : (() => {
          const base = new Date(`${weekStart}T00:00:00`);
          const dayKey = (row.dayOfWeek ?? "").toLowerCase().match(/[a-z]+/)?.[0] ?? "";
          const offset = DAY_INDEX[dayKey] ?? 0;
          base.setDate(base.getDate() + offset);
          const pad = (n: number) => String(n).padStart(2, "0");
          return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
        })();
        const timeMatch = (row.time ?? "").match(/(\d{1,2})\s*[.:]\s*(\d{2})/);
        const timeStr = timeMatch ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}` : "09:00";
        const start = new Date(`${dateStr}T${timeStr}:00`);
        if (isNaN(start.getTime())) throw new Error(`Invalid date/time for "${row.className}" (${dateStr} ${row.time})`);
        const end = new Date(start.getTime() + row.durationMinutes * 60000);

        await adminApi.createSession({
          classTypeId: Number(row.classTypeId),
          instructorId,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        });
      }
      setRows([]);
      setOpen(false);
      onImported();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mb-4 bg-white p-3 rounded-lg border border-sage-200">
      <button onClick={() => setOpen((o) => !o)} className="text-sm font-medium text-sage-700">
        {open ? "▾" : "▸"} Import schedule from a photo
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-sage-500">
            Upload a photo of a printed timetable or whiteboard — AI will read the teachers and class times so you
            can review and create them as real sessions below.
          </p>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
            className="text-sm"
          />
          {busy && <p className="text-sm text-sage-500">Reading image…</p>}
          {modelUsed && !busy && <p className="text-xs text-sage-400">Read by: {modelUsed}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {rows.length > 0 && (
            <>
              <div className="flex items-center gap-2 text-sm">
                <label>Week starting (Monday):</label>
                <input
                  type="date"
                  value={weekStart}
                  onChange={(e) => setWeekStart(e.target.value)}
                  className="border border-sage-200 rounded-md px-2 py-1"
                />
                <span className="text-sage-400">— used for rows extracted as a day-of-week (e.g. "Monday")</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-sage-100 text-left">
                    <tr>
                      <th className="p-1"></th>
                      <th className="p-1">Extracted name</th>
                      <th className="p-1">Class type</th>
                      <th className="p-1">Instructor</th>
                      <th className="p-1">Day/Date</th>
                      <th className="p-1">Time</th>
                      <th className="p-1">Minutes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className="border-t border-sage-100">
                        <td className="p-1">
                          <input
                            type="checkbox"
                            checked={row.include}
                            onChange={(e) => updateRow(i, { include: e.target.checked })}
                          />
                        </td>
                        <td className="p-1">{row.className}</td>
                        <td className="p-1">
                          <select
                            value={row.classTypeId}
                            onChange={(e) => updateRow(i, { classTypeId: e.target.value })}
                            className="border border-sage-200 rounded-md px-1 py-0.5"
                          >
                            <option value="">Choose…</option>
                            {classTypes.map((ct) => (
                              <option key={ct.id} value={ct.id}>
                                {ct.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-1">
                          <input
                            value={row.instructorName}
                            onChange={(e) => updateRow(i, { instructorName: e.target.value })}
                            placeholder="Instructor"
                            className="w-28 border border-sage-200 rounded-md px-1 py-0.5"
                          />
                        </td>
                        <td className="p-1 text-sage-500">{row.date ?? row.dayOfWeek ?? "—"}</td>
                        <td className="p-1">
                          <input
                            type="time"
                            value={row.time}
                            onChange={(e) => updateRow(i, { time: e.target.value })}
                            className="border border-sage-200 rounded-md px-1 py-0.5"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="number"
                            value={row.durationMinutes}
                            onChange={(e) => updateRow(i, { durationMinutes: Number(e.target.value) })}
                            className="w-16 border border-sage-200 rounded-md px-1 py-0.5"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={() => void createSessions()}
                disabled={creating || rows.every((r) => !r.include || !r.classTypeId)}
                className="bg-sage-500 disabled:bg-sage-200 text-white px-3 py-1.5 rounded-md text-sm"
              >
                {creating ? "Creating…" : `Create ${rows.filter((r) => r.include && r.classTypeId).length} session(s)`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// -- Members -----------------------------------------------------------------------

function MembersTab() {
  const [items, setItems] = useState<MemberRow[]>([]);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [form, setForm] = useState({ displayName: "", phone: "" });
  const [packages, setPackages] = useState<PackageCatalogRow[]>([]);
  const [grantModalOpen, setGrantModalOpen] = useState(false);
  const [grantPackageId, setGrantPackageId] = useState("");
  const [grantNote, setGrantNote] = useState("");
  const [grantPaidAt, setGrantPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [grantActivationDeadline, setGrantActivationDeadline] = useState("");
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [editingMember, setEditingMember] = useState(false);
  const [memberForm, setMemberForm] = useState({ displayName: "", phone: "", dateOfBirth: "", notes: "" });
  const [editingPkgId, setEditingPkgId] = useState<number | null>(null);
  const [pkgForm, setPkgForm] = useState({ total: "", used: "", expires: "", status: "active", activationDeadline: "" });
  const [showAllPackages, setShowAllPackages] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [addClassOpen, setAddClassOpen] = useState(false);

  async function saveMember() {
    if (!detail) return;
    setMemberError(null);
    try {
      await adminApi.updateMember(detail.member.id, {
        displayName: memberForm.displayName.trim(),
        phone: memberForm.phone.trim() || null,
        dateOfBirth: memberForm.dateOfBirth || null,
        notes: memberForm.notes.trim() || null,
      });
      setEditingMember(false);
      setDetail(await adminApi.getMember(detail.member.id));
      load();
    } catch (e) {
      setMemberError(String(e));
    }
  }

  function startEditPackage(mp: MemberPackageRow) {
    setEditingPkgId(mp.id);
    setPkgForm({
      total: mp.credits_total == null ? "" : String(mp.credits_total),
      used: String(mp.credits_used),
      expires: mp.expires_at ? mp.expires_at.slice(0, 10) : "",
      status: mp.status === "expired" || mp.status === "cancelled" ? mp.status : "active",
      activationDeadline: mp.activation_deadline ?? "",
    });
  }

  async function savePackage(mp: MemberPackageRow) {
    if (!detail) return;
    setMemberError(null);
    try {
      await adminApi.updateMemberPackage(mp.id, {
        creditsTotal: pkgForm.total.trim() === "" ? null : Number(pkgForm.total),
        creditsUsed: Number(pkgForm.used || 0),
        expiresAt: pkgForm.expires ? new Date(`${pkgForm.expires}T23:59:59`).toISOString() : null,
        status: pkgForm.status,
      });
      // Applied after the edit above, since setting a deadline recomputes the expiry.
      if (pkgForm.activationDeadline !== (mp.activation_deadline ?? "")) {
        await adminApi.setActivationDeadline(mp.id, pkgForm.activationDeadline || null);
      }
      setEditingPkgId(null);
      setDetail(await adminApi.getMember(detail.member.id));
    } catch (e) {
      setMemberError(String(e));
    }
  }

  async function removePackage(mp: MemberPackageRow) {
    if (!detail) return;
    if (!window.confirm(`Remove "${mp.package_name}" from ${detail.member.display_name}?`)) return;
    setMemberError(null);
    try {
      const r = await adminApi.deleteMemberPackage(mp.id);
      if (r.cancelled) window.alert("This package has bookings or payments linked to it, so it was marked cancelled instead of deleted. The member can no longer use it.");
      setDetail(await adminApi.getMember(detail.member.id));
    } catch (e) {
      setMemberError(String(e));
    }
  }
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeResults, setMergeResults] = useState<MemberRow[]>([]);
  const [mergeError, setMergeError] = useState<string | null>(null);

  useEffect(() => {
    if (!mergeOpen) return;
    adminApi.listMembers(mergeSearch.trim() || undefined).then((r) => setMergeResults(r.members.filter((m) => m.line_user_id)));
  }, [mergeOpen, mergeSearch]);

  async function mergeInto(target: MemberRow) {
    if (!detail) return;
    const walkIn = detail.member;
    if (!window.confirm(`Merge walk-in "${walkIn.display_name}" into LINE account "${target.display_name}"?\n\nTheir packages, bookings and coupons move to the LINE account and the walk-in record is deleted. This cannot be undone.`)) return;
    setMergeError(null);
    try {
      await adminApi.mergeMembers(walkIn.id, target.id);
      setMergeOpen(false);
      setMergeSearch("");
      load();
      setDetail(await adminApi.getMember(target.id));
    } catch (e) {
      setMergeError(String(e));
    }
  }

  function load() {
    adminApi.listMembers(search || undefined).then((r) => setItems(r.members));
  }
  useEffect(load, [search]);
  useEffect(() => {
    adminApi.listPackageCatalog().then((r) => setPackages(r.packages));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await adminApi.createMember(form);
    setForm({ displayName: "", phone: "" });
    load();
  }

  async function openDetail(id: number) {
    setMergeOpen(false);
    setMergeError(null);
    setShowAllPackages(false);
    setGrantModalOpen(false);
    setAddClassOpen(false);
    setDetail(await adminApi.getMember(id));
  }

  function openGrantModal() {
    setGrantPackageId("");
    setGrantNote("");
    setGrantPaidAt(new Date().toISOString().slice(0, 10));
    setGrantActivationDeadline("");
    setGrantError(null);
    setGrantModalOpen(true);
  }

  async function reloadDetail() {
    if (!detail) return;
    setDetail(await adminApi.getMember(detail.member.id));
  }

  async function grant() {
    if (!detail || !grantPackageId) return;
    setGrantError(null);
    setGranting(true);
    try {
      await adminApi.grantPackage(
        detail.member.id,
        Number(grantPackageId),
        true,
        grantNote.trim() || undefined,
        grantPaidAt,
        grantActivationDeadline || undefined
      );
      setGrantModalOpen(false);
      setDetail(await adminApi.getMember(detail.member.id));
      load();
    } catch (e) {
      setGrantError(String(e));
    } finally {
      setGranting(false);
    }
  }

  async function issueBirthdayCoupon() {
    if (!detail) return;
    await adminApi.issueBirthdayCoupon(detail.member.id);
    setDetail(await adminApi.getMember(detail.member.id));
  }

  async function changeRole(role: string) {
    if (!detail) return;
    await adminApi.updateMember(detail.member.id, { role });
    setDetail(await adminApi.getMember(detail.member.id));
    load();
  }

  return (
    <div>
      <div className="max-w-xl">
        <form onSubmit={(e) => void submit(e)} className="flex flex-wrap gap-2 mb-3 bg-white p-3 rounded-lg border border-sage-200">
          <input
            required
            placeholder="Full name"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            className="border border-sage-200 rounded-md px-2 py-1"
          />
          <input
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="border border-sage-200 rounded-md px-2 py-1"
          />
          <button className="bg-sage-500 text-white px-3 py-1 rounded-md">Add walk-in member</button>
        </form>
        <input
          placeholder="Search by name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-sage-200 rounded-md px-2 py-1 mb-2"
        />
        <ul className="space-y-1">
          {items.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => void openDetail(m.id)}
                className="w-full text-left bg-white border border-sage-200 rounded-md p-2 hover:border-sage-400"
              >
                <span className="font-medium">{m.display_name}</span>{" "}
                <span className="text-sage-400 text-sm">{m.phone ?? "no phone"}</span>
                {!m.line_user_id && <span className="ml-2 text-xs text-amber-600">walk-in</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
          <div className="max-w-3xl mx-auto p-4 md:p-6">
            <button onClick={() => setDetail(null)} className="text-sm text-sage-600 underline mb-4">
              ← Back to members
            </button>
            {editingMember ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveMember();
                }}
                className="space-y-2 mb-2"
              >
                <input required placeholder="Name" value={memberForm.displayName} onChange={(e) => setMemberForm({ ...memberForm, displayName: e.target.value })} className="w-full border border-sage-200 rounded-md px-2 py-1" />
                <input placeholder="Phone" value={memberForm.phone} onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })} className="w-full border border-sage-200 rounded-md px-2 py-1" />
                <label className="block text-xs text-sage-500">
                  Date of birth
                  <input type="date" value={memberForm.dateOfBirth} onChange={(e) => setMemberForm({ ...memberForm, dateOfBirth: e.target.value })} className="block w-full border border-sage-200 rounded-md px-2 py-1 text-sm text-sage-800" />
                </label>
                <textarea placeholder="Notes" value={memberForm.notes} onChange={(e) => setMemberForm({ ...memberForm, notes: e.target.value })} className="w-full border border-sage-200 rounded-md px-2 py-1 text-sm" rows={2} />
                <div className="flex gap-3 text-sm">
                  <button className="bg-sage-500 text-white px-3 py-1 rounded-md">Save</button>
                  <button type="button" onClick={() => setEditingMember(false)} className="text-sage-600 underline">Cancel</button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex items-start gap-2">
                  <h2 className="font-semibold text-2xl flex-1">{detail.member.display_name}</h2>
                  <button
                    onClick={() => {
                      setMemberForm({
                        displayName: detail.member.display_name,
                        phone: detail.member.phone ?? "",
                        dateOfBirth: detail.member.date_of_birth ?? "",
                        notes: detail.member.notes ?? "",
                      });
                      setEditingMember(true);
                    }}
                    className="text-sm text-sage-600 underline"
                  >
                    Edit details
                  </button>
                </div>
                <p className="text-sm text-sage-500">{detail.member.phone ?? "No phone on file"}</p>
                {detail.member.date_of_birth && <p className="text-sm text-sage-500">Born {formatDateOnly(detail.member.date_of_birth)}</p>}
                {detail.member.notes && <p className="text-sm text-sage-500 italic whitespace-pre-line">{detail.member.notes}</p>}
              </>
            )}

            <div className="grid grid-cols-2 gap-3 mt-3 max-w-sm">
              <div className="bg-sage-50 border border-sage-100 rounded-lg p-3">
                <p className="text-2xl font-semibold text-sage-800">{detail.stats.totalBookings}</p>
                <p className="text-xs text-sage-500">Total classes booked</p>
              </div>
              <div className="bg-sage-50 border border-sage-100 rounded-lg p-3">
                <p className="text-2xl font-semibold text-sage-800">{detail.stats.bookingsLast30Days}</p>
                <p className="text-xs text-sage-500">Booked in last 30 days</p>
              </div>
            </div>

            <div className="text-sm text-sage-500 mt-3 flex items-center gap-2">
              <label htmlFor="member-role">Role:</label>
              <select
                id="member-role"
                value={detail.member.role}
                onChange={(e) => void changeRole(e.target.value)}
                className="border border-sage-200 rounded-md px-2 py-0.5 text-sm"
              >
                <option value="customer">customer</option>
                <option value="instructor">instructor</option>
                <option value="admin">admin</option>
              </select>
            </div>

            {!detail.member.line_user_id && detail.member.role === "customer" && (
              <div className="mt-3 border border-amber-200 bg-amber-50 rounded-md p-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-amber-700 flex-1">Walk-in (no LINE login yet)</span>
                  <button onClick={() => setMergeOpen((o) => !o)} className="text-sage-700 underline">
                    {mergeOpen ? "Close" : "Merge into LINE account…"}
                  </button>
                </div>
                {mergeOpen && (
                  <div className="mt-2 space-y-1">
                    <input
                      placeholder="Search the person's LINE account by name or phone…"
                      value={mergeSearch}
                      onChange={(e) => setMergeSearch(e.target.value)}
                      className="w-full border border-sage-200 rounded-md px-2 py-1"
                    />
                    {mergeError && <p className="text-red-600">{mergeError}</p>}
                    <ul className="max-h-40 overflow-y-auto space-y-1">
                      {mergeResults.length === 0 && <li className="text-sage-400">No LINE accounts found.</li>}
                      {mergeResults.map((m) => (
                        <li key={m.id}>
                          <button
                            onClick={() => void mergeInto(m)}
                            className="w-full text-left bg-white border border-sage-200 rounded-md px-2 py-1 hover:border-sage-400"
                          >
                            {m.display_name} <span className="text-sage-400">· joined {formatDate(m.created_at)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="mt-3 flex gap-2 items-center flex-wrap">
              <button onClick={openGrantModal} className="text-sm bg-sage-500 text-white px-3 py-1.5 rounded-md">
                Grant package…
              </button>
              <button onClick={() => setAddClassOpen(true)} className="text-sm bg-sage-500 text-white px-3 py-1.5 rounded-md">
                Add to a class…
              </button>
              <button onClick={() => void issueBirthdayCoupon()} className="text-sm text-sage-600 underline">
                Issue birthday coupon
              </button>
            </div>

            {addClassOpen && (
              <AddClassModal
                member={detail.member}
                memberPackages={detail.memberPackages}
                onClose={() => setAddClassOpen(false)}
                onAdded={async () => {
                  setAddClassOpen(false);
                  await reloadDetail();
                }}
              />
            )}

            {grantModalOpen && (
              <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
                <div className="bg-white rounded-lg p-4 w-full max-w-sm space-y-3">
                  <h3 className="font-medium">Grant package to {detail.member.display_name}</h3>
                  <label className="block text-xs text-sage-500">
                    Package
                    <select
                      autoFocus
                      value={grantPackageId}
                      onChange={(e) => setGrantPackageId(e.target.value)}
                      className="block w-full border border-sage-200 rounded-md px-2 py-1 text-sm mt-0.5"
                    >
                      <option value="">Select a package…</option>
                      {packages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs text-sage-500">
                    Note (optional)
                    <input
                      placeholder="Note"
                      maxLength={100}
                      value={grantNote}
                      onChange={(e) => setGrantNote(e.target.value)}
                      className="block w-full border border-sage-200 rounded-md px-2 py-1 text-sm mt-0.5"
                    />
                  </label>
                  <label className="block text-xs text-sage-500">
                    Paid on
                    <input
                      type="date"
                      value={grantPaidAt}
                      onChange={(e) => setGrantPaidAt(e.target.value)}
                      className="block w-full border border-sage-200 rounded-md px-2 py-1 text-sm mt-0.5"
                    />
                  </label>
                  <label className="block text-xs text-sage-500">
                    Activation deadline (optional)
                    <input
                      type="date"
                      value={grantActivationDeadline}
                      onChange={(e) => setGrantActivationDeadline(e.target.value)}
                      className="block w-full border border-sage-200 rounded-md px-2 py-1 text-sm mt-0.5"
                    />
                    <span className="block mt-0.5 text-sage-400">
                      If set, validity starts at their first booking, or on this date if they haven't booked by then.
                    </span>
                  </label>
                  {grantError && <p className="text-red-600 text-sm">{grantError}</p>}
                  <div className="flex justify-end gap-3 pt-1">
                    <button onClick={() => setGrantModalOpen(false)} className="text-sm text-sage-600 underline">
                      Cancel
                    </button>
                    <button
                      onClick={() => void grant()}
                      disabled={!grantPackageId || granting}
                      className="text-sm bg-sage-500 text-white px-3 py-1.5 rounded-md disabled:bg-sage-200"
                    >
                      {granting ? "Granting…" : "Grant (mark paid)"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 mt-4">
              <h3 className="font-medium">Packages</h3>
              <label className="text-xs text-sage-500 flex items-center gap-1">
                <input type="checkbox" checked={showAllPackages} onChange={(e) => setShowAllPackages(e.target.checked)} />
                Show all (incl. old/cancelled)
              </label>
            </div>
            <div className="overflow-x-auto border border-sage-100 rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-sage-50 text-left text-sage-500">
                  <tr>
                    <th className="p-2 font-medium">Package</th>
                    <th className="p-2 font-medium">Status</th>
                    <th className="p-2 font-medium">Credits</th>
                    <th className="p-2 font-medium">Purchased</th>
                    <th className="p-2 font-medium">Expires</th>
                    <th className="p-2 font-medium">Note</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {detail.memberPackages
                    .filter((mp) => showAllPackages || mp.status === "active")
                    .map((mp) => (
                      <Fragment key={mp.id}>
                        <tr className="border-t border-sage-100 align-top">
                          <td className="p-2 font-medium">{mp.package_name}</td>
                          <td className="p-2">
                            {mp.status}
                            {mp.expiry_extension_flagged_at && <span className="text-amber-600"> ⚠ extension flagged</span>}
                          </td>
                          <td className="p-2">{mp.credits_total != null ? `${mp.credits_total - mp.credits_used}/${mp.credits_total}` : "unlimited"}</td>
                          <td className="p-2 text-sage-500">{formatDate(mp.purchased_at)}</td>
                          <td className="p-2 text-sage-500">
                            {mp.activation_deadline && !mp.activated_at && mp.status === "active" ? (
                              <span className="text-amber-700">not started · start by {formatDate(mp.activation_deadline)}</span>
                            ) : mp.expires_at ? (
                              formatDate(mp.expires_at)
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="p-2 italic text-sage-600">{mp.note || "—"}</td>
                          <td className="p-2 whitespace-nowrap space-x-3">
                            <button onClick={() => (editingPkgId === mp.id ? setEditingPkgId(null) : startEditPackage(mp))} className="text-sage-600 underline">
                              {editingPkgId === mp.id ? "Close" : "Edit"}
                            </button>
                            <button
                              onClick={async () => {
                                const v = window.prompt("Package note", mp.note ?? "");
                                if (v === null) return;
                                await adminApi.updatePackageNote(mp.id, v);
                                setDetail(await adminApi.getMember(detail.member.id));
                              }}
                              className="text-sage-600 underline"
                            >
                              Note
                            </button>
                            <button onClick={() => void removePackage(mp)} className="text-red-500 underline">
                              Remove
                            </button>
                          </td>
                        </tr>
                        {editingPkgId === mp.id && (
                          <tr className="border-t border-sage-100 bg-sage-50">
                            <td colSpan={7} className="p-2">
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void savePackage(mp);
                                }}
                                className="flex flex-wrap gap-2 items-end"
                              >
                                <label className="text-xs text-sage-500">
                                  Total classes
                                  <input type="number" min={0} placeholder="unlimited" value={pkgForm.total} onChange={(e) => setPkgForm({ ...pkgForm, total: e.target.value })} className="block w-24 border border-sage-200 rounded-md px-2 py-1 text-sm text-sage-800" />
                                </label>
                                <label className="text-xs text-sage-500">
                                  Classes used
                                  <input type="number" min={0} value={pkgForm.used} onChange={(e) => setPkgForm({ ...pkgForm, used: e.target.value })} className="block w-24 border border-sage-200 rounded-md px-2 py-1 text-sm text-sage-800" />
                                </label>
                                <label className="text-xs text-sage-500">
                                  Expires
                                  <input type="date" value={pkgForm.expires} onChange={(e) => setPkgForm({ ...pkgForm, expires: e.target.value })} className="block border border-sage-200 rounded-md px-2 py-1 text-sm text-sage-800" />
                                </label>
                                <label className="text-xs text-sage-500" title="Date by which the member must start using the package. Validity starts at their first booking, or on this date if unused.">
                                  Activation deadline
                                  <input type="date" value={pkgForm.activationDeadline} onChange={(e) => setPkgForm({ ...pkgForm, activationDeadline: e.target.value })} className="block border border-sage-200 rounded-md px-2 py-1 text-sm text-sage-800" />
                                </label>
                                <label className="text-xs text-sage-500">
                                  Status
                                  <select value={pkgForm.status} onChange={(e) => setPkgForm({ ...pkgForm, status: e.target.value })} className="block border border-sage-200 rounded-md px-2 py-1 text-sm text-sage-800">
                                    <option value="active">active</option>
                                    <option value="expired">expired</option>
                                    <option value="cancelled">cancelled</option>
                                  </select>
                                </label>
                                <button className="bg-sage-500 text-white px-3 py-1 rounded-md text-sm">Save</button>
                              </form>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  {detail.memberPackages.filter((mp) => showAllPackages || mp.status === "active").length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-2 text-sage-400">
                        No packages{showAllPackages ? "" : " — try “Show all”"}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {memberError && <p className="text-red-600 text-sm mt-1">{memberError}</p>}

            <h3 className="font-medium mt-4">Recent bookings</h3>
            <ul className="text-sm space-y-1">
              {detail.bookingHistory.slice(0, 10).map((b) => (
                <li key={b.id}>
                  {b.class_name} — {formatDate(b.start_time)} — {b.status}
                </li>
              ))}
            </ul>

            {detail.birthdayCoupons.length > 0 && (
              <>
                <h3 className="font-medium mt-4">Birthday coupons</h3>
                <ul className="text-sm space-y-1">
                  {detail.birthdayCoupons.map((c) => (
                    <li key={c.id}>
                      {c.status} — expires {formatDate(c.expires_at)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// -- Add a member to a class, including past ones (manual booking / backfill) -----

const ADD_CLASS_RANGES = ["upcoming", "past", "all"] as const;
type AddClassRange = (typeof ADD_CLASS_RANGES)[number];

function AddClassModal({
  member,
  memberPackages,
  onClose,
  onAdded,
}: {
  member: MemberRow;
  memberPackages: MemberPackageRow[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<AddClassRange>("upcoming");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [packageId, setPackageId] = useState("");
  const [status, setStatus] = useState<"confirmed" | "attended" | "no_show">("confirmed");
  const [statusTouched, setStatusTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .listSessions()
      .then((r) => setSessions(r.sessions))
      .catch((e) => setLoadError(String(e)));
  }, []);

  const activePackages = memberPackages.filter((mp) => mp.status === "active");
  const selected = sessions?.find((s) => s.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected || statusTouched) return;
    setStatus(new Date(selected.start_time).getTime() <= Date.now() ? "attended" : "confirmed");
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const todayKey = tzDateKey(new Date().toISOString());
  const q = search.trim().toLowerCase();
  const filtered = (sessions ?? [])
    .filter((s) => {
      if (s.status === "cancelled_by_studio") return false;
      const day = tzDateKey(s.start_time);
      if (dateFrom || dateTo) {
        if (dateFrom && day < dateFrom) return false;
        if (dateTo && day > dateTo) return false;
      } else if (range === "upcoming" && new Date(s.start_time).getTime() < Date.now()) return false;
      else if (range === "past" && new Date(s.start_time).getTime() >= Date.now()) return false;
      if (q && !`${s.class_name} ${s.instructor_name ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => {
      const d = new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      return range === "past" && !dateFrom && !dateTo ? -d : d;
    })
    .slice(0, 200);

  async function submit() {
    if (!selectedId) return;
    setSubmitting(true);
    setError(null);
    try {
      await adminApi.addMemberBooking(member.id, {
        classSessionId: selectedId,
        memberPackageId: packageId ? Number(packageId) : null,
        status,
      });
      onAdded();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-4 w-full max-w-2xl space-y-3 max-h-[90vh] overflow-y-auto">
        <h3 className="font-medium">Add {member.display_name} to a class</h3>
        <p className="text-xs text-sage-500 -mt-2">
          Includes classes that have already happened — useful for backfilling a booking made outside the app.
        </p>

        <div className="flex flex-wrap gap-2 items-center text-sm">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search class or instructor…"
            className="flex-1 min-w-[10rem] border border-sage-200 rounded-md px-2 py-1"
          />
          {ADD_CLASS_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => {
                setRange(r);
                setDateFrom("");
                setDateTo("");
              }}
              className={`px-2.5 py-1 rounded-full border ${
                !dateFrom && !dateTo && range === r ? "bg-sage-500 text-white border-sage-500" : "border-sage-200 text-sage-600"
              }`}
            >
              {r[0].toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center text-sm">
          <span className="text-sage-400">From</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border border-sage-200 rounded-md px-2 py-0.5" />
          <span className="text-sage-400">to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border border-sage-200 rounded-md px-2 py-0.5" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-sage-600 underline">
              Clear dates
            </button>
          )}
        </div>

        {loadError && <p className="text-red-600 text-sm">{loadError}</p>}
        <div className="border border-sage-100 rounded-md max-h-64 overflow-y-auto divide-y divide-sage-100">
          {sessions === null && <p className="p-3 text-sage-400 text-sm">Loading classes…</p>}
          {sessions !== null && filtered.length === 0 && <p className="p-3 text-sage-400 text-sm">No classes match these filters.</p>}
          {filtered.map((s) => {
            const started = new Date(s.start_time).getTime() <= Date.now();
            return (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedId(s.id);
                  setStatusTouched(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm flex justify-between items-center gap-2 ${
                  selectedId === s.id ? "bg-sage-50" : "hover:bg-sage-50/50"
                }`}
              >
                <span>
                  <span className="font-medium">{s.class_name}</span>
                  {s.instructor_name && <span className="text-sage-400"> · {s.instructor_name}</span>}
                  <span className="block text-xs text-sage-500">
                    {formatDateTime(s.start_time)}
                    {started && <span className="text-sage-400"> · past</span>}
                  </span>
                </span>
                <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full border ${CALENDAR_STATUS_STYLE[s.status] ?? "bg-white border-sage-200 text-sage-700"}`}>
                  {s.booked_count}/{s.capacity_override ?? s.class_capacity}
                </span>
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="border border-sage-200 rounded-md p-3 bg-sage-50 text-sm space-y-2">
            <p className="font-medium text-sage-800">
              {selected.class_name} — {formatDateTime(selected.start_time)}
            </p>
            <label className="block text-xs text-sage-500">
              Package to deduct a credit from
              <select
                value={packageId}
                onChange={(e) => setPackageId(e.target.value)}
                className="block w-full border border-sage-200 rounded-md px-2 py-1 text-sm mt-0.5"
              >
                <option value="">No package (comp / manual)</option>
                {activePackages.map((mp) => (
                  <option key={mp.id} value={mp.id}>
                    {mp.package_name}
                    {mp.credits_total != null ? ` (${mp.credits_total - mp.credits_used}/${mp.credits_total} left)` : " (unlimited)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-sage-500">
              Status
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as typeof status);
                  setStatusTouched(true);
                }}
                className="block w-full border border-sage-200 rounded-md px-2 py-1 text-sm mt-0.5"
              >
                <option value="confirmed">Confirmed (booked, hasn't happened yet)</option>
                <option value="attended">Attended</option>
                <option value="no_show">No-show</option>
              </select>
            </label>
          </div>
        )}

        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex justify-end gap-3 pt-1">
          <button onClick={onClose} className="text-sm text-sage-600 underline">
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={!selectedId || submitting}
            className="text-sm bg-sage-500 text-white px-3 py-1.5 rounded-md disabled:bg-sage-200"
          >
            {submitting ? "Adding…" : "Add to class"}
          </button>
        </div>
      </div>
    </div>
  );
}

// -- Package catalog ------------------------------------------------------------

const EMPTY_PACKAGE_FORM = {
  name: "",
  price: "",
  credits: "",
  validityValue: "",
  validityUnit: "month" as "day" | "month",
  maxBookingsPerDay: "",
  weekendOnly: false,
  classTypeIds: [] as number[],
  renewable: false,
  shared: false,
  oneTimePerPerson: false,
  sortOrder: "0",
};

function packageToForm(p: PackageCatalogRow): typeof EMPTY_PACKAGE_FORM {
  return {
    name: p.name,
    price: String(p.price_cents / 100),
    credits: p.credits == null ? "" : String(p.credits),
    validityValue: p.validity_value == null ? "" : String(p.validity_value),
    validityUnit: p.validity_unit ?? "month",
    maxBookingsPerDay: p.max_bookings_per_day == null ? "" : String(p.max_bookings_per_day),
    weekendOnly: !!p.eligible_days,
    classTypeIds: p.eligible_class_type_ids ? (JSON.parse(p.eligible_class_type_ids) as number[]) : [],
    renewable: !!p.renewable,
    shared: !!p.shared,
    oneTimePerPerson: !!p.one_time_per_person,
    sortOrder: String(p.sort_order ?? 0),
  };
}

function PackageCatalogTab() {
  const [items, setItems] = useState<PackageCatalogRow[]>([]);
  const [classTypes, setClassTypes] = useState<ClassTypeRow[]>([]);
  // null = form closed, "new" = adding, number = editing that package
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState(EMPTY_PACKAGE_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    adminApi.listPackageCatalog().then((r) => setItems(r.packages));
  }
  useEffect(load, []);
  useEffect(() => {
    adminApi.listClassTypes().then((r) => setClassTypes(r.classTypes));
  }, []);

  async function toggleActive(p: PackageCatalogRow) {
    await adminApi.updatePackage(p.id, { active: p.active ? 0 : 1 });
    load();
  }

  function open(target: PackageCatalogRow | "new") {
    setError(null);
    if (target === "new") {
      setForm(EMPTY_PACKAGE_FORM);
      setEditing("new");
    } else {
      setForm(packageToForm(target));
      setEditing(target.id);
    }
  }

  const optionalInt = (v: string) => (v.trim() === "" ? null : Math.round(Number(v)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const price = Number(form.price);
    if (!form.name.trim() || !Number.isFinite(price) || price < 0) {
      setError("Name and a valid price are required");
      return;
    }
    const body = {
      name: form.name.trim(),
      priceCents: Math.round(price * 100),
      credits: optionalInt(form.credits),
      validityValue: optionalInt(form.validityValue),
      validityUnit: form.validityUnit,
      maxBookingsPerDay: optionalInt(form.maxBookingsPerDay),
      eligibleDays: form.weekendOnly ? ["sat", "sun", "holiday"] : null,
      eligibleClassTypeIds: form.classTypeIds.length ? form.classTypeIds : null,
      renewable: form.renewable ? 1 : 0,
      shared: form.shared ? 1 : 0,
      oneTimePerPerson: form.oneTimePerPerson ? 1 : 0,
      sortOrder: optionalInt(form.sortOrder) ?? 0,
    };
    setSaving(true);
    try {
      if (editing === "new") await adminApi.createPackage(body);
      else if (editing != null) await adminApi.updatePackage(editing, body);
      setEditing(null);
      load();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  const input = "block border border-sage-200 rounded-md px-2 py-1 text-sm text-sage-800";

  return (
    <div>
      {editing === null ? (
        <button onClick={() => open("new")} className="mb-4 bg-sage-500 text-white px-3 py-1.5 rounded-md text-sm">
          Add package
        </button>
      ) : (
        <form onSubmit={(e) => void save(e)} className="mb-4 bg-white p-3 rounded-lg border border-sage-200 space-y-3">
          <h3 className="font-medium">{editing === "new" ? "New package" : "Edit package"}</h3>
          <div className="flex flex-wrap gap-3">
            <label className="text-xs text-sage-500">
              Name
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${input} w-56`} placeholder="e.g. 10 Classes" />
            </label>
            <label className="text-xs text-sage-500">
              Price (THB)
              <input required type="number" min={0} step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={`${input} w-28`} />
            </label>
            <label className="text-xs text-sage-500">
              Classes
              <input type="number" min={1} value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} className={`${input} w-24`} placeholder="unlimited" />
            </label>
            <label className="text-xs text-sage-500">
              Valid for
              <span className="flex gap-1">
                <input type="number" min={1} value={form.validityValue} onChange={(e) => setForm({ ...form, validityValue: e.target.value })} className={`${input} w-20`} placeholder="no limit" />
                <select value={form.validityUnit} onChange={(e) => setForm({ ...form, validityUnit: e.target.value as "day" | "month" })} className={input}>
                  <option value="month">months</option>
                  <option value="day">days</option>
                </select>
              </span>
            </label>
            <label className="text-xs text-sage-500">
              Max bookings / day
              <input type="number" min={1} value={form.maxBookingsPerDay} onChange={(e) => setForm({ ...form, maxBookingsPerDay: e.target.value })} className={`${input} w-24`} placeholder="no limit" />
            </label>
            <label className="text-xs text-sage-500">
              Sort order
              <input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} className={`${input} w-20`} />
            </label>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={form.weekendOnly} onChange={(e) => setForm({ ...form, weekendOnly: e.target.checked })} />
              Weekends &amp; holidays only
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={form.renewable} onChange={(e) => setForm({ ...form, renewable: e.target.checked })} />
              Renewable
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={form.shared} onChange={(e) => setForm({ ...form, shared: e.target.checked })} />
              Shared (multiple members)
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={form.oneTimePerPerson} onChange={(e) => setForm({ ...form, oneTimePerPerson: e.target.checked })} />
              One per person (e.g. trial)
            </label>
          </div>
          {classTypes.length > 0 && (
            <fieldset className="text-sm">
              <legend className="text-xs text-sage-500 mb-1">Valid for class types (none ticked = all)</legend>
              <div className="flex flex-wrap gap-3">
                {classTypes.map((ct) => (
                  <label key={ct.id} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={form.classTypeIds.includes(ct.id)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          classTypeIds: e.target.checked ? [...form.classTypeIds, ct.id] : form.classTypeIds.filter((id) => id !== ct.id),
                        })
                      }
                    />
                    {ct.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button disabled={saving} className="bg-sage-500 disabled:bg-sage-200 text-white px-3 py-1.5 rounded-md text-sm">
              {saving ? "Saving…" : editing === "new" ? "Create package" : "Save changes"}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="text-sm text-sage-600 underline">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm bg-white rounded-lg overflow-hidden border border-sage-200">
          <thead className="bg-sage-100 text-left">
            <tr>
              <th className="p-2">Name</th>
              <th className="p-2">Price</th>
              <th className="p-2">Credits</th>
              <th className="p-2">Validity</th>
              <th className="p-2">Renewable</th>
              <th className="p-2">Shared</th>
              <th className="p-2">Active</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-t border-sage-100">
                <td className="p-2">{p.name}</td>
                <td className="p-2">
                  {(p.price_cents / 100).toFixed(2)} {p.currency}
                </td>
                <td className="p-2">{p.credits ?? "Unlimited"}</td>
                <td className="p-2">{p.validity_value ? `${p.validity_value} ${p.validity_unit}` : "—"}</td>
                <td className="p-2">{p.renewable ? "Yes" : "No"}</td>
                <td className="p-2">{p.shared ? "Yes" : "No"}</td>
                <td className="p-2">{p.active ? "Yes" : "No"}</td>
                <td className="p-2 whitespace-nowrap space-x-3">
                  <button onClick={() => open(p)} className="text-sage-600 hover:underline">
                    Edit
                  </button>
                  <button onClick={() => void toggleActive(p)} className="text-sage-600 hover:underline">
                    {p.active ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// -- Pending manual PromptPay payments (no live bank integration yet) --------------

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function PendingPaymentsTab() {
  const [items, setItems] = useState<PendingPaymentRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [paidAtByKey, setPaidAtByKey] = useState<Record<string, string>>({});
  const [deadlineByKey, setDeadlineByKey] = useState<Record<string, string>>({});

  function load() {
    adminApi.pendingPayments().then((r) => setItems(r.pending));
  }
  useEffect(load, []);

  function paidAtFor(key: string) {
    return paidAtByKey[key] ?? todayDate();
  }

  async function confirm(row: PendingPaymentRow) {
    const key = `${row.kind}-${row.id}`;
    setBusyId(key);
    try {
      await adminApi.markPackagePaid(row.id, paidAtFor(key), deadlineByKey[key] || undefined);
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <p className="text-sm text-sage-500 mb-3">
        Members tap "I've paid" after scanning the PromptPay QR — check your banking app for the transfer, then
        confirm here to activate their package. No live bank integration yet, so this step is manual.
      </p>
      {items.length === 0 && <p className="text-sage-400">Nothing waiting on confirmation.</p>}
      <ul className="space-y-2">
        {items.map((row) => {
          const key = `${row.kind}-${row.id}`;
          return (
            <li key={key} className="bg-white border border-sage-200 rounded-lg p-3 flex justify-between items-center">
              <div>
                <p className="font-medium">
                  {row.user_name} — {row.description}
                </p>
                <p className="text-sm text-sage-500">
                  {(row.amount_cents / 100).toFixed(0)} {row.currency} · {formatDateTime(row.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-sage-500 flex items-center gap-1">
                  Paid on
                  <input
                    type="date"
                    value={paidAtFor(key)}
                    onChange={(e) => setPaidAtByKey({ ...paidAtByKey, [key]: e.target.value })}
                    className="border border-sage-200 rounded-md px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-xs text-sage-500 flex items-center gap-1" title="Optional: date by which the member must start using the package">
                  Activate by
                  <input
                    type="date"
                    value={deadlineByKey[key] ?? ""}
                    onChange={(e) => setDeadlineByKey({ ...deadlineByKey, [key]: e.target.value })}
                    className="border border-sage-200 rounded-md px-2 py-1 text-sm"
                  />
                </label>
                <button
                  onClick={() => void confirm(row)}
                  disabled={busyId === key}
                  className="text-sm bg-sage-500 text-white px-3 py-1.5 rounded-md disabled:bg-sage-200"
                >
                  {busyId === key ? "Confirming…" : "Mark as Paid"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// -- Expiry-extension flags (section 13) --------------------------------------

function ExpiryFlagsTab() {
  const [items, setItems] = useState<MemberPackageRow[]>([]);
  const [extendTarget, setExtendTarget] = useState<MemberPackageRow | null>(null);

  function load() {
    adminApi.expiryExtensionFlags().then((r) => setItems(r.flagged));
  }
  useEffect(load, []);

  async function extend(mp: MemberPackageRow, newExpiresAt: string) {
    await adminApi.extendExpiry(mp.id, new Date(newExpiresAt).toISOString(), "2+ studio-cancelled classes");
    load();
  }

  return (
    <div>
      <p className="text-sm text-sage-500 mb-3">
        Packages flagged after 2 studio-cancelled classes — review and manually extend expiry.
      </p>
      {items.length === 0 && <p className="text-sage-400">Nothing flagged right now.</p>}
      <ul className="space-y-2">
        {items.map((mp) => (
          <li key={mp.id} className="bg-white border border-amber-200 rounded-lg p-3 flex justify-between items-center">
            <span>
              {mp.user_name} — {mp.package_name} ({mp.studio_cancelled_class_count} studio cancellations)
            </span>
            <button onClick={() => setExtendTarget(mp)} className="text-sm bg-sage-500 text-white px-2 py-1 rounded-md">
              Extend expiry
            </button>
          </li>
        ))}
      </ul>
      {extendTarget && (
        <PromptModal
          title={`New expiry date for ${extendTarget.user_name}`}
          type="date"
          required
          submitLabel="Extend"
          onClose={() => setExtendTarget(null)}
          onSubmit={(value) => {
            const mp = extendTarget;
            setExtendTarget(null);
            void extend(mp, value);
          }}
        />
      )}
    </div>
  );
}

// -- Holidays (section 8) ------------------------------------------------------

function HolidaysTab() {
  const [items, setItems] = useState<HolidayRow[]>([]);
  const [form, setForm] = useState({ date: "", name: "", type: "public" as "public" | "special" });

  function load() {
    adminApi.listHolidays().then((r) => setItems(r.holidays));
  }
  useEffect(load, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await adminApi.createHoliday(form);
    setForm({ date: "", name: "", type: "public" });
    load();
  }

  async function remove(id: number) {
    await adminApi.deleteHoliday(id);
    load();
  }

  return (
    <div>
      <form onSubmit={(e) => void submit(e)} className="flex flex-wrap gap-2 mb-4 bg-white p-3 rounded-lg border border-sage-200">
        <input
          required
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          className="border border-sage-200 rounded-md px-2 py-1"
        />
        <input
          required
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="border border-sage-200 rounded-md px-2 py-1"
        />
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value as "public" | "special" })}
          className="border border-sage-200 rounded-md px-2 py-1"
        >
          <option value="public">Public holiday</option>
          <option value="special">Special holiday</option>
        </select>
        <button className="bg-sage-500 text-white px-3 py-1 rounded-md">Add holiday</button>
      </form>
      <ul className="space-y-1">
        {items.map((h) => (
          <li key={h.id} className="bg-white border border-sage-200 rounded-md p-2 flex justify-between">
            <span>
              {formatDateOnly(h.date)} — {h.name} ({h.type})
            </span>
            <button onClick={() => void remove(h.id)} className="text-red-500 hover:underline">
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// -- Settings (section 1) -------------------------------------------------------

function SettingsTab() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  function load() {
    adminApi.listSettings().then((r) => setSettings(r.settings));
  }
  useEffect(load, []);

  async function save() {
    await adminApi.updateSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="bg-white border border-sage-200 rounded-lg p-4 max-w-lg">
      <p className="text-sm text-sage-500 mb-3">Business-rule settings — changes take effect immediately.</p>
      <div className="space-y-2">
        {Object.entries(settings).map(([key, value]) => (
          <div key={key} className="flex justify-between items-center gap-2">
            <label className="text-sm">{key.replace(/_/g, " ")}</label>
            <input
              value={value}
              onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
              className="w-32 border border-sage-200 rounded-md px-2 py-1 text-sm"
            />
          </div>
        ))}
      </div>
      <button onClick={() => void save()} className="mt-4 bg-sage-500 text-white px-3 py-1.5 rounded-md text-sm">
        {saved ? "Saved!" : "Save settings"}
      </button>
    </div>
  );
}

// -- Read-only rollups ---------------------------------------------------------

function BookingsTab() {
  const [items, setItems] = useState<AdminBookingRow[]>([]);
  useEffect(() => {
    adminApi.listBookings().then((r) => setItems(r.bookings));
  }, []);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm bg-white rounded-lg overflow-hidden border border-sage-200">
        <thead className="bg-sage-100 text-left">
          <tr>
            <th className="p-2">Customer</th>
            <th className="p-2">Class</th>
            <th className="p-2">Start</th>
            <th className="p-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((b) => (
            <tr key={b.id} className="border-t border-sage-100">
              <td className="p-2">{b.user_name}</td>
              <td className="p-2">{b.class_name}</td>
              <td className="p-2">{formatDateTime(b.start_time)}</td>
              <td className="p-2">{b.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentsTab() {
  const [items, setItems] = useState<AdminPaymentRow[]>([]);
  useEffect(() => {
    adminApi.listPayments().then((r) => setItems(r.payments));
  }, []);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm bg-white rounded-lg overflow-hidden border border-sage-200">
        <thead className="bg-sage-100 text-left">
          <tr>
            <th className="p-2">Customer</th>
            <th className="p-2">For</th>
            <th className="p-2">Amount</th>
            <th className="p-2">Status</th>
            <th className="p-2">Paid on</th>
            <th className="p-2">Recorded</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id} className="border-t border-sage-100">
              <td className="p-2">{p.user_name ?? "—"}</td>
              <td className="p-2">{p.package_name ?? "Package extension"}</td>
              <td className="p-2">
                {(p.amount_cents / 100).toFixed(2)} {p.currency}
              </td>
              <td className="p-2">{p.status}</td>
              <td className="p-2">{p.paid_at ? formatDateOnly(p.paid_at) : formatDate(p.created_at)}</td>
              <td className="p-2">{formatDateTime(p.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
