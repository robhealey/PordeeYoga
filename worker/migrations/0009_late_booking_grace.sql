-- Members may still book a class for this many minutes after it starts (late arrivals).
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('late_booking_grace_minutes', '15');
