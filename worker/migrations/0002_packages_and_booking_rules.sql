-- Adds packages/credits, waitlist, holidays, coupons, renewals, and the richer
-- booking/session lifecycle needed to implement the studio's full business rules.
-- Payments now attach to a package purchase (or a renewal fee) instead of a single
-- booking: members pay once for a package, then spend its credits on bookings.

-- -- App-wide configurable settings (booking window, cancellation window, fees, etc.) --

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO app_settings (key, value) VALUES
  ('booking_window_days', '3'),
  ('late_cancel_window_minutes', '90'),
  ('default_min_class_capacity', '2'),
  ('default_max_class_capacity', '11'),
  ('waitlist_claim_minutes', '30'),
  ('renewal_extend_fee_cents', '50000'),
  ('renewal_extend_months', '1'),
  ('renewal_combine_activation_window_months', '2'),
  ('birthday_coupon_validity_months', '6'),
  ('studio_cancellations_for_extension_eligibility', '2');

-- -- Holiday calendar (section 8) --

CREATE TABLE holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE, -- YYYY-MM-DD
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'public' CHECK (type IN ('public', 'special')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -- Members: extend users with the profile fields the spec requires (section 2) --

ALTER TABLE users ADD COLUMN date_of_birth TEXT; -- YYYY-MM-DD
ALTER TABLE users ADD COLUMN notes TEXT;

CREATE INDEX idx_users_phone ON users(phone);

-- -- Package catalog (section 3) --

CREATE TABLE packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'THB',
  credits INTEGER, -- NULL = unlimited (e.g. Monthly, gated by max_bookings_per_day instead)
  validity_value INTEGER, -- NULL = no time-based expiry (credit-exhaustion only, e.g. Trial)
  validity_unit TEXT CHECK (validity_unit IN ('day', 'month')) DEFAULT 'month',
  eligible_class_type_ids TEXT, -- JSON array of class_types.id; NULL = all class types
  eligible_days TEXT, -- JSON array of 'mon'..'sun'/'holiday'; NULL = any day
  max_bookings_per_day INTEGER, -- NULL = no daily cap
  renewable INTEGER NOT NULL DEFAULT 0,
  shared INTEGER NOT NULL DEFAULT 0, -- shared credit pool usable by multiple members
  one_time_per_person INTEGER NOT NULL DEFAULT 0, -- e.g. Trial
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -- Class types: add configurable confirmation thresholds (section 9) --

ALTER TABLE class_types ADD COLUMN min_confirm_count INTEGER NOT NULL DEFAULT 2;
ALTER TABLE class_types ADD COLUMN min_confirm_value_cents INTEGER; -- alt threshold: booking value, NULL = unused

-- -- Class sessions: recreate with the fuller status lifecycle + configurable min capacity --

CREATE TABLE class_sessions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_type_id INTEGER NOT NULL REFERENCES class_types(id) ON DELETE CASCADE,
  instructor_id INTEGER REFERENCES instructors(id) ON DELETE SET NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  min_capacity_override INTEGER,
  capacity_override INTEGER,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'confirmed', 'full', 'cancelled_by_studio', 'completed')),
  opened_manually INTEGER NOT NULL DEFAULT 0,
  cancellation_reason TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO class_sessions_new (id, class_type_id, instructor_id, start_time, end_time, capacity_override, status, created_at)
SELECT id, class_type_id, instructor_id, start_time, end_time, capacity_override,
       CASE WHEN status = 'cancelled' THEN 'cancelled_by_studio' ELSE 'scheduled' END,
       created_at
FROM class_sessions;

DROP TABLE class_sessions;
ALTER TABLE class_sessions_new RENAME TO class_sessions;

CREATE INDEX idx_class_sessions_start_time ON class_sessions(start_time);
CREATE INDEX idx_class_sessions_class_type ON class_sessions(class_type_id);
CREATE INDEX idx_class_sessions_status ON class_sessions(status);

-- -- Member packages: a member's purchased/activated instance of a package (sections 3, 6, 7, 13, 17) --

CREATE TABLE member_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id INTEGER NOT NULL REFERENCES packages(id),
  credits_total INTEGER, -- snapshot from packages.credits at purchase; NULL = unlimited
  credits_used INTEGER NOT NULL DEFAULT 0,
  price_paid_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'THB',
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment', 'paid_not_activated', 'active', 'expired', 'combined', 'cancelled')),
  purchased_at TEXT NOT NULL DEFAULT (datetime('now')),
  activated_at TEXT, -- set once payment succeeds / package starts counting toward validity
  expires_at TEXT, -- NULL only while pending_payment or for pure credit-exhaustion packages
  studio_cancelled_class_count INTEGER NOT NULL DEFAULT 0,
  expiry_extension_flagged_at TEXT, -- set once studio_cancelled_class_count crosses the threshold
  renewal_option_used TEXT CHECK (renewal_option_used IN ('combine', 'extend')), -- set on the OLD package once renewed
  renewed_into_member_package_id INTEGER REFERENCES member_packages(id),
  combined_from_member_package_id INTEGER REFERENCES member_packages(id), -- set on the NEW package when it absorbed an old one
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_member_packages_user ON member_packages(user_id);
CREATE INDEX idx_member_packages_status ON member_packages(status);
CREATE INDEX idx_member_packages_expires_at ON member_packages(expires_at);

-- -- Shared coupon pools: which members are authorized to draw from a shared member_package (section 14) --

CREATE TABLE shared_coupon_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_package_id INTEGER NOT NULL REFERENCES member_packages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (member_package_id, user_id)
);

-- -- Birthday coupons (section 16) --

CREATE TABLE birthday_coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- recipient/owner
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired')),
  actual_user_id INTEGER REFERENCES users(id), -- who actually used it, if different from owner
  used_at TEXT,
  used_booking_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_birthday_coupons_user ON birthday_coupons(user_id);
CREATE INDEX idx_birthday_coupons_status ON birthday_coupons(status);

-- -- Bookings: recreate with credit-source linkage and the richer cancellation lifecycle (sections 6, 7, 10, 12) --

CREATE TABLE bookings_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_session_id INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  member_package_id INTEGER REFERENCES member_packages(id),
  birthday_coupon_id INTEGER REFERENCES birthday_coupons(id),
  credit_value_cents INTEGER, -- snapshot of the credit's per-class value, for value-based confirmation (section 9)
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'attended', 'no_show', 'cancelled_by_member', 'late_cancelled', 'cancelled_by_studio')),
  credit_refunded INTEGER NOT NULL DEFAULT 0,
  cancelled_at TEXT,
  reminder_sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO bookings_new (id, user_id, class_session_id, status, reminder_sent_at, created_at)
SELECT id, user_id, class_session_id,
       CASE status WHEN 'confirmed' THEN 'confirmed' WHEN 'attended' THEN 'attended'
                   WHEN 'no_show' THEN 'no_show' ELSE 'cancelled_by_member' END,
       reminder_sent_at, created_at
FROM bookings;

DROP TABLE bookings;
ALTER TABLE bookings_new RENAME TO bookings;

CREATE INDEX idx_bookings_class_session ON bookings(class_session_id);
CREATE INDEX idx_bookings_user ON bookings(user_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_member_package ON bookings(member_package_id);

-- -- Waitlist (section 11) --

CREATE TABLE waitlist_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_session_id INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_package_id INTEGER REFERENCES member_packages(id), -- package they intend to spend when claiming
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'notified', 'reserved', 'expired', 'cancelled')),
  notified_at TEXT,
  notify_expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_waitlist_session_status ON waitlist_entries(class_session_id, status, created_at);

-- -- Package renewals (sections 17, 18) --

CREATE TABLE package_renewals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  old_member_package_id INTEGER NOT NULL REFERENCES member_packages(id),
  option TEXT NOT NULL CHECK (option IN ('combine', 'extend')),
  old_expires_at TEXT NOT NULL,
  old_remaining_credits INTEGER,
  new_member_package_id INTEGER REFERENCES member_packages(id),
  credits_after_combination INTEGER,
  new_expires_at TEXT,
  fee_cents INTEGER,
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('pending', 'applied', 'cancelled')),
  processed_by TEXT NOT NULL DEFAULT 'member' CHECK (processed_by IN ('member', 'admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_package_renewals_old_package ON package_renewals(old_member_package_id);

-- -- Studio-cancellation-triggered expiry extensions, admin-applied (section 13) --

CREATE TABLE expiry_extensions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_package_id INTEGER NOT NULL REFERENCES member_packages(id),
  old_expires_at TEXT NOT NULL,
  new_expires_at TEXT NOT NULL,
  reason TEXT,
  admin_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -- Payments: repoint from a single booking to a member_package purchase or a renewal fee --

CREATE TABLE payments_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_package_id INTEGER REFERENCES member_packages(id) ON DELETE CASCADE,
  package_renewal_id INTEGER REFERENCES package_renewals(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_charge_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'THB',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((member_package_id IS NOT NULL) OR (package_renewal_id IS NOT NULL))
);

DROP TABLE payments;
ALTER TABLE payments_new RENAME TO payments;

CREATE INDEX idx_payments_member_package ON payments(member_package_id);
CREATE INDEX idx_payments_renewal ON payments(package_renewal_id);
CREATE INDEX idx_payments_provider_charge ON payments(provider_charge_id);

-- -- Seed the package catalog from the owner's price list (section 3) --

INSERT INTO packages (name, price_cents, credits, validity_value, validity_unit, eligible_days, max_bookings_per_day, renewable, shared, one_time_per_person, sort_order) VALUES
  ('Trial', 20000, 1, NULL, 'month', NULL, NULL, 0, 0, 1, 10),
  ('Drop-in', 47000, 1, NULL, 'month', NULL, NULL, 0, 0, 0, 20),
  ('3 Classes', 108000, 3, 1, 'month', NULL, NULL, 1, 0, 0, 30),
  ('4 Classes', 132000, 4, 1, 'month', NULL, NULL, 1, 0, 0, 40),
  ('10 Classes', 275000, 10, 2, 'month', NULL, NULL, 1, 0, 0, 50),
  ('20 Classes', 460000, 20, 3, 'month', NULL, NULL, 1, 0, 0, 60),
  ('25 Classes', 510000, 25, 3, 'month', NULL, NULL, 1, 0, 0, 70),
  ('10 Shared Coupons', 340000, 10, 3, 'month', NULL, NULL, 1, 1, 0, 80),
  ('Monthly', 310000, NULL, 1, 'month', NULL, 2, 1, 0, 0, 90),
  ('Recurring Monthly', 285000, NULL, 1, 'month', NULL, 2, 1, 0, 0, 100),
  ('2 Months', 545000, NULL, 2, 'month', NULL, 2, 1, 0, 0, 110),
  ('3 Months', 750000, NULL, 3, 'month', NULL, 2, 1, 0, 0, 120),
  ('Weekend 4 Classes', 120000, 4, 1, 'month', '["sat","sun","holiday"]', NULL, 0, 0, 0, 130),
  ('Weekend 9 Classes', 207000, 9, 2, 'month', '["sat","sun","holiday"]', NULL, 0, 0, 0, 140),
  ('Easy Yoga 10 Classes', 275000, 10, 2, 'month', NULL, NULL, 0, 0, 0, 150);
