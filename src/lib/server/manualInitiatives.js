/**
 * Manual initiatives (Sales → Initiatives): free-form cards — photo, date, pill
 * tag, header, subheader, country, products — shown among the awards, press
 * and events on a shared report's Initiatives pane (same product matching).
 * App DB (`DB`, per environment), like awards and events.
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1 */

import { error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser, getUserPermissions } from '$lib/db.js';

/** Gate an Initiatives API route by the `initiatives` permission. */
export async function requireInitiatives(cookies, platform) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	const user = db ? await getAllowedUser(db, email) : null;
	if (!user) error(403, 'Forbidden');
	const perms = await getUserPermissions(db, user);
	if (!perms.initiatives) error(403, 'No access to Initiatives');
	return { db, email };
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const str = (v, max = 300) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };

/** Validate + normalise a payload → { value } | { error }. */
export function cleanInitiative(body) {
	const header = str(body?.header, 200);
	if (!header) return { error: 'Header is required' };
	const date = body?.date ? String(body.date) : null;
	if (date && !YMD.test(date)) return { error: 'Invalid date' };
	const skus = [...new Set((Array.isArray(body?.skus) ? body.skus : []).map((s) => String(s ?? '').trim()).filter(Boolean))].slice(0, 50);
	if (!skus.length) return { error: 'Link at least one product' };
	const image = str(body?.image_key, 300);
	if (image && !image.startsWith('initiatives/')) return { error: 'Invalid image' };
	return { value: { header, date, skus, image_key: image, tag: str(body?.tag, 40), subheader: str(body?.subheader, 300), country: str(body?.country, 80) } };
}

const parse = (r) => ({ ...r, skus: (() => { try { return JSON.parse(r.skus || '[]'); } catch { return []; } })() });

/** @param {D1} db */
export async function listInitiatives(db) {
	try {
		const rows = (await db.prepare('SELECT * FROM initiative ORDER BY COALESCE(date, created_at) DESC').all()).results ?? [];
		return rows.map(parse);
	} catch { return []; } // migration 0112 not applied yet
}

/** @param {D1} db */
export async function createInitiative(db, v, by) {
	const id = crypto.randomUUID();
	await db.prepare(
		`INSERT INTO initiative (id, image_key, date, tag, header, subheader, country, skus, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).bind(id, v.image_key, v.date, v.tag, v.header, v.subheader, v.country, JSON.stringify(v.skus), by ?? null).run();
	return id;
}

/** @param {D1} db */
export async function updateInitiative(db, id, v) {
	await db.prepare(
		`UPDATE initiative SET image_key = ?, date = ?, tag = ?, header = ?, subheader = ?, country = ?, skus = ?, updated_at = datetime('now') WHERE id = ?`
	).bind(v.image_key, v.date, v.tag, v.header, v.subheader, v.country, JSON.stringify(v.skus), id).run();
}

/** @param {D1} db */
export async function deleteInitiative(db, id) {
	await db.prepare('DELETE FROM initiative WHERE id = ?').bind(id).run();
}
