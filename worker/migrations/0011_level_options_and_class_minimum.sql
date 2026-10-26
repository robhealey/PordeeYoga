-- 1) Class levels renamed to the studio's wording:
--    beginner -> basic, both -> beginner_to_all_levels, advanced -> all_levels.
-- SQLite can't alter a CHECK constraint, so each level column is swapped for a new one rather
-- than rebuilding the tables (a rebuild would cascade-delete bookings/waitlist rows).
ALTER TABLE class_types ADD COLUMN level_new TEXT NOT NULL DEFAULT 'beginner_to_all_levels'
  CHECK (level_new IN ('basic', 'all_levels', 'beginner_to_all_levels'));
UPDATE class_types SET level_new = CASE level
  WHEN 'beginner' THEN 'basic'
  WHEN 'advanced' THEN 'all_levels'
  ELSE 'beginner_to_all_levels' END;
ALTER TABLE class_types DROP COLUMN level;
ALTER TABLE class_types RENAME COLUMN level_new TO level;

ALTER TABLE class_sessions ADD COLUMN level_new TEXT
  CHECK (level_new IS NULL OR level_new IN ('basic', 'all_levels', 'beginner_to_all_levels')); -- NULL = use the class type's level
UPDATE class_sessions SET level_new = CASE level
  WHEN 'beginner' THEN 'basic'
  WHEN 'advanced' THEN 'all_levels'
  WHEN 'both' THEN 'beginner_to_all_levels' END;
ALTER TABLE class_sessions DROP COLUMN level;
ALTER TABLE class_sessions RENAME COLUMN level_new TO level;

-- 2) The minimum number of members a class needs now comes from each class type's
-- min_confirm_count (default 2), optionally overridden per session. The old global setting
-- was the only thing actually used, so carry its value over before removing it.
UPDATE class_types SET min_confirm_count =
  COALESCE((SELECT CAST(value AS INTEGER) FROM app_settings WHERE key = 'default_min_class_capacity'), 2)
  WHERE min_confirm_count = 2;
DELETE FROM app_settings WHERE key = 'default_min_class_capacity';
