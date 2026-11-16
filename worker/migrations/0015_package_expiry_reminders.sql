-- LINE reminders sent to members before their package expires: one row per reminder actually sent.
-- kind: '3_days' (three days before the last valid day) or 'last_day' (on the last valid day).
-- expiry_date is the package's last valid day (YYYY-MM-DD, Thailand time) the reminder was about,
-- so if an admin later extends the package, the reminders fire again for the new date.
CREATE TABLE package_expiry_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_package_id INTEGER NOT NULL REFERENCES member_packages(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('3_days', 'last_day')),
  expiry_date TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (member_package_id, kind, expiry_date)
);
