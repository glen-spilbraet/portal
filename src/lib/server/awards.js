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
function badgeBinds(d) {
	return [
		PLACEMENTS.includes(d.badge_placement) ? d.badge_placement : 'bottom-right',
		d.badge_pad_x ? 1 : 0,
		d.badge_pad_y ? 1 : 0,
		Number(d.badge_size_pct) || 15,
		Number(d.badge_pad_pct) || 3,
	];
}

export async function createMedia(db, d) {
	const id = uid();
	await db.prepare('INSERT INTO award_media (id, name, country, review_scale, notes, badge_placement, badge_pad_x, badge_pad_y, badge_size_pct, badge_pad_pct) VALUES (?,?,?,?,?,?,?,?,?,?)')
		.bind(id, d.name, d.country || null, d.review_scale ? Number(d.review_scale) : null, d.notes || null, ...badgeBinds(d)).run();
	await replaceContacts(db, id, d.contacts);
	return id;
}

export async function updateMedia(db, id, d) {
	await db.prepare('UPDATE award_media SET name = ?, country = ?, review_scale = ?, notes = ?, badge_placement = ?, badge_pad_x = ?, badge_pad_y = ?, badge_size_pct = ?, badge_pad_pct = ? WHERE id = ?')
		.bind(d.name, d.country || null, d.review_scale ? Number(d.review_scale) : null, d.notes || null, ...badgeBinds(d), id).run();
	if (d.contacts) await replaceContacts(db, id, d.contacts);
}

export async function deleteMedia(db, id) {
	await db.batch([
		db.prepare('DELETE FROM award_statement WHERE instance_id IN (SELECT id FROM press_instance WHERE media_id = ?)').bind(id),
		db.prepare('DELETE FROM press_instance WHERE media_id = ?').bind(id),
		db.prepare('DELETE FROM award_media_contact WHERE media_id = ?').bind(id),
		db.prepare('DELETE FROM award_media WHERE id = ?').bind(id),
	]);
}

// ── Instances ────────────────────────────────────────────────────────────
const INST_FIELDS = ['media_id', 'sku', 'award_category', 'is_nominated', 'is_winner', 'disclosure_date', 'instance_date', 'proof_url', 'proof_key', 'nominee_badge_key', 'winner_badge_key', 'notes'];

async function replaceStatements(db, instanceId, statements) {
	await db.prepare('DELETE FROM award_statement WHERE instance_id = ?').bind(instanceId).run();
	const valid = (statements ?? []).filter((s) => s && (s.statement || s.score != null && s.score !== ''));
	for (const b of chunk(valid, 20)) {
		await db.batch(b.map((s) => db.prepare(
			'INSERT INTO award_statement (id, instance_id, statement, score) VALUES (?,?,?,?)'
		).bind(uid(), instanceId, s.statement || null, s.score === '' || s.score == null ? null : Number(s.score))));
	}
}

function instBinds(d) {
	return [d.media_id, d.sku || null, d.award_category || null,
		d.is_nominated ? 1 : 0, d.is_winner ? 1 : 0, d.disclosure_date || null, d.instance_date || null,
		d.proof_url || null, d.proof_key || null, d.nominee_badge_key || null, d.winner_badge_key || null, d.notes || null];
}

/** Set the same instance_date on many instances (edit a whole block's date). */
export async function setInstancesDate(db, ids, date) {
	const clean = (ids ?? []).filter(Boolean);
	if (!clean.length) return;
	for (const b of chunk(clean, 25)) {
		await db.batch(b.map((id) => db.prepare('UPDATE press_instance SET instance_date = ? WHERE id = ?').bind(date || null, id)));
	}
}

export async function createInstance(db, d) {
	const id = uid();
	await db.prepare(`INSERT INTO press_instance (id, ${INST_FIELDS.join(', ')}) VALUES (?, ${INST_FIELDS.map(() => '?').join(', ')})`)
		.bind(id, ...instBinds(d)).run();
	await replaceStatements(db, id, d.statements);
	return id;
}

export async function updateInstance(db, id, d) {
	await db.prepare(`UPDATE press_instance SET ${INST_FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`)
		.bind(...instBinds(d), id).run();
	if (d.statements) await replaceStatements(db, id, d.statements);
}

export async function deleteInstance(db, id) {
	await db.batch([
		db.prepare('DELETE FROM award_statement WHERE instance_id = ?').bind(id),
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
			`SELECT i.sku, i.is_winner, i.disclosure_date, i.nominee_badge_key, i.winner_badge_key,
			        i.instance_date, i.created_at,
			        m.badge_placement, m.badge_pad_x, m.badge_pad_y, m.badge_size_pct, m.badge_pad_pct
			 FROM press_instance i JOIN award_media m ON m.id = i.media_id
			 WHERE i.sku IN (${b.map(() => '?').join(',')})
			 ORDER BY i.instance_date DESC, i.created_at DESC`
		).bind(...b).all()).results ?? [];
		for (const r of rows) {
			const disclosed = !r.disclosure_date || r.disclosure_date <= today;
			const key = (r.is_winner && r.winner_badge_key && disclosed) ? r.winner_badge_key : r.nominee_badge_key;
			if (!key) continue;
			(out[r.sku] ??= []).push({
				image_key: key,
				placement: r.badge_placement || 'bottom-right',
				pad_x: !!r.badge_pad_x, pad_y: !!r.badge_pad_y,
				size_pct: r.badge_size_pct ?? 15, pad_pct: r.badge_pad_pct ?? 3
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
		 LEFT JOIN sales_sheets sh ON sh.sku = i.sku
		 ORDER BY i.instance_date DESC, m.name COLLATE NOCASE, i.created_at DESC`
	).all()).results ?? [];
	const stmts = (await db.prepare('SELECT * FROM award_statement ORDER BY rowid').all()).results ?? [];
	const byInst = {};
	for (const s of stmts) (byInst[s.instance_id] ??= []).push(s);
	for (const i of instances) i.statements = byInst[i.id] ?? [];
	return instances;
}
