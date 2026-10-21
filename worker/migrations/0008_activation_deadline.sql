-- Admin-set date (YYYY-MM-DD, studio-local) by which a member must start using a package.
-- While set and activated_at is NULL, the validity clock hasn't started: it starts at the
-- member's first booking, or at the end of this date if they haven't booked by then.
-- expires_at holds the provisional (latest possible) expiry in the meantime.
ALTER TABLE member_packages ADD COLUMN activation_deadline TEXT;
