-- Tracks the date the customer actually paid (admin-editable, defaults to today), separate
-- from created_at (when the payment row itself was written, e.g. when an admin confirms a
-- PromptPay transfer some time after it happened).

ALTER TABLE payments ADD COLUMN paid_at TEXT;
