/**
 * Awards & Press data for the MCP server. Read-only views over award_media +
 * press_instance + award_statement, shaped as clean JSON with absolute URLs.
 * Reuses the awards data layer; the awards dataset is small so filtering in JS
 * is fine and keeps shapes consistent.
 */
import { listMedia, getMedia, listAllInstances } from './awards.js';

const imgUrl = (origin, key) => (key ? `${origin}/api/img/${key}` : null);

function shapeInstance(i, origin) {
	return {
		media: i.media_name,
		media_country: i.media_country ?? null,
		review_scale: i.review_scale ?? null,
		sku: i.sku ?? null,
		product_name: i.product_name ?? null,
		award_category: i.award_category ?? null,
		is_nominated: !!i.is_nominated,
		is_winner: !!i.is_winner,
		instance_date: i.instance_date ?? null,
		disclosure_date: i.disclosure_date ?? null,
		proof: i.proof_url || imgUrl(origin, i.proof_key),
		badges: {
			nominee: imgUrl(origin, i.nominee_badge_key),
			winner: imgUrl(origin, i.winner_badge_key)
		},
		statements: (i.statements ?? []).map((s) => ({ statement: s.statement ?? null, score: s.score ?? null }))
	};
}

/** All award / press instances for one product SKU (nominations, wins, reviews). */
export async function getProductPress(db, sku, origin) {
	const want = (sku ?? '').toLowerCase().trim();
	if (!want) return [];
	const all = await listAllInstances(db);
	return all.filter((i) => (i.sku ?? '').toLowerCase() === want).map((i) => shapeInstance(i, origin));
}

/** Recent press instances (newest first), optionally filtered by date range / media name. */
export async function listPress(db, { from, to, media, limit = 50 } = {}, origin) {
	let all = await listAllInstances(db);
	if (from) all = all.filter((i) => (i.instance_date ?? '') >= from);
	if (to) all = all.filter((i) => (i.instance_date ?? '') <= to);
	if (media) {
		const m = media.toLowerCase();
		all = all.filter((i) => (i.media_name ?? '').toLowerCase().includes(m));
	}
	const n = Math.max(1, Math.min(Number(limit) || 50, 200));
	return all.slice(0, n).map((i) => shapeInstance(i, origin));
}

/** Media outlets with counts. */
export async function listMediaOutlets(db) {
	const rows = await listMedia(db);
	return rows.map((m) => ({
		id: m.id,
		name: m.name,
		country: m.country ?? null,
		review_scale: m.review_scale ?? null,
		contacts: m.contact_count,
		instances: m.instance_count
	}));
}

/** One media outlet: details, badge-placement config and contacts. */
export async function getMediaDetail(db, id) {
	const m = await getMedia(db, id);
	if (!m) return null;
	return {
		id: m.id,
		name: m.name,
		country: m.country ?? null,
		review_scale: m.review_scale ?? null,
		notes: m.notes ?? null,
		badge: {
			placement: m.badge_placement,
			pad_x: !!m.badge_pad_x,
			pad_y: !!m.badge_pad_y,
			size_pct: m.badge_size_pct,
			pad_pct: m.badge_pad_pct
		},
		contacts: (m.contacts ?? []).map((c) => ({
			name: c.name ?? null,
			email: c.email ?? null,
			phone: c.phone ?? null,
			role: c.role ?? null
		}))
	};
}
