/**
 * Task-management data layer (boards, tasks, task↔entity associations).
 * Runs against the `DB` binding. Customer-association search runs against
 * SALES_DB (the shared sales mirror) — see searchCustomerAssoc.
 */

function uid() { return crypto.randomUUID(); }

export const STATUSES   = ['not_started', 'working', 'stuck', 'waiting_approval', 'done'];
export const PRIORITIES = ['low', 'medium', 'high', 'critical'];
export const ASSOC_KINDS = ['product', 'customer', 'event'];

// ── Boards ───────────────────────────────────────────────────────────────────

export async function listBoards(db) {
	const rows = await db.prepare(
		'SELECT * FROM task_boards WHERE archived = 0 ORDER BY position ASC, created_at ASC'
	).all();
	return rows.results ?? [];
}

export async function createBoard(db, { name, createdBy }) {
	const id  = uid();
	const pos = await db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM task_boards WHERE archived = 0').first();
	await db.prepare('INSERT INTO task_boards (id, name, position, created_by) VALUES (?,?,?,?)')
		.bind(id, name, pos?.p ?? 0, createdBy ?? null).run();
	return id;
}

export async function updateBoard(db, id, patch) {
	const allowed = ['name', 'position', 'archived', 'view_type'];
	const fields = [], values = [];
	for (const k of allowed) if (k in patch) { fields.push(`${k} = ?`); values.push(patch[k]); }
	if (!fields.length) return;
	values.push(id);
	await db.prepare(`UPDATE task_boards SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
}

export async function deleteBoard(db, id) {
	await db.batch([
		db.prepare('DELETE FROM task_associations WHERE task_id IN (SELECT id FROM tasks WHERE board_id = ?)').bind(id),
		db.prepare('DELETE FROM tasks WHERE board_id = ?').bind(id),
		db.prepare('DELETE FROM task_boards WHERE id = ?').bind(id),
	]);
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export async function listTasks(db) {
	const [tasks, assoc] = await Promise.all([
		db.prepare('SELECT * FROM tasks ORDER BY position ASC, created_at ASC').all(),
		db.prepare('SELECT * FROM task_associations ORDER BY created_at ASC').all(),
	]);
	const byTask = {};
	for (const a of assoc.results ?? []) (byTask[a.task_id] ??= []).push(a);
	return (tasks.results ?? []).map((t) => ({ ...t, associations: byTask[t.id] ?? [] }));
}

export async function createTask(db, { board_id, name, createdBy }) {
	const id  = uid();
	const pos = await db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM tasks WHERE board_id = ?').bind(board_id).first();
	await db.prepare('INSERT INTO tasks (id, board_id, name, position, created_by) VALUES (?,?,?,?,?)')
		.bind(id, board_id, name ?? '', pos?.p ?? 0, createdBy ?? null).run();
	return id;
}

export async function updateTask(db, id, patch) {
	const allowed = ['name', 'description', 'status', 'priority', 'due_date', 'assignee_email', 'position', 'board_id'];
	const fields = [], values = [];
	for (const k of allowed) if (k in patch) { fields.push(`${k} = ?`); values.push(patch[k] ?? null); }
	if (!fields.length) return;
	fields.push(`updated_at = datetime('now')`);
	values.push(id);
	await db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
}

export async function deleteTask(db, id) {
	await db.batch([
		db.prepare('DELETE FROM task_associations WHERE task_id = ?').bind(id),
		db.prepare('DELETE FROM task_updates WHERE task_id = ?').bind(id),
		db.prepare('DELETE FROM tasks WHERE id = ?').bind(id),
	]);
}

// ── Updates (comment feed) ─────────────────────────────────────────────────────

export async function listUpdates(db, taskId) {
	const rows = await db.prepare('SELECT * FROM task_updates WHERE task_id = ? ORDER BY created_at ASC').bind(taskId).all();
	return rows.results ?? [];
}

export async function addUpdate(db, taskId, { author, body }) {
	const id = uid();
	await db.prepare('INSERT INTO task_updates (id, task_id, author_email, body) VALUES (?,?,?,?)')
		.bind(id, taskId, author ?? null, body).run();
	return id;
}

// ── Associations ─────────────────────────────────────────────────────────────

export async function addAssociation(db, taskId, { kind, ref_id, ref_label }) {
	const id = uid();
	await db.prepare('INSERT INTO task_associations (id, task_id, kind, ref_id, ref_label) VALUES (?,?,?,?,?)')
		.bind(id, taskId, kind, String(ref_id), ref_label ?? null).run();
	return id;
}

export async function removeAssociation(db, assocId) {
	await db.prepare('DELETE FROM task_associations WHERE id = ?').bind(assocId).run();
}

// ── Customer search (SALES_DB) ─────────────────────────────────────────────────
// Customers are companies derived from the HubSpot deal mirror; one row per deal,
// so group by company_id. Admin-only tool, so no owner scoping is applied.

export async function searchCustomerAssoc(salesDb, q) {
	const like = `%${q.toLowerCase()}%`;
	const rows = await salesDb.prepare(
		`SELECT COALESCE(company_id, 'none') AS id, company_name AS name, MAX(owner_name) AS owner
		 FROM sales_deals
		 WHERE company_name IS NOT NULL AND company_name <> '' AND lower(company_name) LIKE ?
		 GROUP BY company_id
		 ORDER BY name COLLATE NOCASE
		 LIMIT 20`
	).bind(like).all();
	return rows.results ?? [];
}
