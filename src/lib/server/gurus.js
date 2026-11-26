/**
 * Game Gurus — people we hire to events. Directory, per-event proposals/attendance,
 * and an internal rating. Uses the DB binding; guru photos live in the IMAGES R2
 * bucket under gurus/. Proposal accept/decline is via event_guru.proposal_token.
 */

function uid() { return crypto.randomUUID(); }
function token() {
	const b = crypto.getRandomValues(new Uint8Array(24));
	return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── Directory ─────────────────────────────────────────────────────────────────

export async function listGurus(db) {
	const rows = await db.prepare(
		`SELECT g.*, (SELECT COUNT(*) FROM event_guru eg WHERE eg.guru_id = g.id AND eg.status IN ('accepted','confirmed')) AS event_count,
		        (SELECT AVG(eg.rating) FROM event_guru eg WHERE eg.guru_id = g.id AND eg.rating IS NOT NULL) AS rating_avg,
		        (SELECT COUNT(*) FROM event_guru eg WHERE eg.guru_id = g.id AND eg.rating IS NOT NULL) AS rating_count
		 FROM guru g ORDER BY g.name COLLATE NOCASE`
	).all();
	return rows.results ?? [];
}

export async function getGuru(db, id) {
	const guru = await db.prepare('SELECT * FROM guru WHERE id = ?').bind(id).first();
	if (!guru) return null;
	const events = await db.prepare(
		`SELECT e.id, e.title, e.event_date, eg.status
		 FROM event_guru eg JOIN event e ON e.id = eg.event_id
		 WHERE eg.guru_id = ? ORDER BY e.event_date DESC`
	).bind(id).all();
	return { ...guru, events: events.results ?? [] };
}

export async function createGuru(db, patch) {
	const id = uid();
	await db.prepare('INSERT INTO guru (id, name, phone, email, zip, city, country, in_email_flow) VALUES (?,?,?,?,?,?,?,?)')
		.bind(id, patch.name ?? 'New guru', patch.phone ?? null, patch.email ?? null, patch.zip ?? null, patch.city ?? null, patch.country ?? null, patch.in_email_flow === false ? 0 : 1)
		.run();
	return id;
}

export async function updateGuru(db, id, patch) {
	const cols = { name: 1, phone: 1, email: 1, zip: 1, city: 1, country: 1, image_key: 1, in_email_flow: 1, notes: 1, active: 1 };
	const boolCols = { in_email_flow: 1, active: 1 };
	const fields = [], values = [];
	for (const [k, v] of Object.entries(patch)) {
		if (!cols[k]) continue;
		fields.push(`${k} = ?`);
		values.push(boolCols[k] ? (v ? 1 : 0) : (v === '' ? null : v));
	}
	if (!fields.length) return;
	values.push(id);
	await db.prepare(`UPDATE guru SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
}

export async function deleteGuru(db, id) {
	await db.batch([
		db.prepare('DELETE FROM event_guru WHERE guru_id = ?').bind(id),
		db.prepare('DELETE FROM guru WHERE id = ?').bind(id),
	]);
}

// ── Event ↔ gurus (proposals / attendance) ───────────────────────────────────

/** Gurus attached to an event, with their details + proposal status + per-event flow. */
export async function listEventGurus(db, eventId) {
	const rows = await db.prepare(
		`SELECT g.*, eg.status, eg.proposal_token, eg.responded_at, eg.in_email_flow AS event_flow, eg.rating AS event_rating, eg.rating_note AS event_note, eg.opening_id, eg.sent_at
		 FROM event_guru eg JOIN guru g ON g.id = eg.guru_id
		 WHERE eg.event_id = ? ORDER BY g.name COLLATE NOCASE`
	).bind(eventId).all();
	return rows.results ?? [];
}

/** Attach gurus to an event as proposals (status 'invited' + token, default in flow). Idempotent. */
export async function addEventGurus(db, eventId, guruIds) {
	const clean = [...new Set((guruIds ?? []).map(String))];
	if (!clean.length) return;
	const stmts = clean.map((gid) =>
		db.prepare(
			`INSERT INTO event_guru (event_id, guru_id, status, proposal_token, in_email_flow) VALUES (?,?, 'invited', ?, 1)
			 ON CONFLICT(event_id, guru_id) DO NOTHING`
		).bind(eventId, gid, token())
	);
	await db.batch(stmts);
}

export async function removeEventGuru(db, eventId, guruId) {
	await db.prepare('DELETE FROM event_guru WHERE event_id = ? AND guru_id = ?').bind(eventId, guruId).run();
}

export async function setEventGuruStatus(db, eventId, guruId, status) {
	await db.prepare('UPDATE event_guru SET status = ?, responded_at = datetime(\'now\') WHERE event_id = ? AND guru_id = ?')
		.bind(status, eventId, guruId).run();
}

/** Per-event rating (1–5, or null to clear) for a guru. */
export async function setEventGuruRating(db, eventId, guruId, rating) {
	await db.prepare('UPDATE event_guru SET rating = ? WHERE event_id = ? AND guru_id = ?')
		.bind(rating, eventId, guruId).run();
}

/** Per-event internal note on a guru (null/blank clears it). */
export async function setEventGuruNote(db, eventId, guruId, note) {
	const v = typeof note === 'string' && note.trim() ? note.trim() : null;
	await db.prepare('UPDATE event_guru SET rating_note = ? WHERE event_id = ? AND guru_id = ?')
		.bind(v, eventId, guruId).run();
}

/** Per-event email-flow toggle for a guru. */
export async function setEventGuruFlow(db, eventId, guruId, val) {
	await db.prepare('UPDATE event_guru SET in_email_flow = ? WHERE event_id = ? AND guru_id = ?')
		.bind(val ? 1 : 0, eventId, guruId).run();
}

// ── Tender openings (e.g. 2 × Strategi, 1 × Familie) ──────────────────────────

const BOOKED = "('accepted','confirmed')";

/** Openings for an event with how many spots are taken. */
export async function listOpenings(db, eventId) {
	const rows = await db.prepare(
		`SELECT o.*, (SELECT COUNT(*) FROM event_guru eg WHERE eg.opening_id = o.id AND eg.status IN ${BOOKED}) AS filled
		 FROM event_guru_opening o WHERE o.event_id = ? ORDER BY o.position, o.created_at`
	).bind(eventId).all();
	return rows.results ?? [];
}

export async function createOpening(db, eventId, { label, slots }) {
	const id = uid();
	await db.prepare(
		`INSERT INTO event_guru_opening (id, event_id, label, slots, position)
		 VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM event_guru_opening WHERE event_id = ?))`
	).bind(id, eventId, cleanLabel(label), clampSlots(slots), eventId).run();
	return id;
}

export async function updateOpening(db, eventId, id, patch) {
	const fields = [], values = [];
	if ('label' in patch) { fields.push('label = ?'); values.push(cleanLabel(patch.label)); }
	if ('slots' in patch) { fields.push('slots = ?'); values.push(clampSlots(patch.slots)); }
	if (!fields.length) return;
	values.push(id, eventId);
	await db.prepare(`UPDATE event_guru_opening SET ${fields.join(', ')} WHERE id = ? AND event_id = ?`).bind(...values).run();
}

/** Delete an opening; gurus booked on it stay on the event but lose the opening link. */
export async function deleteOpening(db, eventId, id) {
	await db.batch([
		db.prepare('UPDATE event_guru SET opening_id = NULL WHERE opening_id = ? AND event_id = ?').bind(id, eventId),
		db.prepare('DELETE FROM event_guru_opening WHERE id = ? AND event_id = ?').bind(id, eventId),
	]);
}

function cleanLabel(l) { return typeof l === 'string' && l.trim() ? l.trim().slice(0, 80) : null; }
function clampSlots(n) { const v = Math.round(Number(n)); return Number.isFinite(v) ? Math.min(Math.max(v, 1), 50) : 1; }

/** Mark gurus as sent now (tender e-mail went out). */
export async function markSent(db, eventId, guruIds) {
	if (!guruIds.length) return;
	await db.batch(guruIds.map((gid) =>
		db.prepare("UPDATE event_guru SET sent_at = datetime('now') WHERE event_id = ? AND guru_id = ?").bind(eventId, gid)
	));
}

// ── Public proposal / tender (via the guru's personal token) ───────────────────

export async function getProposalByToken(db, tok) {
	return db.prepare(
		`SELECT eg.status, eg.event_id, eg.guru_id, eg.responded_at, eg.opening_id,
		        g.name AS guru_name,
		        e.title AS event_title, e.event_date, e.end_date, e.start_time, e.end_time, e.status AS event_status,
		        v.name AS venue_name, v.address AS venue_address, v.zip AS venue_zip, v.city AS venue_city, v.country AS venue_country
		 FROM event_guru eg
		 JOIN guru g ON g.id = eg.guru_id
		 JOIN event e ON e.id = eg.event_id
		 LEFT JOIN venue v ON v.id = e.venue_id
		 WHERE eg.proposal_token = ?`
	).bind(tok).first();
}

/**
 * Guru responds via their token.
 *  - 'declined': frees any spot they held.
 *  - 'accepted' + openingId: takes that spot if one is still free (atomic —
 *    first come first served). Returns { status: 'full' } when it was taken.
 *  - 'accepted' without openingId: only for events without openings (old flow).
 */
export async function respondProposal(db, tok, status, openingId = null) {
	if (status !== 'accepted') {
		await db.prepare("UPDATE event_guru SET status = 'declined', opening_id = NULL, responded_at = datetime('now') WHERE proposal_token = ?")
			.bind(tok).run();
		return { status: 'declined', opening_id: null };
	}
	if (!openingId) {
		await db.prepare("UPDATE event_guru SET status = 'accepted', responded_at = datetime('now') WHERE proposal_token = ?").bind(tok).run();
		return { status: 'accepted', opening_id: null };
	}
	// One statement = atomic in D1: only succeeds while the opening (on this
	// guru's event) still has a free spot. A guru switching spots frees the old one.
	const r = await db.prepare(
		`UPDATE event_guru SET status = 'accepted', opening_id = ?1, responded_at = datetime('now')
		 WHERE proposal_token = ?2
		   AND EXISTS (SELECT 1 FROM event_guru_opening o WHERE o.id = ?1 AND o.event_id = event_guru.event_id)
		   AND (SELECT COUNT(*) FROM event_guru x
		        WHERE x.opening_id = ?1 AND x.status IN ${BOOKED} AND x.proposal_token <> ?2)
		       < (SELECT slots FROM event_guru_opening WHERE id = ?1)`
	).bind(openingId, tok).run();
	if (!r.meta?.changes) return { status: 'full', opening_id: null };
	return { status: 'accepted', opening_id: openingId };
}
