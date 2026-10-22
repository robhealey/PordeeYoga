-- Class level: who a class is for. Set per class type, with an optional per-session override
-- (the studio's weekly poster marks the same class differently on different days).
-- Poster key: (B) Basic -> beginner, (A) -> advanced, (B/A) -> both.
ALTER TABLE class_types ADD COLUMN level TEXT NOT NULL DEFAULT 'both'
  CHECK (level IN ('beginner', 'advanced', 'both'));
ALTER TABLE class_sessions ADD COLUMN level TEXT
  CHECK (level IS NULL OR level IN ('beginner', 'advanced', 'both')); -- NULL = use the class type's level

-- Defaults read from the 21-27 Sep 2026 poster (most common marking per class).
UPDATE class_types SET level = 'beginner'
  WHERE name IN ('Basic Flow', 'Basic Hatha', 'Basic Backbend', 'Basic Core Flow', 'Basic Stretching', 'Easy Yoga');
UPDATE class_types SET level = 'advanced' WHERE name IN ('Core & Balance');
-- Vinyasa, Stretching, Hatha Flow, Hatha, Backbend: mostly (B/A) -> keep 'both'.
