/**
 * Product relations: "<sku> is <type> for <target_sku>" — Catan 5-6 is an
 * Expansion for Catan; a token pack is an Accessory for two language versions.
 * Types (Expansion / Accessory / Display) are editable with a name, a forward
 * phrase ("Expansion for", on the expansion) and an inverse heading
 * ("Expansions", on the base game) per language.
 *
 * App DB (DB binding) — per environment, unlike categories, so dev can be used
 * for tests and demos. Read by the shop feed (shopFeed.js) and the sheet editor.
 */

import { LANGS } from '$lib/languages.js';
import { NAME_COLUMNS_SQL, NAME_JOINS_SQL } from '$lib/db.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1 */
/** @typedef {{ name: string, forward: string | null, inverse: string | null }} TypeLabel */
/** @typedef {{ id: string, position: number, labels: Record<string, TypeLabel>, count?: number }} RelationType */

export const RELATION_LANGS = LANGS;

/**
 * All relation types with their labels, ordered by position.
 * @param {D1} db @param {{ counts?: boolean }} [opts]
 * @returns {Promise<RelationType[]>}
 */
export async function listRelationTypes(db, { counts = false } = {}) {
	const [t, l, n] = await db.batch([
		db.prepare('SELECT id, position FROM relation_type ORDER BY position, created_at'),
		db.prepare('SELECT type_id, language, name, forward, inverse FROM relation_type_label'),
		counts ? db.prepare('SELECT type_id, COUNT(*) AS n FROM product_relation GROUP BY type_id') : db.prepare('SELECT NULL AS type_id, 0 AS n WHERE 0')
	]);
	/** @type {Record<string, Record<string, TypeLabel>>} */
	const labels = {};
	for (const r of /** @type {any[]} */ (l.results ?? [])) (labels[r.type_id] ??= {})[r.language] = { name: r.name, forward: r.forward || null, inverse: r.inverse || null };
	const cnt = Object.fromEntries((/** @type {any[]} */ (n.results ?? [])).map((r) => [r.type_id, r.n]));
	return (/** @type {any[]} */ (t.results ?? [])).map((r) => ({ id: r.id, position: r.position, labels: labels[r.id] ?? {}, ...(counts ? { count: cnt[r.id] ?? 0 } : {}) }));
}

/**
 * Labels from a form: name_<lang>, forward_<lang>, inverse_<lang>.
 * A language counts only when it has a name.
 * @param {FormData} f
 */
export function typeLabelsFromForm(f) {
	/** @type {Record<string, TypeLabel>} */
	const out = {};
	const val = (/** @type {string} */ k) => String(f.get(k) ?? '').trim().slice(0, 80);
	for (const lang of RELATION_LANGS) {
		const name = val(`name_${lang}`);
		if (name) out[lang] = { name, forward: val(`forward_${lang}`) || null, inverse: val(`inverse_${lang}`) || null };
	}
	return out;
}

/** A stable, readable id from the English (or Danish) name: "Floor display" → "floor-display". @param {string} s */
const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'type';

/** @param {D1} db @param {string} id @param {Record<string, TypeLabel>} labels */
function labelStatements(db, id, labels) {
	return [
		db.prepare('DELETE FROM relation_type_label WHERE type_id = ?').bind(id),
		...Object.entries(labels).map(([lang, l]) =>
			db.prepare('INSERT INTO relation_type_label (type_id, language, name, forward, inverse) VALUES (?, ?, ?, ?, ?)').bind(id, lang, l.name, l.forward, l.inverse))
	];
}

/** @param {D1} db @param {Record<string, TypeLabel>} labels @param {number} position */
export async function createRelationType(db, labels, position) {
	const base = slug(labels.en?.name ?? labels.da?.name ?? '');
	const taken = new Set((/** @type {any[]} */ ((await db.prepare('SELECT id FROM relation_type').all()).results ?? [])).map((r) => r.id));
	let id = base;
	for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
	await db.batch([db.prepare('INSERT INTO relation_type (id, position) VALUES (?, ?)').bind(id, position), ...labelStatements(db, id, labels)]);
	return id;
}

/** @param {D1} db @param {string} id @param {Record<string, TypeLabel>} labels @param {number} position */
export async function updateRelationType(db, id, labels, position) {
	await db.batch([db.prepare('UPDATE relation_type SET position = ? WHERE id = ?').bind(position, id), ...labelStatements(db, id, labels)]);
}

/** Deleting a type removes all its links too. @param {D1} db @param {string} id */
export async function deleteRelationType(db, id) {
	await db.batch([
		db.prepare('DELETE FROM product_relation WHERE type_id = ?').bind(id),
		db.prepare('DELETE FROM relation_type_label WHERE type_id = ?').bind(id),
		db.prepare('DELETE FROM relation_type WHERE id = ?').bind(id)
	]);
}

/**
 * The best display name of a sheet row with name_<lang> columns.
 * @param {any} r @param {string} [prefer]
 */
const nameOf = (r, prefer) => (prefer && r[`name_${prefer}`]) || (r.primary_language && r[`name_${r.primary_language}`]) || LANGS.map((l) => r[`name_${l}`]).find(Boolean) || null;

/**
 * Sheets (id, sku, name) for SKUs, keyed by lower-case SKU.
 * @param {D1} db @param {string[]} skus @param {string} [lang]
 * @returns {Promise<Record<string, { sheet_id: string, sku: string, name: string | null }>>}
 */
export async function sheetsForSkus(db, skus, lang) {
	const list = [...new Set(skus.map((s) => String(s).trim().toLowerCase()).filter(Boolean))];
	/** @type {Record<string, { sheet_id: string, sku: string, name: string | null }>} */
	const out = {};
	// D1 caps bound parameters per statement; chunk to be safe.
	for (let i = 0; i < list.length; i += 80) {
		const part = list.slice(i, i + 80);
		const rows = await db.prepare(
			`SELECT s.id, s.sku, s.primary_language, ${NAME_COLUMNS_SQL}
			 FROM sales_sheets s ${NAME_JOINS_SQL}
			 WHERE lower(s.sku) IN (${part.map(() => '?').join(',')})
			 ORDER BY s.updated_at DESC`).bind(...part).all();
		for (const r of /** @type {any[]} */ (rows.results ?? [])) {
			const k = String(r.sku).trim().toLowerCase();
			if (!out[k]) out[k] = { sheet_id: r.id, sku: String(r.sku).trim(), name: nameOf(r, lang) };
		}
	}
	return out;
}

/**
 * A product's relations both ways, with the other product's sheet + name.
 *   outgoing: this product is <type> for <target>
 *   incoming: <source> is <type> for this product
 * @param {D1} db @param {string} sku @param {string} [lang]
 */
export async function relationsForSku(db, sku, lang) {
	const [o, i] = await db.batch([
		db.prepare('SELECT type_id, target_sku AS other FROM product_relation WHERE sku = ? ORDER BY created_at').bind(sku),
		db.prepare('SELECT type_id, sku AS other FROM product_relation WHERE target_sku = ? ORDER BY created_at').bind(sku)
	]);
	const out = /** @type {any[]} */ (o.results ?? []);
	const inc = /** @type {any[]} */ (i.results ?? []);
	const sheets = await sheetsForSkus(db, [...out, ...inc].map((r) => r.other), lang);
	const fill = (/** @type {any} */ r) => {
		const s = sheets[String(r.other).toLowerCase()];
		return { type_id: r.type_id, sku: s?.sku ?? r.other, sheet_id: s?.sheet_id ?? null, name: s?.name ?? null };
	};
	return { outgoing: out.map(fill), incoming: inc.map(fill) };
}

/**
 * Add one link. Both SKUs must have a sheet; a product can't relate to itself.
 * @param {D1} db @param {{ sku: string, typeId: string, target: string, by: string | null }} p
 * @returns {Promise<{ ok: true, sku: string, target: string } | { ok: false, error: string }>}
 */
export async function addRelation(db, { sku, typeId, target, by }) {
	const a = String(sku ?? '').trim(), b = String(target ?? '').trim();
	if (!a || !b) return { ok: false, error: 'Missing SKU.' };
	if (a.toLowerCase() === b.toLowerCase()) return { ok: false, error: 'A product cannot be related to itself.' };
	const type = await db.prepare('SELECT id FROM relation_type WHERE id = ?').bind(typeId).first();
	if (!type) return { ok: false, error: 'Unknown relation type.' };
	const sheets = await sheetsForSkus(db, [a, b]);
	const sa = sheets[a.toLowerCase()], sb = sheets[b.toLowerCase()];
	if (!sa || !sb) return { ok: false, error: `No sales sheet for ${!sa ? a : b}.` };
	await db.prepare('INSERT OR IGNORE INTO product_relation (sku, type_id, target_sku, created_by) VALUES (?, ?, ?, ?)')
		.bind(sa.sku, typeId, sb.sku, by).run();
	return { ok: true, sku: sa.sku, target: sb.sku };
}

/** @param {D1} db @param {{ sku: string, typeId: string, target: string }} p */
export async function removeRelation(db, { sku, typeId, target }) {
	await db.prepare('DELETE FROM product_relation WHERE sku = ? AND type_id = ? AND target_sku = ?')
		.bind(String(sku).trim(), typeId, String(target).trim()).run();
}

/**
 * Relations for the shop feed: every product's links in both directions,
 * grouped per type. With `only` (lower-case SKUs) just the links that touch
 * those SKUs on either side.
 * @param {D1} db @param {string[] | null} only
 * @returns {Promise<Record<string, { type: string, direction: 'forward' | 'inverse', skus: string[] }[]>>} keyed by lower-case SKU
 */
export async function relationsForFeed(db, only) {
	let rows;
	try {
		if (only?.length) {
			const q = only.map(() => '?').join(',');
			rows = (await db.prepare(
				`SELECT sku, type_id, target_sku FROM product_relation WHERE sku IN (${q})
				 UNION SELECT sku, type_id, target_sku FROM product_relation WHERE target_sku IN (${q})`).bind(...only, ...only).all()).results ?? [];
		} else {
			rows = (await db.prepare('SELECT sku, type_id, target_sku FROM product_relation').all()).results ?? [];
		}
	} catch (e) {
		// Table not created yet (migration 0130 not applied) — the feed works without relations.
		if (/no such table/i.test(String(/** @type {any} */ (e)?.message ?? e))) return {};
		throw e;
	}
	/** @type {Record<string, Map<string, { type: string, direction: 'forward' | 'inverse', skus: string[] }>>} */
	const by = {};
	const push = (/** @type {string} */ owner, /** @type {string} */ type, /** @type {'forward' | 'inverse'} */ direction, /** @type {string} */ other) => {
		const m = (by[owner.toLowerCase()] ??= new Map());
		const key = `${type}:${direction}`;
		if (!m.has(key)) m.set(key, { type, direction, skus: [] });
		/** @type {any} */ (m.get(key)).skus.push(other);
	};
	for (const r of /** @type {any[]} */ (rows)) {
		push(r.sku, r.type_id, 'forward', r.target_sku);
		push(r.target_sku, r.type_id, 'inverse', r.sku);
	}
	return Object.fromEntries(Object.entries(by).map(([k, m]) => [k, [...m.values()]]));
}

/**
 * How many relations (both directions) each product has, keyed by lower-case
 * SKU — only products with at least one. Relations are few, so this is one
 * small query for the whole sheet overview.
 * @param {D1} db
 * @returns {Promise<Record<string, number>>}
 */
export async function relationCounts(db) {
	try {
		const rows = (await db.prepare(
			`SELECT k, COUNT(*) AS n FROM (
				SELECT lower(sku) AS k FROM product_relation
				UNION ALL SELECT lower(target_sku) FROM product_relation
			) GROUP BY k`).all()).results ?? [];
		return Object.fromEntries((/** @type {any[]} */ (rows)).map((r) => [r.k, r.n]));
	} catch (e) {
		if (/no such table/i.test(String(/** @type {any} */ (e)?.message ?? e))) return {};
		throw e;
	}
}
