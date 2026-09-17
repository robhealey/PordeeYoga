import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { api } from "../lib/api";

export function Layout() {
  const { user, loading, loginWithLine, logout, refresh } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-sage-200 bg-white">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <img src="/PordeeLogo2022onWhite.jpg" alt="Pordee Yoga" className="h-9 w-9 rounded-full object-cover" />
            <span className="font-semibold text-lg">Pordee Yoga</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/" className="hover:text-sage-600">
              Schedule
            </Link>
            <Link to="/packages" className="hover:text-sage-600">
              Packages
            </Link>
            {user && (
              <Link to="/my-bookings" className="hover:text-sage-600">
                My Bookings
              </Link>
            )}
            {user?.role === "admin" && (
              <Link to="/admin" className="hover:text-sage-600">
                Admin
              </Link>
            )}
            {!loading &&
              (user ? (
                <button onClick={() => void logout()} className="text-sage-600 hover:underline">
                  Log out
                </button>
              ) : (
                <button
                  onClick={() => void loginWithLine()}
                  className="bg-sage-500 text-white px-3 py-1.5 rounded-md hover:bg-sage-600"
                >
                  Log in with LINE
                </button>
              ))}
            {import.meta.env.DEV && !user && !loading && (
              <button
                onClick={() => void api.devMockLogin("Dev Admin", "admin").then(refresh)}
                className="text-xs text-sage-400 hover:underline"
                title="Local dev only: skip LINE and log in as an admin"
              >
                (dev: log in as admin)
              </button>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
      <footer className="text-center text-xs text-sage-400 py-6">
        &copy; {new Date().getFullYear()} Pordee Yoga
      </footer>
    </div>
  );
}
