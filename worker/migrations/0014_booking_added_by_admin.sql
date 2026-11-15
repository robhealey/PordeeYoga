-- Track bookings an admin added by hand, so the admin view can show "Attended – Added Retroactively".
-- added_by_user_id: the admin who added the booking (NULL for member self-bookings and older rows).
-- added_retroactively: 1 when the admin added it after the class had started. When = created_at.
ALTER TABLE bookings ADD COLUMN added_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE bookings ADD COLUMN added_retroactively INTEGER NOT NULL DEFAULT 0;

-- Backfill: members can't book after a class has ended, so any older booking created after its
-- class ended must have been added by an admin (who did it is unknown for these).
UPDATE bookings SET added_retroactively = 1
WHERE EXISTS (
  SELECT 1 FROM class_sessions cs
  WHERE cs.id = bookings.class_session_id AND datetime(bookings.created_at) >= datetime(cs.end_time)
);
