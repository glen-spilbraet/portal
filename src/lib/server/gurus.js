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
		`SELECT g.*, (SELECT COUNT(*) FROM event_guru eg WHERE eg.guru_id = g.id AND eg.status IN ('accepted','confirmed')) AS event_count
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
	const cols = { name: 1, phone: 1, email: 1, zip: 1, city: 1, country: 1, image_key: 1, rating: 1, in_email_flow: 1, notes: 1, active: 1 };
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

/** Gurus attached to an event, with their details + proposal status. */
export async function listEventGurus(db, eventId) {
	const rows = await db.prepare(
		`SELECT eg.status, eg.proposal_token, eg.responded_at, g.*
		 FROM event_guru eg JOIN guru g ON g.id = eg.guru_id
		 WHERE eg.event_id = ? ORDER BY g.name COLLATE NOCASE`
	).bind(eventId).all();
	return rows.results ?? [];
}

/** Attach gurus to an event as proposals (status 'invited' + token). Idempotent. */
export async function addEventGurus(db, eventId, guruIds) {
	const clean = [...new Set((guruIds ?? []).map(String))];
	if (!clean.length) return;
	const stmts = clean.map((gid) =>
		db.prepare(
			`INSERT INTO event_guru (event_id, guru_id, status, proposal_token) VALUES (?,?, 'invited', ?)
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

// ── Public proposal (accept / decline via token) ──────────────────────────────

export async function getProposalByToken(db, tok) {
	return db.prepare(
		`SELECT eg.status, eg.event_id, eg.guru_id, eg.responded_at,
		        g.name AS guru_name,
		        e.title AS event_title, e.event_date, e.start_time, e.end_time,
		        v.name AS venue_name, v.address AS venue_address, v.zip AS venue_zip, v.city AS venue_city
		 FROM event_guru eg
		 JOIN guru g ON g.id = eg.guru_id
		 JOIN event e ON e.id = eg.event_id
		 LEFT JOIN venue v ON v.id = e.venue_id
		 WHERE eg.proposal_token = ?`
	).bind(tok).first();
}

/** Guru responds to a proposal: 'accepted' | 'declined'. */
export async function respondProposal(db, tok, status) {
	const s = status === 'accepted' ? 'accepted' : 'declined';
	await db.prepare("UPDATE event_guru SET status = ?, responded_at = datetime('now') WHERE proposal_token = ?")
		.bind(s, tok).run();
	return s;
}
