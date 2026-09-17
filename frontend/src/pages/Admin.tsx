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
  type PendingPaymentRow,
  type SessionBookingRow,
  type SessionRow,
  type WaitlistRow,
} from "../lib/adminApi";

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
      <form onSubmit={(e) => void submit(e)} className="flex flex-wrap gap-2 mb-4 bg-white p-3 rounded-lg border border-sage-200">
        <input
          required
          placeholder="Name (e.g. Vinyasa Flow)"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="border border-sage-200 rounded-md px-2 py-1"
        />
        <input
          type="number"
          placeholder="Minutes"
          value={form.durationMinutes}
          onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
          className="w-24 border border-sage-200 rounded-md px-2 py-1"
        />
        <input
          type="number"
          placeholder="Capacity"
          value={form.capacity}
          onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
          className="w-24 border border-sage-200 rounded-md px-2 py-1"
        />
        <input
          type="number"
          placeholder="Min to confirm"
          value={form.minConfirmCount}
          onChange={(e) => setForm({ ...form, minConfirmCount: Number(e.target.value) })}
          className="w-28 border border-sage-200 rounded-md px-2 py-1"
        />
        <input
          type="number"
          placeholder="Reference price (satang)"
          value={form.priceCents}
          onChange={(e) => setForm({ ...form, priceCents: Number(e.target.value) })}
          className="w-40 border border-sage-200 rounded-md px-2 py-1"
        />
        <button className="bg-sage-500 text-white px-3 py-1 rounded-md">Add class type</button>
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

  function load() {
    adminApi.listInstructors().then((r) => setItems(r.instructors));
  }
  useEffect(load, []);

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
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i.id} className="bg-white border border-sage-200 rounded-md p-2">
            {i.name}
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
      {error && <p className="text-red-600 mb-2">{error}</p>}
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
            {items.map((s) => (
              <Fragment key={s.id}>
                <tr className="border-t border-sage-100 cursor-pointer" onClick={() => void toggleExpand(s.id)}>
                  <td className="p-2">{s.class_name}</td>
                  <td className="p-2">{s.instructor_name ?? "—"}</td>
                  <td className="p-2">{new Date(s.start_time).toLocaleString()}</td>
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
  const [grantPackageId, setGrantPackageId] = useState("");

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
    setDetail(await adminApi.getMember(id));
  }

  async function grant() {
    if (!detail || !grantPackageId) return;
    await adminApi.grantPackage(detail.member.id, Number(grantPackageId));
    setDetail(await adminApi.getMember(detail.member.id));
  }

  async function issueBirthdayCoupon() {
    if (!detail) return;
    await adminApi.issueBirthdayCoupon(detail.member.id);
    setDetail(await adminApi.getMember(detail.member.id));
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
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
        <ul className="space-y-1 max-h-[28rem] overflow-y-auto">
          {items.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => void openDetail(m.id)}
                className="w-full text-left bg-white border border-sage-200 rounded-md p-2 hover:border-sage-400"
              >
                <span className="font-medium">{m.display_name}</span>{" "}
                <span className="text-sage-400 text-sm">{m.phone ?? "no phone"}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        {!detail && <p className="text-sage-400">Select a member to view details.</p>}
        {detail && (
          <div className="bg-white border border-sage-200 rounded-lg p-4">
            <h2 className="font-medium text-lg">{detail.member.display_name}</h2>
            <p className="text-sm text-sage-500">{detail.member.phone ?? "No phone on file"}</p>
            <p className="text-sm text-sage-500">Role: {detail.member.role}</p>

            <div className="mt-3 flex gap-2 items-center">
              <select
                value={grantPackageId}
                onChange={(e) => setGrantPackageId(e.target.value)}
                className="border border-sage-200 rounded-md px-2 py-1 text-sm"
              >
                <option value="">Grant package…</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button onClick={() => void grant()} className="text-sm bg-sage-500 text-white px-2 py-1 rounded-md">
                Grant (mark paid)
              </button>
              <button onClick={() => void issueBirthdayCoupon()} className="text-sm text-sage-600 underline">
                Issue birthday coupon
              </button>
            </div>

            <h3 className="font-medium mt-4">Packages</h3>
            <ul className="text-sm space-y-1">
              {detail.memberPackages.map((mp) => (
                <li key={mp.id}>
                  {mp.package_name} — {mp.status}
                  {mp.credits_total != null && ` (${mp.credits_total - mp.credits_used}/${mp.credits_total})`}
                  {mp.expiry_extension_flagged_at && <span className="text-amber-600"> ⚠ extension flagged</span>}
                </li>
              ))}
            </ul>

            <h3 className="font-medium mt-4">Recent bookings</h3>
            <ul className="text-sm space-y-1">
              {detail.bookingHistory.slice(0, 10).map((b) => (
                <li key={b.id}>
                  {b.class_name} — {new Date(b.start_time).toLocaleDateString()} — {b.status}
                </li>
              ))}
            </ul>

            {detail.birthdayCoupons.length > 0 && (
              <>
                <h3 className="font-medium mt-4">Birthday coupons</h3>
                <ul className="text-sm space-y-1">
                  {detail.birthdayCoupons.map((c) => (
                    <li key={c.id}>
                      {c.status} — expires {new Date(c.expires_at).toLocaleDateString()}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// -- Package catalog ------------------------------------------------------------

function PackageCatalogTab() {
  const [items, setItems] = useState<PackageCatalogRow[]>([]);

  function load() {
    adminApi.listPackageCatalog().then((r) => setItems(r.packages));
  }
  useEffect(load, []);

  async function toggleActive(p: PackageCatalogRow) {
    await adminApi.updatePackage(p.id, { active: p.active ? 0 : 1 });
    load();
  }

  return (
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
              <td className="p-2">
                <button onClick={() => void toggleActive(p)} className="text-sage-600 hover:underline">
                  {p.active ? "Deactivate" : "Activate"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// -- Pending manual PromptPay payments (no live bank integration yet) --------------

function PendingPaymentsTab() {
  const [items, setItems] = useState<PendingPaymentRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    adminApi.pendingPayments().then((r) => setItems(r.pending));
  }
  useEffect(load, []);

  async function confirm(row: PendingPaymentRow) {
    const key = `${row.kind}-${row.id}`;
    setBusyId(key);
    try {
      if (row.kind === "package") await adminApi.markPackagePaid(row.id);
      else await adminApi.markRenewalPaid(row.id);
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
                  {(row.amount_cents / 100).toFixed(0)} {row.currency} · {new Date(row.created_at).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => void confirm(row)}
                disabled={busyId === key}
                className="text-sm bg-sage-500 text-white px-3 py-1.5 rounded-md disabled:bg-sage-200"
              >
                {busyId === key ? "Confirming…" : "Mark as Paid"}
              </button>
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
              {h.date} — {h.name} ({h.type})
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
              <td className="p-2">{new Date(b.start_time).toLocaleString()}</td>
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
            <th className="p-2">When</th>
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
              <td className="p-2">{new Date(p.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
