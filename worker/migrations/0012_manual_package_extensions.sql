-- Admin can extend a member's package by a number of days, with a reason.
-- extension_days is the running total, re-applied whenever the expiry is recomputed (e.g. a package
-- waiting on its activation deadline starts its clock at first use), so extensions aren't lost.
ALTER TABLE member_packages ADD COLUMN extension_days INTEGER NOT NULL DEFAULT 0;
-- Days added by each extension; NULL for older date-based extensions.
ALTER TABLE expiry_extensions ADD COLUMN days INTEGER;
