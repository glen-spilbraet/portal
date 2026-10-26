-- Sheet-level webshop dates: preorder date and restock date (ISO yyyy-mm-dd, or
-- NULL/empty when unset). App DB (DB): portal-db + portal-db-dev.
ALTER TABLE sales_sheets ADD COLUMN preorder_date TEXT;
ALTER TABLE sales_sheets ADD COLUMN restock_date TEXT;
