/**
 * Product categories (tags) for the B2B shop: groups ("Game type") with
 * categories ("Strategy", "Family"…), a label per language, and which
 * categories each SKU has. All on SALES_DB (shared prod portal-db), like the
 * publisher registry. Read by the shop feed (shopFeed.js).
 */

export const CATEGORY_LANGS = ['da', 'sv', 'no', 'en', 'pl'];

/** @typedef {import('@cloudflare/workers-types').D1Database} D1 */
/** @typedef {{ id: string, position: number, labels: Record<string, string>, count?: number }} Cat */
/** @typedef {{ id: string, position: number, labels: Record<string, string>, categories: Cat[] }} Group */

/**
 * All groups with their categories and labels, ordered by position.
 * @param {D1} db
 * @returns {Promise<Group[]>}
 */
export async function listTaxonomy(db) {
	const [g, c, l, n] = await db.batch([
		db.prepare('SELECT id, position FROM category_group ORDER BY position, created_at'),
		db.prepare('SELECT id, group_id, position FROM category ORDER BY position, created_at'),
		db.prepare('SELECT object_type, object_id, language, label FROM category_label'),
		db.prepare('SELECT category_id, COUNT(*) AS n FROM product_category GROUP BY category_id')
	]);
	/** @type {Record<string, Record<string, string>>} */
	const labels = {};
	for (const r of /** @type {any[]} */ (l.results ?? [])) (labels[`${r.object_type}:${r.object_id}`] ??= {})[r.language] = r.label;
	/** @type {Record<string, number>} */
	const counts = Object.fromEntries((/** @type {any[]} */ (n.results ?? [])).map((r) => [r.category_id, r.n]));
	/** @type {Record<string, Group>} */
	const groups = {};
	const out = [];
	for (const r of /** @type {any[]} */ (g.results ?? [])) {
		const group = { id: r.id, position: r.position, labels: labels[`group:${r.id}`] ?? {}, categories: [] };
		groups[r.id] = group;
		out.push(group);
	}
	for (const r of /** @type {any[]} */ (c.results ?? [])) {
		groups[r.group_id]?.categories.push({ id: r.id, position: r.position, labels: labels[`category:${r.id}`] ?? {}, count: counts[r.id] ?? 0 });
	}
	return out;
}

/**
 * Labels from a form: fields named label_<lang>.
 * @param {FormData} f
 */
export function labelsFromForm(f) {
	/** @type {Record<string, string>} */
	const labels = {};
	for (const lang of CATEGORY_LANGS) {
		const v = String(f.get(`label_${lang}`) ?? '').trim().slice(0, 80);
		if (v) labels[lang] = v;
	}
	return labels;
}

/**
 * @param {D1} db
 * @param {'group' | 'category'} type
 * @param {string} id
 * @param {Record<string, string>} labels
 */
function labelStatements(db, type, id, labels) {
	return [
		db.prepare('DELETE FROM category_label WHERE object_type = ? AND object_id = ?').bind(type, id),
		...Object.entries(labels).map(([lang, label]) =>
			db.prepare('INSERT INTO category_label (object_type, object_id, language, label) VALUES (?, ?, ?, ?)').bind(type, id, lang, label))
	];
}

/** @param {D1} db @param {Record<string, string>} labels @param {number} position */
export async function createGroup(db, labels, position) {
	const id = crypto.randomUUID();
	await db.batch([db.prepare('INSERT INTO category_group (id, position) VALUES (?, ?)').bind(id, position), ...labelStatements(db, 'group', id, labels)]);
	return id;
}

/** @param {D1} db @param {string} groupId @param {Record<string, string>} labels @param {number} position */
export async function createCategory(db, groupId, labels, position) {
	const group = await db.prepare('SELECT id FROM category_group WHERE id = ?').bind(groupId).first();
	if (!group) throw new Error('Unknown category group');
	const id = crypto.randomUUID();
	await db.batch([db.prepare('INSERT INTO category (id, group_id, position) VALUES (?, ?, ?)').bind(id, groupId, position), ...labelStatements(db, 'category', id, labels)]);
	return id;
}

/** @param {D1} db @param {'group' | 'category'} type @param {string} id @param {Record<string, string>} labels @param {number} position */
export async function updateItem(db, type, id, labels, position) {
	const table = type === 'group' ? 'category_group' : 'category';
	await db.batch([db.prepare(`UPDATE ${table} SET position = ? WHERE id = ?`).bind(position, id), ...labelStatements(db, type, id, labels)]);
}

/** Deleting a group removes its categories and their product links too. @param {D1} db @param {'group' | 'category'} type @param {string} id */
export async function deleteItem(db, type, id) {
	if (type === 'group') {
		await db.batch([
			db.prepare('DELETE FROM product_category WHERE category_id IN (SELECT id FROM category WHERE group_id = ?)').bind(id),
			db.prepare("DELETE FROM category_label WHERE object_type = 'category' AND object_id IN (SELECT id FROM category WHERE group_id = ?)").bind(id),
			db.prepare('DELETE FROM category WHERE group_id = ?').bind(id),
			db.prepare("DELETE FROM category_label WHERE object_type = 'group' AND object_id = ?").bind(id),
			db.prepare('DELETE FROM category_group WHERE id = ?').bind(id)
		]);
	} else {
		await db.batch([
			db.prepare('DELETE FROM product_category WHERE category_id = ?').bind(id),
			db.prepare("DELETE FROM category_label WHERE object_type = 'category' AND object_id = ?").bind(id),
			db.prepare('DELETE FROM category WHERE id = ?').bind(id)
		]);
	}
}

/** @param {D1} db @param {string} sku @returns {Promise<string[]>} */
export async function productCategoryIds(db, sku) {
	const rows = await db.prepare('SELECT category_id FROM product_category WHERE lower(sku) = lower(?)').bind(sku).all();
	return (/** @type {any[]} */ (rows.results ?? [])).map((r) => r.category_id);
}

/**
 * Replace a SKU's categories.
 * @param {D1} db @param {string} sku @param {string[]} categoryIds @param {string | null} by
 */
export async function setProductCategories(db, sku, categoryIds, by) {
	const known = new Set((/** @type {any[]} */ ((await db.prepare('SELECT id FROM category').all()).results ?? [])).map((r) => r.id));
	const ids = [...new Set(categoryIds)].filter((id) => known.has(id));
	await db.batch([
		db.prepare('DELETE FROM product_category WHERE lower(sku) = lower(?)').bind(sku),
		...ids.map((id) => db.prepare('INSERT INTO product_category (sku, category_id, created_by) VALUES (?, ?, ?)').bind(sku, id, by))
	]);
	return ids;
}
