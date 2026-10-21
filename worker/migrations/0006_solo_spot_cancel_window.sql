-- Replaces the old blanket late-cancellation window with a narrower rule: cancelling is
-- always free, except when doing so would leave exactly one person booked in the class and
-- it's within this many minutes of the class start (see worker/lib/bookings.ts cancelBooking).

DELETE FROM app_settings WHERE key = 'late_cancel_window_minutes';

INSERT INTO app_settings (key, value) VALUES
  ('solo_spot_cancel_window_minutes', '90');
