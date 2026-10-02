-- 0067_order_conf_perm.sql — dedicated permission for the Order Confirmations tool.
ALTER TABLE permission_sets ADD COLUMN access_order_conf INTEGER NOT NULL DEFAULT 0;
