-- Credit Note report gets its own permission (a Stats-area report scoped to
-- credit notes). Additive; existing sets default to no access.
ALTER TABLE permission_sets ADD COLUMN access_credit_notes INTEGER NOT NULL DEFAULT 0;
