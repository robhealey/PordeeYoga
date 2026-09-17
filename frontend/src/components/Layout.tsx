import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { api } from "../lib/api";
import { isInLiff } from "../lib/liff";

const tabs = [
  { to: "/", label: "Schedule", end: true },
  { to: "/my-bookings", label: "My Bookings", end: false },
  { to: "/packages", label: "Packages", end: false },
];

export function Layout() {
  const { user, loading, loginWithLine, logout, refresh } = useAuth();
  const inLiff = isInLiff();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-sage-200 bg-white">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-4 py-3">
          <Link to="/">
            <img src="/PordeeLogo2022onWhite.jpg" alt="Pordee Yoga" className="h-9 w-9 rounded-full object-cover" />
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {!loading && !inLiff && user && (
              <button onClick={() => void logout()} className="text-sage-600 hover:underline">
                Log out
              </button>
            )}
            {!loading && !user && (
              <button
                onClick={() => void loginWithLine()}
                className="bg-sage-500 text-white px-3 py-1.5 rounded-md hover:bg-sage-600"
              >
                Log in with LINE
              </button>
            )}
            {import.meta.env.DEV && !user && !loading && (
              <button
                onClick={() => void api.devMockLogin("Dev Admin", "admin").then(refresh)}
                className="text-xs text-sage-400 hover:underline"
                title="Local dev only: skip LINE and log in as an admin"
              >
                (dev: log in as admin)
              </button>
            )}
          </div>
        </div>
        <nav className="max-w-4xl mx-auto flex">
          {(user?.role === "admin" ? [...tabs, { to: "/admin", label: "Admin", end: false }] : tabs).map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex-1 text-center py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-sage-500 text-sage-700"
                    : "border-transparent text-sage-400 hover:text-sage-600 hover:border-sage-200"
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
      <footer className="text-center text-xs text-sage-400 py-6">
        &copy; {new Date().getFullYear()} Pordee Yoga ·{" "}
        <Link to="/privacy" className="hover:underline">
          Privacy Policy
        </Link>
      </footer>
    </div>
  );
}
