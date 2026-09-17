import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type ClassSession, type MemberPackage } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

function remaining(mp: MemberPackage): string {
  if (mp.credits_total == null) return "Unlimited";
  return `${mp.credits_total - mp.credits_used} left`;
}

export function ClassDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loginWithLine } = useAuth();
  const [session, setSession] = useState<ClassSession | null>(null);
  const [packages, setPackages] = useState<MemberPackage[] | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waitlisted, setWaitlisted] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .getClass(Number(id))
      .then((r) => setSession(r.session))
      .catch((e) => setError(String(e)));
  }, [id]);

  useEffect(() => {
    if (!user) return;
    api.usablePackages().then((r) => {
      setPackages(r.memberPackages);
      if (r.memberPackages.length > 0) setSelectedPackageId(r.memberPackages[0].id);
    });
  }, [user]);

  async function handleBook() {
    if (!session) return;
    if (!user) {
      await loginWithLine();
      return;
    }
    if (!selectedPackageId) return;
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
  if (!session) return <p className="text-sage-500">Loading…</p>;

  const isFull = session.spots_left <= 0;
  const isCancelled = session.status === "cancelled_by_studio";

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold">{session.class_name}</h1>
      <p className="text-sage-500 mt-1">
        {new Date(session.start_time).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })}
      </p>
      {session.instructor_name && <p className="text-sage-500">with {session.instructor_name}</p>}
      <p className="mt-2 text-sage-700">{session.duration_minutes} minutes</p>
      <p className="mt-1 text-sm text-sage-400">
        {isCancelled
          ? `Cancelled by the studio${session.cancellation_reason ? `: ${session.cancellation_reason}` : ""}`
          : isFull
            ? "This class is full"
            : `${session.spots_left} spots left`}
      </p>

      {error && <p className="mt-3 text-red-600 text-sm">{error}</p>}

      {!isCancelled && user && packages && packages.length === 0 && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-md p-3 text-sm">
          You don't have a package with credits available.{" "}
          <Link to="/packages" className="underline text-sage-700">
            Buy a package
          </Link>{" "}
          to book this class.
        </div>
      )}

      {!isCancelled && user && packages && packages.length > 0 && (
        <div className="mt-4">
          <label className="text-sm text-sage-600">Use package</label>
          <select
            value={selectedPackageId ?? ""}
            onChange={(e) => setSelectedPackageId(Number(e.target.value))}
            className="mt-1 w-full border border-sage-200 rounded-md px-3 py-2"
          >
            {packages.map((mp) => (
              <option key={mp.id} value={mp.id}>
                {mp.package_name} — {remaining(mp)}
                {mp.expires_at ? ` — exp. ${new Date(mp.expires_at).toLocaleDateString()}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {!isCancelled && !isFull && (
        <button
          onClick={() => void handleBook()}
          disabled={busy || (!!user && (!packages || packages.length === 0))}
          className="mt-4 bg-sage-500 disabled:bg-sage-200 text-white px-4 py-2 rounded-md hover:bg-sage-600"
        >
          {busy ? "Booking…" : user ? "Book this class" : "Log in with LINE to book"}
        </button>
      )}

      {!isCancelled && isFull && (
        <button
          onClick={() => void handleJoinWaitlist()}
          disabled={busy || waitlisted}
          className="mt-4 bg-sage-500 disabled:bg-sage-200 text-white px-4 py-2 rounded-md hover:bg-sage-600"
        >
          {waitlisted ? "You're on the waitlist" : busy ? "Joining…" : user ? "Join the waitlist" : "Log in with LINE to join the waitlist"}
        </button>
      )}
    </div>
  );
}
