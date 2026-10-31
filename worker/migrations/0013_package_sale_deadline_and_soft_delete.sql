-- Promotional packages can stop selling at a set moment (stored as a UTC ISO timestamp; the admin
-- enters it in Thailand time). Deleting a package from the catalog only stamps deleted_at, so members
-- who bought it keep using it and its history stays intact.
ALTER TABLE packages ADD COLUMN sale_ends_at TEXT;
ALTER TABLE packages ADD COLUMN deleted_at TEXT;
