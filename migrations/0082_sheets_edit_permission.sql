-- Two permission levels for Sheets: view (overview + search + View button) and
-- edit (the editor). `access_sheets` now means "can view"; `access_sheets_edit`
-- means "can edit". Edit implies view. App DB (DB): portal-db + portal-db-dev.
ALTER TABLE permission_sets ADD COLUMN access_sheets_edit INTEGER NOT NULL DEFAULT 0;

-- Preserve current behaviour: anyone who could access Sheets could edit, so grant
-- edit to every existing set that already has sheets access.
UPDATE permission_sets SET access_sheets_edit = 1 WHERE access_sheets = 1;
