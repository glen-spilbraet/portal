-- 0133_tombola_pin.sql — PIN per tombola so the big screen can be opened without
-- a Portal login (/tombola/<code>/screen). Signed-in staff skip the PIN.
-- pin_fails / pin_lock_until: brute-force guard (5 wrong → locked 10 min).
-- Apply to BOTH portal-db-dev and portal-db (DB binding, per environment).
ALTER TABLE tombola ADD COLUMN pin TEXT;
ALTER TABLE tombola ADD COLUMN pin_fails INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tombola ADD COLUMN pin_lock_until TEXT;
-- Existing tombolas get a random 4-digit PIN (visible/changeable on the event page).
UPDATE tombola SET pin = printf('%04d', abs(random()) % 10000) WHERE pin IS NULL;
