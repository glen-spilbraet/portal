/**
 * Awards / Press data helpers (app DB). Media outlets (with contacts + a review
 * scale) and press instances (a product's nomination and/or review by a media
 * on a date), each with one or more scored review statements.
 */

const uid = () => crypto.randomUUID();
function chunk(a, n) { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }

// ── Media ────────────────────────────────────────────────────────────────
export async function listMedia(db) {
	const rows = await db.prepare(
		`SELECT m.*,
		        (SELECT COUNT(*) FROM award_media_contact c WHERE c.media_id = m.id) AS contact_count,
		        (SELECT COUNT(*) FROM press_instance i WHERE i.media_id = m.id) AS instance_count
		 FROM award_media m ORDER BY m.name COLLATE NOCASE`
	).all();
	return rows.results ?? [];
}

export async function getMedia(db, id) {
	const media = await db.prepare('SELECT * FROM award_media WHERE id = ?').bind(id).first();
	if (!media) return null;
	const contacts = (await db.prepare('SELECT * FROM award_media_contact WHERE media_id = ? ORDER BY rowid').bind(id).all()).results ?? [];
	return { ...media, contacts };
}

// ── Public asset-library share key ──────────────────────────────────────────
/** Short, unguessable key for the public /media/[slug]/[key] URL (48 bits hex). */
function genShareKey() {
	const b = crypto.getRandomValues(new Uint8Array(6));
	return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Make sure a media has a share key, creating one if missing. Returns the key. */
export async function ensureShareKey(db, id) {
	const row = await db.prepare('SELECT share_key FROM award_media WHERE id = ?').bind(id).first();
	if (row?.share_key) return row.share_key;
	for (let i = 0; i < 5; i++) {
		const key = genShareKey();
		try {
			await db.prepare('UPDATE award_media SET share_key = ? WHERE id = ?').bind(key, id).run();
			return key;
		} catch { /* unique collision — retry with a new key */ }
	}
	return null;
}

/** Ensure every media in a list has a share key (used by the media admin page). */
export async function ensureShareKeys(db, media) {
	for (const m of media) {
		if (!m.share_key) m.share_key = await ensureShareKey(db, m.id);
	}
	return media;
}

export async function getMediaByShareKey(db, key) {
	if (!key) return null;
	return db.prepare('SELECT * FROM award_media WHERE share_key = ?').bind(key).first();
}

async function replaceContacts(db, mediaId, contacts) {
	await db.prepare('DELETE FROM award_media_contact WHERE media_id = ?').bind(mediaId).run();
	const valid = (contacts ?? []).filter((c) => c && (c.name || c.email || c.phone || c.role));
	for (const b of chunk(valid, 20)) {
		await db.batch(b.map((c) => db.prepare(
			'INSERT INTO award_media_contact (id, media_id, name, email, phone, role) VALUES (?,?,?,?,?,?)'
		).bind(uid(), mediaId, c.name || null, c.email || null, c.phone || null, c.role || null)));
	}
}

const PLACEMENTS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const padNum = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
function badgeBinds(d) {
	return [
		PLACEMENTS.includes(d.badge_placement) ? d.badge_placement : 'bottom-right',
		PLACEMENTS.includes(d.badge_placement_2) ? d.badge_placement_2 : null,
		padNum(d.badge_pad_top), padNum(d.badge_pad_right), padNum(d.badge_pad_bottom), padNum(d.badge_pad_left),
		Number(d.badge_size_pct) || 15,
	];
}
const BADGE_COLS = 'badge_placement, badge_placement_2, badge_pad_top, badge_pad_right, badge_pad_bottom, badge_pad_left, badge_size_pct';

export async function createMedia(db, d) {
	const id = uid();
	await db.prepare(`INSERT INTO award_media (id, name, country, review_scale, notes, share_key, ${BADGE_COLS}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
		.bind(id, d.name, d.country || null, d.review_scale ? Number(d.review_scale) : null, d.notes || null, genShareKey(), ...badgeBinds(d)).run();
	await replaceContacts(db, id, d.contacts);
	return id;
}

export async function updateMedia(db, id, d) {
	const set = BADGE_COLS.split(', ').map((c) => `${c} = ?`).join(', ');
	await db.prepare(`UPDATE award_media SET name = ?, country = ?, review_scale = ?, notes = ?, ${set} WHERE id = ?`)
		.bind(d.name, d.country || null, d.review_scale ? Number(d.review_scale) : null, d.notes || null, ...badgeBinds(d), id).run();
	if (d.contacts) await replaceContacts(db, id, d.contacts);
}

export async function deleteMedia(db, id) {
	await db.batch([
		db.prepare('DELETE FROM award_statement WHERE instance_id IN (SELECT id FROM press_instance WHERE media_id = ?)').bind(id),
		db.prepare('DELETE FROM press_instance_product WHERE instance_id IN (SELECT id FROM press_instance WHERE media_id = ?)').bind(id),
		db.prepare('DELETE FROM press_instance_link WHERE instance_id IN (SELECT id FROM press_instance WHERE media_id = ?)').bind(id),
		db.prepare('DELETE FROM press_instance WHERE media_id = ?').bind(id),
		db.prepare('DELETE FROM award_media_contact WHERE media_id = ?').bind(id),
		db.prepare('DELETE FROM award_media WHERE id = ?').bind(id),
	]);
}

// ── Instances ────────────────────────────────────────────────────────────
const INST_FIELDS = ['media_id', 'sku', 'award_category', 'is_nominated', 'is_winner', 'disclosure_date', 'instance_date', 'proof_url', 'proof_key', 'nominee_badge_key', 'winner_badge_key', 'notes', 'status'];

// An entry's status is the source of truth for the award flags. Award track:
// submitted → nominated → winner (winner implies nominated). Press track:
// sent / used / not_used (no nomination/badges). The track is implied by the
// value, so one media can hold both.
const PRESS_STATUSES = new Set(['sent', 'used', 'not_used']);
/** Resolve {status, nom, win} from a payload. Legacy callers that only send
 *  is_nominated/is_winner (no status) still map to a sensible status + flags. */
function statusAndFlags(d) {
	const status = d.status || (d.is_winner ? 'winner' : d.is_nominated ? 'nominated' : null);
	if (status === 'winner') return { status, nom: 1, win: 1 };
	if (status === 'nominated') return { status, nom: 1, win: 0 };
	if (status === 'submitted' || status === 'nothing') return { status, nom: 0, win: 0 };
	if (PRESS_STATUSES.has(status)) return { status, nom: 0, win: 0 };
	return { status: status || null, nom: d.is_nominated ? 1 : 0, win: d.is_winner ? 1 : 0 };
}

async function replaceStatements(db, instanceId, statements) {
	await db.prepare('DELETE FROM award_statement WHERE instance_id = ?').bind(instanceId).run();
	const valid = (statements ?? []).filter((s) => s && (s.statement || s.score != null && s.score !== ''));
	for (const b of chunk(valid, 20)) {
		await db.batch(b.map((s) => db.prepare(
			'INSERT INTO award_statement (id, instance_id, statement, score) VALUES (?,?,?,?)'
		).bind(uid(), instanceId, s.statement || null, s.score === '' || s.score == null ? null : Number(s.score))));
	}
}

/** Replace an instance's links (each a url + a type like SoMe/article/review). */
async function replaceLinks(db, instanceId, links) {
	await db.prepare('DELETE FROM press_instance_link WHERE instance_id = ?').bind(instanceId).run();
	const valid = (links ?? []).filter((l) => l && (l.url ?? '').trim());
	for (const b of chunk(valid, 20)) {
		await db.batch(b.map((l) => db.prepare(
			'INSERT INTO press_instance_link (id, instance_id, type, url, label) VALUES (?,?,?,?,?)'
		).bind(uid(), instanceId, l.type || 'other', l.url.trim(), (l.label ?? '').trim() || null)));
	}
}

/** Replace an instance's additional products (SKUs beyond the main one). */
async function replaceProducts(db, instanceId, skus) {
	await db.prepare('DELETE FROM press_instance_product WHERE instance_id = ?').bind(instanceId).run();
	const valid = [...new Set((skus ?? []).map((s) => (s ?? '').trim()).filter(Boolean))];
	for (const b of chunk(valid, 20)) {
		await db.batch(b.map((sku) => db.prepare('INSERT INTO press_instance_product (id, instance_id, sku) VALUES (?,?,?)').bind(uid(), instanceId, sku)));
	}
}

function instBinds(d) {
	const { status, nom, win } = statusAndFlags(d);
	return [d.media_id, d.sku || null, d.award_category || null,
		nom, win, d.disclosure_date || null, d.instance_date || null,
		d.proof_url || null, d.proof_key || null, d.nominee_badge_key || null, d.winner_badge_key || null, d.notes || null,
		status];
}

/** Set the same instance_date on many instances (edit a whole block's date). */
export async function setInstancesDate(db, ids, date) {
	const clean = (ids ?? []).filter(Boolean);
	if (!clean.length) return;
	for (const b of chunk(clean, 25)) {
		await db.batch(b.map((id) => db.prepare('UPDATE press_instance SET instance_date = ? WHERE id = ?').bind(date || null, id)));
	}
}

/** Set status (and the derived award flags) on many instances — used by the
 *  per-row quick status change in the overview. */
export async function setInstancesStatus(db, ids, status) {
	const clean = (ids ?? []).filter(Boolean);
	if (!clean.length) return;
	const { status: st, nom, win } = statusAndFlags({ status });
	for (const b of chunk(clean, 25)) {
		await db.batch(b.map((id) => db.prepare(
			'UPDATE press_instance SET status = ?, is_nominated = ?, is_winner = ? WHERE id = ?'
		).bind(st, nom, win, id)));
	}
}

/** Bulk submission: create one instance per SKU, all sharing media, date and
 *  starting status (e.g. 10 titles submitted to an award, or 30 sent to press).
 *  Each is independent afterwards. Returns the created ids. */
export async function bulkCreateInstances(db, { media_id, instance_date, status, skus }) {
	const clean = [...new Set((skus ?? []).map((s) => (s ?? '').trim()).filter(Boolean))];
	const ids = [];
	for (const b of chunk(clean, 20)) {
		await db.batch(b.map((sku) => {
			const id = uid(); ids.push(id);
			return db.prepare(`INSERT INTO press_instance (id, ${INST_FIELDS.join(', ')}) VALUES (?, ${INST_FIELDS.map(() => '?').join(', ')})`)
				.bind(id, ...instBinds({ media_id, sku, instance_date, status }));
		}));
	}
	return ids;
}

export async function createInstance(db, d) {
	const id = uid();
	await db.prepare(`INSERT INTO press_instance (id, ${INST_FIELDS.join(', ')}) VALUES (?, ${INST_FIELDS.map(() => '?').join(', ')})`)
		.bind(id, ...instBinds(d)).run();
	await replaceStatements(db, id, d.statements);
	await replaceProducts(db, id, d.additional_skus);
	await replaceLinks(db, id, d.links);
	return id;
}

export async function updateInstance(db, id, d) {
	await db.prepare(`UPDATE press_instance SET ${INST_FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`)
		.bind(...instBinds(d), id).run();
	if (d.statements) await replaceStatements(db, id, d.statements);
	if (d.additional_skus !== undefined) await replaceProducts(db, id, d.additional_skus);
	if (d.links !== undefined) await replaceLinks(db, id, d.links);
}

export async function deleteInstance(db, id) {
	await db.batch([
		db.prepare('DELETE FROM award_statement WHERE instance_id = ?').bind(id),
		db.prepare('DELETE FROM press_instance_product WHERE instance_id = ?').bind(id),
		db.prepare('DELETE FROM press_instance_link WHERE instance_id = ?').bind(id),
		db.prepare('DELETE FROM press_instance WHERE id = ?').bind(id),
	]);
}

/**
 * Resolve the award / press badges to overlay on a product box, for one or more
 * SKUs. The winner badge shows once the disclosure_date has passed (or none is
 * set); before that the nominee badge shows. Returns a map { sku: [badge, ...] }.
 * `today` is an ISO date string (YYYY-MM-DD).
 */
export async function getBadgesForSkus(db, skus, today) {
	const clean = [...new Set((skus ?? []).filter(Boolean))];
	if (!clean.length) return {};
	const out = {};
	for (const b of chunk(clean, 40)) {
		const rows = (await db.prepare(
			`SELECT s.sku AS sku, i.is_nominated, i.is_winner, i.disclosure_date, i.nominee_badge_key, i.winner_badge_key,
			        i.instance_date, i.created_at,
			        m.name AS media_name, m.badge_placement, m.badge_placement_2,
			        m.badge_pad_top, m.badge_pad_right, m.badge_pad_bottom, m.badge_pad_left, m.badge_size_pct
			 FROM press_instance i
			 JOIN award_media m ON m.id = i.media_id
			 JOIN (
			   SELECT id AS instance_id, sku FROM press_instance WHERE sku IS NOT NULL AND sku != ''
			   UNION ALL
			   SELECT instance_id, sku FROM press_instance_product
			 ) s ON s.instance_id = i.id
			 WHERE s.sku IN (${b.map(() => '?').join(',')})
			 ORDER BY i.instance_date DESC, i.created_at DESC`
		).bind(...b).all()).results ?? [];
		for (const r of rows) {
			const disclosed = !r.disclosure_date || r.disclosure_date <= today;
			const isWinner = !!(r.is_winner && r.winner_badge_key && disclosed);
			const key = isWinner ? r.winner_badge_key : (r.is_nominated ? r.nominee_badge_key : null);
			if (!key) continue;
			(out[r.sku] ??= []).push({
				image_key: key,
				kind: isWinner ? 'winner' : 'nominee',
				media: r.media_name ?? null,
				placement: r.badge_placement || 'bottom-right',
				placement_2: r.badge_placement_2 || null,
				pad: { top: r.badge_pad_top ?? 0, right: r.badge_pad_right ?? 0, bottom: r.badge_pad_bottom ?? 0, left: r.badge_pad_left ?? 0 },
				size_pct: r.badge_size_pct ?? 15
			});
		}
	}
	return out;
}

/** Convenience: badges for a single SKU (array, possibly empty). */
export async function getBadgesForSku(db, sku, today) {
	return (await getBadgesForSkus(db, [sku], today))[sku] ?? [];
}

/** Every instance (newest first) with media info + its review statements. */
export async function listAllInstances(db) {
	// Product name comes ONLY from a matching sales sheet (null → shown as N/A).
	const instances = (await db.prepare(
		`SELECT i.*, m.name AS media_name, m.country AS media_country, m.review_scale,
		        sh.id AS sheet_id,
		        (SELECT t.value FROM translations t
		          WHERE t.sheet_id = sh.id AND t.key = 'product_name' AND t.value != ''
		          ORDER BY CASE t.language WHEN 'en' THEN 0 WHEN 'da' THEN 1 WHEN 'sv' THEN 2 WHEN 'no' THEN 3 ELSE 4 END LIMIT 1) AS product_name
		 FROM press_instance i
		 JOIN award_media m ON m.id = i.media_id
		 LEFT JOIN (SELECT sku, MIN(id) AS id FROM sales_sheets GROUP BY sku) sh ON sh.sku = i.sku
		 ORDER BY i.instance_date DESC, m.name COLLATE NOCASE, i.created_at DESC`
	).all()).results ?? [];
	const stmts = (await db.prepare('SELECT * FROM award_statement ORDER BY rowid').all()).results ?? [];
	const byInst = {};
	for (const s of stmts) (byInst[s.instance_id] ??= []).push(s);
	for (const i of instances) i.statements = byInst[i.id] ?? [];

	// Additional products (product name from the matching sheet, like the main sku).
	const addl = (await db.prepare(
		`SELECT p.instance_id, p.sku, sh.id AS sheet_id,
		        (SELECT t.value FROM translations t
		          WHERE t.sheet_id = sh.id AND t.key = 'product_name' AND t.value != ''
		          ORDER BY CASE t.language WHEN 'en' THEN 0 WHEN 'da' THEN 1 WHEN 'sv' THEN 2 WHEN 'no' THEN 3 ELSE 4 END LIMIT 1) AS product_name
		 FROM press_instance_product p
		 LEFT JOIN (SELECT sku, MIN(id) AS id FROM sales_sheets GROUP BY sku) sh ON sh.sku = p.sku
		 ORDER BY p.rowid`
	).all()).results ?? [];
	const addlByInst = {};
	for (const a of addl) (addlByInst[a.instance_id] ??= []).push({ sku: a.sku, sheet_id: a.sheet_id, product_name: a.product_name });
	for (const i of instances) i.additional_products = addlByInst[i.id] ?? [];

	// Links (url + type) per instance.
	const links = (await db.prepare('SELECT instance_id, type, url, label FROM press_instance_link ORDER BY rowid').all()).results ?? [];
	const linksByInst = {};
	for (const l of links) (linksByInst[l.instance_id] ??= []).push({ type: l.type, url: l.url, label: l.label });
	for (const i of instances) i.links = linksByInst[i.id] ?? [];
	return instances;
}

// ── Public asset library (one media → sections per send-date → products) ─────
const LANG_RANK = { en: 0, da: 1, sv: 2, no: 3 };

/**
 * Build the per-media asset library: every date we sent this media something,
 * and under each date the products sent (main sku + additional products), each
 * resolved to its sales-sheet image assets (3D box, flat front, content images,
 * people-playing images). Used by the public /media/[slug]/[key] page.
 */
export async function getMediaAssetLibrary(db, mediaId) {
	// (date, sku) pairs: main instance skus + additional products.
	const mainRows = (await db.prepare(
		`SELECT instance_date AS date, sku FROM press_instance
		  WHERE media_id = ? AND sku IS NOT NULL AND TRIM(sku) != ''`
	).bind(mediaId).all()).results ?? [];
	const addlRows = (await db.prepare(
		`SELECT i.instance_date AS date, p.sku AS sku
		   FROM press_instance_product p JOIN press_instance i ON i.id = p.instance_id
		  WHERE i.media_id = ? AND p.sku IS NOT NULL AND TRIM(p.sku) != ''`
	).bind(mediaId).all()).results ?? [];

	// date -> ordered unique skus
	const byDate = new Map();
	for (const r of [...mainRows, ...addlRows]) {
		if (!r.date) continue;
		let set = byDate.get(r.date);
		if (!set) { set = new Set(); byDate.set(r.date, set); }
		set.add(r.sku);
	}
	if (!byDate.size) return [];

	const allSkus = [...new Set([...byDate.values()].flatMap((s) => [...s]))];

	// Resolve each sku to its sheet (lowest id per sku, matching the rest of the app).
	const sheetBySku = new Map();
	for (const b of chunk(allSkus, 50)) {
		const rows = (await db.prepare(
			`SELECT id, sku, box_image_key, box_flat_image_key FROM sales_sheets
			  WHERE sku IN (${b.map(() => '?').join(',')}) ORDER BY id`
		).bind(...b).all()).results ?? [];
		for (const r of rows) if (!sheetBySku.has(r.sku)) sheetBySku.set(r.sku, r);
	}

	const sheetIds = [...sheetBySku.values()].map((s) => s.id);
	// Best product name per sheet (en > da > sv > no).
	const nameBySheet = new Map();
	// Content + people-playing images per sheet.
	const contentBySheet = new Map();
	const peopleBySheet = new Map();
	for (const b of chunk(sheetIds, 50)) {
		const ph = b.map(() => '?').join(',');
		const names = (await db.prepare(
			`SELECT sheet_id, value, language FROM translations
			  WHERE sheet_id IN (${ph}) AND key = 'product_name' AND value != ''`
		).bind(...b).all()).results ?? [];
		for (const n of names) {
			const cur = nameBySheet.get(n.sheet_id);
			const rank = LANG_RANK[n.language] ?? 9;
			if (!cur || rank < cur.rank) nameBySheet.set(n.sheet_id, { value: n.value, rank });
		}
		const imgs = (await db.prepare(
			`SELECT sheet_id, r2_key, type FROM sheet_images
			  WHERE sheet_id IN (${ph}) AND type IN ('content','people_playing')
			  ORDER BY display_order ASC, created_at ASC`
		).bind(...b).all()).results ?? [];
		for (const im of imgs) {
			const target = im.type === 'content' ? contentBySheet : peopleBySheet;
			let arr = target.get(im.sheet_id);
			if (!arr) { arr = []; target.set(im.sheet_id, arr); }
			arr.push(im.r2_key);
		}
	}

	function product(sku) {
		const sheet = sheetBySku.get(sku) || null;
		const sid = sheet?.id ?? null;
		const content = sid ? (contentBySheet.get(sid) ?? []) : [];
		const people = sid ? (peopleBySheet.get(sid) ?? []) : [];
		const box3d = sheet?.box_image_key || null;
		const flat = sheet?.box_flat_image_key || null;
		const assets = [
			...(box3d ? [{ group: 'box3d', label: '3D box', key: box3d }] : []),
			...(flat ? [{ group: 'flat', label: 'Flat front', key: flat }] : []),
			...content.map((k, i) => ({ group: 'content', label: `Content ${i + 1}`, key: k })),
			...people.map((k, i) => ({ group: 'people', label: `People playing ${i + 1}`, key: k })),
		];
		return {
			sku,
			name: (sid && nameBySheet.get(sid)?.value) || sku,
			thumb: box3d || flat || content[0] || people[0] || null,
			assets,
			assetCount: assets.length,
		};
	}

	return [...byDate.entries()]
		.sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0)) // newest date first
		.map(([date, skus]) => ({
			date,
			products: [...skus].map(product).sort((a, b) => a.name.localeCompare(b.name)),
		}));
}
