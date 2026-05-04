ALTER TABLE sales_sheets ADD COLUMN share_token TEXT;
UPDATE sales_sheets SET share_token = lower(hex(randomblob(10))) WHERE share_token IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_sheets_share_token ON sales_sheets(share_token);
