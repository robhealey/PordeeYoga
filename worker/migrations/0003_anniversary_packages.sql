-- -- 11th Anniversary promo (September 2026): bonus-credit editions of existing packages --
-- Must be activated by 2026-11-30 (enforced manually by studio staff; no schema support for
-- a purchase-window cutoff yet, so deactivate these rows after that date).

INSERT INTO packages (name, price_cents, credits, validity_value, validity_unit, eligible_days, max_bookings_per_day, renewable, shared, one_time_per_person, sort_order) VALUES
  ('10 Classes (11th Anniversary, +1)', 275000, 11, 2, 'month', NULL, NULL, 0, 0, 0, 51),
  ('20 Classes (11th Anniversary, +1)', 460000, 21, 3, 'month', NULL, NULL, 0, 0, 0, 61),
  ('25 Classes (11th Anniversary, +1)', 510000, 26, 3, 'month', NULL, NULL, 0, 0, 0, 71),
  ('Monthly (11th Anniversary, +1/day)', 310000, NULL, 1, 'month', NULL, 3, 0, 0, 0, 91),
  ('Weekend 9 Classes (11th Anniversary, +1)', 207000, 10, 2, 'month', '["sat","sun","holiday"]', NULL, 0, 0, 0, 141);
