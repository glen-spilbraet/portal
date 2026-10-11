-- Editable departments (previously a hardcoded list).
CREATE TABLE IF NOT EXISTS department (
	id   TEXT PRIMARY KEY,
	name TEXT NOT NULL UNIQUE,
	sort INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO department (id, name, sort) VALUES
	('30fa7577-6550-4a4a-9881-f686ea5c951a', 'Marketing', 0),
	('96ce55ff-7a72-49fd-9612-0cde3f65918b', 'Purchase', 1),
	('fa7bb413-42b7-40ea-acdd-632e601a87d1', 'Sales', 2),
	('9aa7e4aa-7fb8-40a5-9998-310b000d36bd', 'Customer Service', 3);
