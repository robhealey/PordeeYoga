-- Renewal payment must be made within this many days of the package's expiry (activation can happen later)
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('renewal_payment_grace_days', '2');
