export interface ApiUser {
  id: number;
  line_user_id: string | null;
  display_name: string;
  picture_url: string | null;
  phone: string | null;
  date_of_birth: string | null;
  role: "customer" | "instructor" | "admin";
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText);
  }
  return body as T;
}

export const api = {
  me: () => request<{ user: ApiUser | null }>("/auth/me"),
  liffVerify: (idToken: string) =>
    request<{ user: ApiUser }>("/auth/liff/verify", {
      method: "POST",
      body: JSON.stringify({ idToken }),
    }),
  devMockLogin: (displayName: string, role?: "customer" | "admin") =>
    request<{ user: ApiUser }>("/auth/dev-mock-login", {
      method: "POST",
      body: JSON.stringify({ displayName, role }),
    }),
  lineCallback: (code: string, redirectUri: string) =>
    request<{ user: ApiUser }>("/auth/line/callback", {
      method: "POST",
      body: JSON.stringify({ code, redirectUri }),
    }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),

  listClasses: () => request<{ sessions: ClassSession[] }>("/classes"),
  getClass: (id: number) => request<{ session: ClassSession }>(`/classes/${id}`),
  classAttendees: (id: number) =>
    request<{ attendees: { name: string; note: string | null; mine: boolean; memberPackageId: number | null }[] }>(`/classes/${id}/attendees`),

  createBooking: (classSessionId: number, memberPackageId: number) =>
    request<{ booking: { id: number } }>("/bookings", {
      method: "POST",
      body: JSON.stringify({ classSessionId, memberPackageId }),
    }),
  bookWithBirthdayCoupon: (classSessionId: number, birthdayCouponId: number, attendeeUserId?: number) =>
    request<{ booking: { id: number } }>("/bookings/birthday-coupon", {
      method: "POST",
      body: JSON.stringify({ classSessionId, birthdayCouponId, attendeeUserId }),
    }),
  myBookings: () => request<{ bookings: MyBooking[] }>("/bookings/me"),
  getBooking: (id: number) => request<{ booking: BookingDetail }>(`/bookings/${id}`),
  cancelBooking: (id: number) =>
    request<{ status: string; creditRefunded: boolean }>(`/bookings/${id}`, { method: "DELETE" }),

  joinWaitlist: (classSessionId: number, memberPackageId?: number) =>
    request<{ entry: WaitlistEntry }>("/waitlist", {
      method: "POST",
      body: JSON.stringify({ classSessionId, memberPackageId }),
    }),
  leaveWaitlist: (id: number) => request<{ ok: true }>(`/waitlist/${id}`, { method: "DELETE" }),
  claimWaitlist: (id: number, memberPackageId: number) =>
    request<{ booking: { id: number } }>(`/waitlist/${id}/claim`, {
      method: "POST",
      body: JSON.stringify({ memberPackageId }),
    }),
  myWaitlist: () => request<{ entries: MyWaitlistEntry[] }>("/waitlist/mine"),

  listPackages: () => request<{ packages: PackageCatalogItem[] }>("/packages"),
  myPackages: () => request<{ memberPackages: MemberPackage[] }>("/packages/mine"),
  usablePackages: () => request<{ memberPackages: MemberPackage[] }>("/packages/usable"),
  purchasePackage: (body: {
    packageId: number;
    trialFullName?: string;
    trialPhone?: string;
    renewOldMemberPackageId?: number;
    note?: string;
  }) => request<{ memberPackage: MemberPackage }>("/packages/purchase", { method: "POST", body: JSON.stringify(body) }),
  updatePackageNote: (id: number, note: string) =>
    request<{ memberPackage: { id: number; note: string | null } }>(`/packages/${id}/note`, {
      method: "PATCH",
      body: JSON.stringify({ note }),
    }),
  activatePackage: (id: number) =>
    request<{ combined: boolean }>(`/packages/${id}/activate`, { method: "POST" }),
  requestExtendRenewal: (id: number) =>
    request<{ renewalId: number; feeCents: number; newExpiresAt: string }>(`/packages/${id}/renewals/extend`, {
      method: "POST",
    }),
  myBirthdayCoupons: () => request<{ coupons: BirthdayCoupon[] }>("/packages/coupons/birthday"),
  getRenewal: (id: number) => request<{ renewal: PackageRenewal }>(`/packages/renewals/${id}`),
  notifyPackagePaid: (id: number) => request<{ ok: true }>(`/packages/${id}/notify-paid`, { method: "POST" }),
  notifyRenewalPaid: (id: number) =>
    request<{ ok: true }>(`/packages/renewals/${id}/notify-paid`, { method: "POST" }),

  chargeOmise: (body: { memberPackageId?: number; packageRenewalId?: number }) =>
    request<{ chargeId: string; status: string; qrImageUri: string | null }>("/payments/omise/charge", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export type ClassSessionStatus = "scheduled" | "confirmed" | "full" | "cancelled_by_studio" | "completed";

export interface ClassSession {
  id: number;
  class_type_id: number;
  class_name: string;
  instructor_name: string | null;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  price_cents: number;
  currency: string;
  capacity: number;
  spots_left: number;
  status: ClassSessionStatus;
  cancellation_reason: string | null;
}

export interface BookingDetail {
  id: number;
  status: string;
  credit_refunded: number;
  created_at: string;
  class_session_id: number;
  start_time: string;
  end_time: string;
  class_name: string;
  member_package_id: number | null;
  package_name: string | null;
  package_note?: string | null;
  birthday_coupon_id: number | null;
}

export type MyBooking = BookingDetail;

export interface WaitlistEntry {
  id: number;
  class_session_id: number;
  user_id: number;
  member_package_id: number | null;
  status: "waiting" | "notified" | "reserved" | "expired" | "cancelled";
  notified_at: string | null;
  notify_expires_at: string | null;
  created_at: string;
}

export interface MyWaitlistEntry extends WaitlistEntry {
  class_name: string;
  start_time: string;
}

export interface PackageCatalogItem {
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
}

export interface MemberPackage {
  id: number;
  user_id: number;
  package_id: number;
  credits_total: number | null;
  credits_used: number;
  price_paid_cents: number;
  currency: string;
  status: "pending_payment" | "paid_not_activated" | "active" | "expired" | "combined" | "cancelled";
  purchased_at: string;
  activated_at: string | null;
  expires_at: string | null;
  studio_cancelled_class_count: number;
  expiry_extension_flagged_at: string | null;
  renewal_option_used: "combine" | "extend" | null;
  note?: string | null;
  combined_from_member_package_id?: number | null;
  combine_activate_by?: string | null;
  renewal?: {
    expired: boolean;
    payBy: string;
    activateBy: string;
    extendFeeCents: number;
    extendMonths: number;
    newExpiresAt: string;
    remainingCredits: number | null;
    canCombine: boolean;
  } | null;
  package_name: string;
  package_shared?: number;
  package_eligible_class_type_ids?: string | null;
  package_eligible_days?: string | null;
  package_max_bookings_per_day?: number | null;
}

export interface PackageRenewal {
  id: number;
  old_member_package_id: number;
  option: "combine" | "extend";
  old_expires_at: string;
  old_remaining_credits: number | null;
  new_member_package_id: number | null;
  credits_after_combination: number | null;
  new_expires_at: string | null;
  fee_cents: number | null;
  status: "pending" | "applied" | "cancelled";
  processed_by: "member" | "admin";
  created_at: string;
}

export interface BirthdayCoupon {
  id: number;
  user_id: number;
  issued_at: string;
  expires_at: string;
  status: "active" | "used" | "expired";
  actual_user_id: number | null;
  used_at: string | null;
}
