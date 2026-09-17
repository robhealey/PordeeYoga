-- Core schema for Pordee Yoga booking system

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id TEXT UNIQUE,
  display_name TEXT NOT NULL,
  picture_url TEXT,
  phone TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'instructor', 'admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE instructors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  bio TEXT,
  photo_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE class_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 12,
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'THB',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE class_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_type_id INTEGER NOT NULL REFERENCES class_types(id) ON DELETE CASCADE,
  instructor_id INTEGER REFERENCES instructors(id) ON DELETE SET NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  capacity_override INTEGER,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_class_sessions_start_time ON class_sessions(start_time);
CREATE INDEX idx_class_sessions_class_type ON class_sessions(class_type_id);

CREATE TABLE bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_session_id INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'confirmed', 'cancelled', 'attended', 'no_show')),
  reminder_sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, class_session_id)
);

CREATE INDEX idx_bookings_class_session ON bookings(class_session_id);
CREATE INDEX idx_bookings_user ON bookings(user_id);
CREATE INDEX idx_bookings_status ON bookings(status);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_charge_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'THB',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_payments_booking ON payments(booking_id);
CREATE INDEX idx_payments_provider_charge ON payments(provider_charge_id);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
