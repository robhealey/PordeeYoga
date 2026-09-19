async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? res.statusText);
  return body as T;
}

export interface ClassTypeRow {
  id: number;
  name: string;
  description: string | null;
  duration_minutes: number;
  capacity: number;
  price_cents: number;
  currency: string;
  active: number;
  min_confirm_count: number;
  min_confirm_value_cents: number | null;
}

export interface InstructorRow {
  id: number;
  name: string;
  bio: string | null;
}

export interface SessionRow {
  id: number;
  class_type_id: number;
  instructor_id: number | null;
  start_time: string;
  end_time: string;
  min_capacity_override: number | null;
  capacity_override: number | null;
  status: string;
  opened_manually: number;
  cancellation_reason: string | null;
  class_name: string;
  class_capacity: number;
  instructor_name: string | null;
  booked_count: number;
}

export interface AdminBookingRow {
  id: number;
  status: string;
  created_at: string;
  user_name: string;
  class_name: string;
  start_time: string;
}

export interface SessionBookingRow {
  id: number;
  status: string;
  user_name: string;
  phone: string | null;
  package_name: string | null;
  credit_refunded: number;
}

export interface AdminPaymentRow {
  id: number;
  status: string;
  amount_cents: number;
  currency: string;
  created_at: string;
  user_name: string | null;
  package_name: string | null;
}

export interface MemberRow {
  id: number;
  line_user_id: string | null;
  display_name: string;
  phone: string | null;
  date_of_birth: string | null;
  role: string;
  created_at: string;
}

export interface MemberDetail {
  member: MemberRow;
  memberPackages: MemberPackageRow[];
  bookingHistory: { id: number; status: string; created_at: string; class_name: string; start_time: string }[];
  birthdayCoupons: { id: number; status: string; issued_at: string; expires_at: string }[];
  renewalHistory: unknown[];
}

export interface PackageCatalogRow {
  id: number;
  name: string;
  price_cents: number;
  currency: string;
  credits: number | null;
  validity_value: number | null;
  validity_unit: "day" | "month" | null;
  eligible_class_type_ids: string | null;
  eligible_days: string | null;
  max_bookings_per_day: number | null;
  renewable: number;
  shared: number;
  one_time_per_person: number;
  active: number;
  sort_order: number;
}

export interface MemberPackageRow {
  id: number;
  user_id: number;
  package_id: number;
  package_name: string;
  user_name?: string;
  credits_total: number | null;
  credits_used: number;
  status: string;
  expires_at: string | null;
  studio_cancelled_class_count: number;
  expiry_extension_flagged_at: string | null;
}

export interface PendingPaymentRow {
  kind: "package" | "renewal";
  id: number;
  user_name: string;
  description: string;
  amount_cents: number;
  currency: string;
  created_at: string;
}

export interface HolidayRow {
  id: number;
  date: string;
  name: string;
  type: "public" | "special";
}

export interface ParsedScheduleSession {
  className: string;
  instructorName: string | null;
  dayOfWeek: string | null;
  date: string | null;
  time: string | null;
  durationMinutes: number | null;
}

export interface WaitlistRow {
  id: number;
  class_session_id: number;
  user_id: number;
  status: string;
  notified_at: string | null;
  notify_expires_at: string | null;
  created_at: string;
}

export const adminApi = {
  listClassTypes: () => request<{ classTypes: ClassTypeRow[] }>("/class-types"),
  createClassType: (body: {
    name: string;
    description?: string;
    durationMinutes: number;
    capacity: number;
    priceCents: number;
    currency?: string;
    minConfirmCount?: number;
    minConfirmValueCents?: number | null;
  }) => request<{ classType: ClassTypeRow }>("/class-types", { method: "POST", body: JSON.stringify(body) }),
  updateClassType: (id: number, body: Record<string, unknown>) =>
    request<{ classType: ClassTypeRow }>(`/class-types/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  listInstructors: () => request<{ instructors: InstructorRow[] }>("/instructors"),
  createInstructor: (body: { name: string; bio?: string }) =>
    request<{ instructor: InstructorRow }>("/instructors", { method: "POST", body: JSON.stringify(body) }),

  listSessions: () => request<{ sessions: SessionRow[] }>("/class-sessions"),
  createSession: (body: {
    classTypeId: number;
    instructorId?: number | null;
    startTime: string;
    endTime: string;
    capacityOverride?: number | null;
    minCapacityOverride?: number | null;
  }) => request<{ session: SessionRow }>("/class-sessions", { method: "POST", body: JSON.stringify(body) }),
  cancelSession: (id: number, reason?: string) =>
    request<{ refundedCount: number }>(`/class-sessions/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  openSessionManually: (id: number) =>
    request<{ session: SessionRow }>(`/class-sessions/${id}/open-manually`, { method: "POST" }),
  sessionBookings: (id: number) => request<{ bookings: SessionBookingRow[] }>(`/class-sessions/${id}/bookings`),
  sessionWaitlist: (id: number) => request<{ entries: WaitlistRow[] }>(`/class-sessions/${id}/waitlist`),
  parseScheduleImage: (imageBase64: string) =>
    request<{ instructors: string[]; sessions: ParsedScheduleSession[] }>("/schedule-import/parse", {
      method: "POST",
      body: JSON.stringify({ imageBase64 }),
    }),

  markNoShow: (bookingId: number) => request<{ creditRefunded: boolean }>(`/bookings/${bookingId}/no-show`, { method: "POST" }),
  markAttended: (bookingId: number) => request<{ ok: true }>(`/bookings/${bookingId}/attended`, { method: "POST" }),
  cancelBooking: (bookingId: number) =>
    request<{ status: string; creditRefunded: boolean }>(`/bookings/${bookingId}/cancel`, { method: "POST" }),

  listBookings: () => request<{ bookings: AdminBookingRow[] }>("/bookings"),
  listPayments: () => request<{ payments: AdminPaymentRow[] }>("/payments"),

  listMembers: (search?: string) =>
    request<{ members: MemberRow[] }>(`/members${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  getMember: (id: number) => request<MemberDetail>(`/members/${id}`),
  createMember: (body: { displayName: string; phone?: string; dateOfBirth?: string; notes?: string }) =>
    request<{ member: MemberRow }>("/members", { method: "POST", body: JSON.stringify(body) }),
  updateMember: (id: number, body: Record<string, unknown>) =>
    request<{ member: MemberRow }>(`/members/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  issueBirthdayCoupon: (id: number) => request<{ coupon: unknown }>(`/members/${id}/birthday-coupon`, { method: "POST" }),

  listPackageCatalog: () => request<{ packages: PackageCatalogRow[] }>("/packages"),
  createPackage: (body: Record<string, unknown>) =>
    request<{ package: PackageCatalogRow }>("/packages", { method: "POST", body: JSON.stringify(body) }),
  updatePackage: (id: number, body: Record<string, unknown>) =>
    request<{ package: PackageCatalogRow }>(`/packages/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  listMemberPackages: (params?: { userId?: number; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.userId) q.set("userId", String(params.userId));
    if (params?.status) q.set("status", params.status);
    const qs = q.toString();
    return request<{ memberPackages: MemberPackageRow[] }>(`/member-packages${qs ? `?${qs}` : ""}`);
  },
  grantPackage: (userId: number, packageId: number, markPaid = true) =>
    request<{ memberPackage: MemberPackageRow }>("/member-packages", {
      method: "POST",
      body: JSON.stringify({ userId, packageId, markPaid }),
    }),
  expiryExtensionFlags: () => request<{ flagged: MemberPackageRow[] }>("/member-packages/expiry-extension-flags"),
  extendExpiry: (id: number, newExpiresAt: string, reason?: string) =>
    request<{ memberPackage: MemberPackageRow }>(`/member-packages/${id}/extend-expiry`, {
      method: "POST",
      body: JSON.stringify({ newExpiresAt, reason }),
    }),
  adminExtendRenewal: (id: number) =>
    request<{ renewalId: number; newExpiresAt: string }>(`/member-packages/${id}/renewals/extend`, { method: "POST" }),

  pendingPayments: () => request<{ pending: PendingPaymentRow[] }>("/pending-payments"),
  markPackagePaid: (id: number) =>
    request<{ memberPackage: MemberPackageRow }>(`/member-packages/${id}/mark-paid`, { method: "POST" }),
  markRenewalPaid: (id: number) => request<{ ok: true }>(`/renewals/${id}/mark-paid`, { method: "POST" }),

  listHolidays: () => request<{ holidays: HolidayRow[] }>("/holidays"),
  createHoliday: (body: { date: string; name: string; type?: "public" | "special" }) =>
    request<{ holiday: HolidayRow }>("/holidays", { method: "POST", body: JSON.stringify(body) }),
  deleteHoliday: (id: number) => request<{ ok: true }>(`/holidays/${id}`, { method: "DELETE" }),

  listSettings: () => request<{ settings: Record<string, string> }>("/settings"),
  updateSettings: (body: Record<string, string>) =>
    request<{ settings: Record<string, string> }>("/settings", { method: "PATCH", body: JSON.stringify(body) }),
};
