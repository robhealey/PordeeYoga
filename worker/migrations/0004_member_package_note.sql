-- Free-text label on a member's package (e.g. "for my mum", "work pack") shown when choosing which package to book with
ALTER TABLE member_packages ADD COLUMN note TEXT;
