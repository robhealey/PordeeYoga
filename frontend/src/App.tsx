import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AuthProvider } from "./lib/AuthContext";
import { Schedule } from "./pages/Schedule";
import { ClassDetail } from "./pages/ClassDetail";
import { MyBookings } from "./pages/MyBookings";
import { Packages } from "./pages/Packages";
import { Checkout } from "./pages/Checkout";
import { LoginCallback } from "./pages/LoginCallback";
import { Admin } from "./pages/Admin";
import { RequireAdmin } from "./components/RequireAdmin";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Schedule />} />
            <Route path="/class/:id" element={<ClassDetail />} />
            <Route path="/my-bookings" element={<MyBookings />} />
            <Route path="/packages" element={<Packages />} />
            <Route path="/checkout/:kind/:id" element={<Checkout />} />
            <Route path="/login/callback" element={<LoginCallback />} />
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <Admin />
                </RequireAdmin>
              }
            />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
