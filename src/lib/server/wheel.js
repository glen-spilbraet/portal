/**
 * Marketing wheel data layer (hidden /wheel tool). Runs against the `DB` binding.
 * Series/publisher lookups for the pickers run against SALES_DB (shared mirror).
 */

const uid = () => crypto.randomUUID();
export const ITEM_KINDS = ['product', 'series', 'publisher'];

const clampWeek = (w) => Math.max(1, Math.min(53, Math.round(Number(w) || 1)));
const str = (v, max = 2000) => (v == null ? null : String(v).trim().slice(0, max) || null);
const color = (c, fallback) => (/^#[0-9a-fA-F]{6}$/.test(c ?? '') ? c : fallback);

// ── Activities ───────────────────────────────────────────────────────────────

export async function listActivities(db) {
	const r = await db.prepare('SELECT * FROM wheel_activities WHERE archived = 0 ORDER BY position, created_at').all();
	return r.results ?? [];
}

export async function createActivity(db, { name, color: c }) {
	const id = uid();
	const pos = await db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM wheel_activities').first();
	await db.prepare('INSERT INTO wheel_activities (id, name, color, position) VALUES (?,?,?,?)')
		.bind(id, str(name, 80) ?? 'Activity', color(c, '#F57832'), pos?.p ?? 0).run();
	return id;
}

export async function updateActivity(db, id, patch) {
	const sets = [], vals = [];
	if ('name' in patch) { sets.push('name = ?'); vals.push(str(patch.name, 80) ?? 'Activity'); }
	if ('color' in patch) { sets.push('color = ?'); vals.push(color(patch.color, '#F57832')); }
	if ('position' in patch) { sets.push('position = ?'); vals.push(Number(patch.position) || 0); }
	if (!sets.length) return;
	await db.prepare(`UPDATE wheel_activities SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id).run();
}

/** Archive (soft) — keeps history on existing items intact but hides it everywhere. */
export async function archiveActivity(db, id) {
	await db.batch([
		db.prepare('UPDATE wheel_activities SET archived = 1 WHERE id = ?').bind(id),
		db.prepare('DELETE FROM wheel_item_activities WHERE activity_id = ?').bind(id),
	]);
}

// ── Items ────────────────────────────────────────────────────────────────────

export async function listItems(db, year) {
	const [items, links] = await Promise.all([
		db.prepare('SELECT * FROM wheel_items WHERE year = ? ORDER BY week, created_at').bind(year).all(),
		db.prepare('SELECT l.* FROM wheel_item_activities l JOIN wheel_items i ON i.id = l.item_id WHERE i.year = ?').bind(year).all(),
	]);
	const by = {};
	for (const l of links.results ?? []) (by[l.item_id] ??= []).push(l.activity_id);
	return (items.results ?? []).map((i) => ({ ...i, activity_ids: by[i.id] ?? [] }));
}

function itemFields(p) {
	const kind = ITEM_KINDS.includes(p.kind) ? p.kind : null;
	if (!kind || !str(p.ref_id)) throw new Error('kind and ref_id are required');
	return {
		year: Math.round(Number(p.year)),
		week: clampWeek(p.week),
		kind,
		ref_id: str(p.ref_id, 200),
		ref_label: str(p.ref_label, 300),
		notes: str(p.notes, 4000),
		activity_ids: Array.isArray(p.activity_ids) ? [...new Set(p.activity_ids.map(String))] : [],
	};
}

function linkStmts(db, id, activityIds) {
	return [
		db.prepare('DELETE FROM wheel_item_activities WHERE item_id = ?').bind(id),
		...activityIds.map((a) => db.prepare('INSERT OR IGNORE INTO wheel_item_activities (item_id, activity_id) VALUES (?,?)').bind(id, a)),
	];
}

export async function createItem(db, payload, createdBy) {
	const f = itemFields(payload);
	const id = uid();
	await db.batch([
		db.prepare('INSERT INTO wheel_items (id, year, week, kind, ref_id, ref_label, notes, created_by) VALUES (?,?,?,?,?,?,?,?)')
			.bind(id, f.year, f.week, f.kind, f.ref_id, f.ref_label, f.notes, createdBy ?? null),
		...linkStmts(db, id, f.activity_ids),
	]);
	return { id, ...f, created_by: createdBy ?? null };
}

export async function updateItem(db, id, payload) {
	const f = itemFields(payload);
	await db.batch([
		db.prepare(`UPDATE wheel_items SET year=?, week=?, kind=?, ref_id=?, ref_label=?, notes=?, updated_at=datetime('now') WHERE id = ?`)
			.bind(f.year, f.week, f.kind, f.ref_id, f.ref_label, f.notes, id),
		...linkStmts(db, id, f.activity_ids),
	]);
	return { id, ...f };
}

export async function deleteItem(db, id) {
	await db.batch([
		db.prepare('DELETE FROM wheel_item_activities WHERE item_id = ?').bind(id),
		db.prepare('DELETE FROM wheel_items WHERE id = ?').bind(id),
	]);
}

// ── Themes ───────────────────────────────────────────────────────────────────

export async function listThemes(db, year) {
	const r = await db.prepare('SELECT * FROM wheel_themes WHERE year = ? ORDER BY start_week, end_week').bind(year).all();
	return r.results ?? [];
}

function themeFields(p) {
	let s = clampWeek(p.start_week), e = clampWeek(p.end_week);
	if (e < s) [s, e] = [e, s];
	return {
		year: Math.round(Number(p.year)),
		name: str(p.name, 120) ?? 'Theme',
		color: color(p.color, '#17834F'),
		start_week: s,
		end_week: e,
		description: str(p.description, 4000),
	};
}

export async function createTheme(db, payload, createdBy) {
	const f = themeFields(payload);
	const id = uid();
	await db.prepare('INSERT INTO wheel_themes (id, year, name, color, start_week, end_week, description, created_by) VALUES (?,?,?,?,?,?,?,?)')
		.bind(id, f.year, f.name, f.color, f.start_week, f.end_week, f.description, createdBy ?? null).run();
	return { id, ...f };
}

export async function updateTheme(db, id, payload) {
	const f = themeFields(payload);
	await db.prepare('UPDATE wheel_themes SET year=?, name=?, color=?, start_week=?, end_week=?, description=? WHERE id = ?')
		.bind(f.year, f.name, f.color, f.start_week, f.end_week, f.description, id).run();
	return { id, ...f };
}

export async function deleteTheme(db, id) {
	await db.prepare('DELETE FROM wheel_themes WHERE id = ?').bind(id).run();
}

// ── Picker search (series / publishers live on SALES_DB) ─────────────────────

export async function searchSeriesRefs(salesDb, q) {
	const like = `%${q.toLowerCase()}%`;
	const r = await salesDb.prepare(
		`SELECT id, publisher, name FROM series
		 WHERE lower(name) LIKE ? OR lower(publisher) LIKE ?
		 ORDER BY name COLLATE NOCASE LIMIT 12`
	).bind(like, like).all();
	return (r.results ?? []).map((s) => ({ ref_id: String(s.id), label: s.name, sub: s.publisher }));
}

export async function searchPublisherRefs(salesDb, q) {
	const r = await salesDb.prepare(
		'SELECT name FROM publisher WHERE lower(name) LIKE ? ORDER BY name COLLATE NOCASE LIMIT 12'
	).bind(`%${q.toLowerCase()}%`).all();
	return (r.results ?? []).map((p) => ({ ref_id: p.name, label: p.name }));
}
