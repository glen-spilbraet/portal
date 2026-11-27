-- 0137_brand_text_ai.sql — "AI-written" mark on a publisher / series shop
-- text (brand_page_text). Only the Danish text is ever marked: it says the
-- Danish text was written by AI and not yet checked by a person, so the
-- shop's text overview (Admin → Content → Texts there) can filter on it.
-- Translations are always AI and are never marked.
-- SALES_DB / portal-db only (shared by dev + prod).
ALTER TABLE brand_page_text ADD COLUMN ai_written INTEGER NOT NULL DEFAULT 0;
