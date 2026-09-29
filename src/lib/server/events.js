/**
 * Event management data layer (venues, contacts, event types, events, event↔SKU
 * links, event assets). All queries run against the `DB` binding. Venue-facing
 * access is via `event.share_token` (unguessable), resolved by getEventByToken.
 */

function uid() { return crypto.randomUUID(); }

/** URL-safe random token for the public venue page. */
function makeShareToken() {
	const bytes = crypto.getRandomValues(new Uint8Array(24));
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── Venues ───────────────────────────────────────────────────────────────────

export async function listVenues(db) {
	const rows = await db.prepare(
		`SELECT v.*, (SELECT COUNT(*) FROM event e WHERE e.venue_id = v.id) AS event_count,
		        (SELECT COUNT(*) FROM venue_contact c WHERE c.venue_id = v.id) AS contact_count
		 FROM venue v ORDER BY v.name COLLATE NOCASE`
	).all();
	return rows.results ?? [];
}

export async function getVenue(db, id) {
	const venue = await db.prepare('SELECT * FROM venue WHERE id = ?').bind(id).first();
	if (!venue) return null;
	const contacts = await db.prepare('SELECT * FROM venue_contact WHERE venue_id = ? ORDER BY created_at').bind(id).all();
	return { ...venue, contacts: contacts.results ?? [] };
}

export async function createVenue(db, { name, address, city, country, notes }) {
	const id = uid();
	await db.prepare('INSERT INTO venue (id, name, address, city, country, notes) VALUES (?,?,?,?,?,?)')
		.bind(id, name, address ?? null, city ?? null, country ?? null, notes ?? null).run();
	return id;
}

export async function updateVenue(db, id, patch) {
	const allowed = ['name', 'address', 'city', 'country', 'notes'];
	const fields = [], values = [];
	for (const k of allowed) if (k in patch) { fields.push(`${k} = ?`); values.push(patch[k] ?? null); }
	if (!fields.length) return;
	values.push(id);
	await db.prepare(`UPDATE venue SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
}

export async function deleteVenue(db, id) {
	await db.batch([
		db.prepare('DELETE FROM venue_contact WHERE venue_id = ?').bind(id),
		db.prepare('UPDATE event SET venue_id = NULL WHERE venue_id = ?').bind(id),
		db.prepare('DELETE FROM venue WHERE id = ?').bind(id),
	]);
}

// ── Venue contacts ─────────────────────────────────────────────────────────────

export async function addContact(db, venueId, { name, phone, email, role }) {
	const id = uid();
	await db.prepare('INSERT INTO venue_contact (id, venue_id, name, phone, email, role) VALUES (?,?,?,?,?,?)')
		.bind(id, venueId, name ?? null, phone ?? null, email ?? null, role ?? null).run();
	return id;
}

export async function updateContact(db, id, patch) {
	const allowed = ['name', 'phone', 'email', 'role'];
	const fields = [], values = [];
	for (const k of allowed) if (k in patch) { fields.push(`${k} = ?`); values.push(patch[k] ?? null); }
	if (!fields.length) return;
	values.push(id);
	await db.prepare(`UPDATE venue_contact SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
}

export async function deleteContact(db, id) {
	await db.prepare('DELETE FROM venue_contact WHERE id = ?').bind(id).run();
}

// ── Event types ────────────────────────────────────────────────────────────────

export async function listEventTypes(db) {
	const rows = await db.prepare('SELECT * FROM event_type ORDER BY name COLLATE NOCASE').all();
	return rows.results ?? [];
}

export async function createEventType(db, name) {
	const id = uid();
	await db.prepare('INSERT INTO event_type (id, name) VALUES (?, ?)').bind(id, name).run();
	return id;
}

/** Rename a type. The id is unchanged, so events keep their link. */
export async function updateEventType(db, id, name) {
	await db.prepare('UPDATE event_type SET name = ? WHERE id = ?').bind(name, id).run();
}

export async function deleteEventType(db, id) {
	await db.batch([
		db.prepare('UPDATE event SET type_id = NULL WHERE type_id = ?').bind(id),
		db.prepare('DELETE FROM event_type WHERE id = ?').bind(id),
	]);
}

// ── Events ─────────────────────────────────────────────────────────────────────

export async function listEvents(db) {
	const rows = await db.prepare(
		`SELECT e.*, v.name AS venue_name, t.name AS type_name,
		        (SELECT COUNT(*) FROM event_sku s WHERE s.event_id = e.id) AS sku_count,
		        (SELECT COUNT(*) FROM event_asset a WHERE a.event_id = e.id) AS asset_count
		 FROM event e
		 LEFT JOIN venue v ON v.id = e.venue_id
		 LEFT JOIN event_type t ON t.id = e.type_id
		 ORDER BY e.event_date DESC, e.created_at DESC`
	).all();
	return rows.results ?? [];
}

export async function getEvent(db, id) {
	const event = await db.prepare(
		`SELECT e.*, v.name AS venue_name, t.name AS type_name
		 FROM event e LEFT JOIN venue v ON v.id = e.venue_id LEFT JOIN event_type t ON t.id = e.type_id
		 WHERE e.id = ?`
	).bind(id).first();
	if (!event) return null;
	const [skus, assets] = await Promise.all([
		db.prepare('SELECT sku FROM event_sku WHERE event_id = ? ORDER BY sort, sku').bind(id).all(),
		db.prepare('SELECT * FROM event_asset WHERE event_id = ? ORDER BY created_at').bind(id).all(),
	]);
	return {
		...event,
		skus: (skus.results ?? []).map((r) => r.sku),
		assets: assets.results ?? [],
	};
}

export async function getEventByToken(db, token) {
	const event = await db.prepare(
		`SELECT e.*, v.name AS venue_name, v.address AS venue_address, t.name AS type_name
		 FROM event e LEFT JOIN venue v ON v.id = e.venue_id LEFT JOIN event_type t ON t.id = e.type_id
		 WHERE e.share_token = ?`
	).bind(token).first();
	if (!event) return null;
	const [skus, assets] = await Promise.all([
		db.prepare('SELECT sku FROM event_sku WHERE event_id = ? ORDER BY sort, sku').bind(event.id).all(),
		db.prepare('SELECT * FROM event_asset WHERE event_id = ? ORDER BY created_at').bind(event.id).all(),
	]);
	return {
		...event,
		skus: (skus.results ?? []).map((r) => r.sku),
		assets: assets.results ?? [],
	};
}

export async function createEvent(db, patch) {
	const id = uid();
	const share_token = makeShareToken();
	await db.prepare(
		`INSERT INTO event (id, venue_id, type_id, title, event_date, start_time, end_time,
		                    entry_fee, participants_expected, participants_actual, status, share_token, notes)
		 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
	).bind(
		id, patch.venue_id ?? null, patch.type_id ?? null, patch.title ?? null,
		patch.event_date ?? null, patch.start_time ?? null, patch.end_time ?? null,
		patch.entry_fee ?? null, patch.participants_expected ?? null, patch.participants_actual ?? null,
		patch.status ?? 'planned', share_token, patch.notes ?? null
	).run();
	return id;
}

export async function updateEvent(db, id, patch) {
	const allowed = ['venue_id', 'type_id', 'title', 'event_date', 'start_time', 'end_time',
		'entry_fee', 'participants_expected', 'participants_actual', 'status', 'notes'];
	const fields = [], values = [];
	for (const k of allowed) if (k in patch) { fields.push(`${k} = ?`); values.push(patch[k] === '' ? null : patch[k]); }
	if (!fields.length) return;
	values.push(id);
	await db.prepare(`UPDATE event SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
}

export async function deleteEvent(db, id) {
	await db.batch([
		db.prepare('DELETE FROM event_sku WHERE event_id = ?').bind(id),
		db.prepare('DELETE FROM event_asset WHERE event_id = ?').bind(id),
		db.prepare('DELETE FROM event WHERE id = ?').bind(id),
	]);
}

/** Rotate the share token (invalidates the old venue link). */
export async function rotateShareToken(db, id) {
	const token = makeShareToken();
	await db.prepare('UPDATE event SET share_token = ? WHERE id = ?').bind(token, id).run();
	return token;
}

// ── Event ↔ SKU links ────────────────────────────────────────────────────────

/** Replace the full SKU set for an event (ordered). */
export async function setEventSkus(db, eventId, skus) {
	const clean = [...new Set((skus ?? []).map((s) => String(s).trim()).filter(Boolean))];
	const stmts = [db.prepare('DELETE FROM event_sku WHERE event_id = ?').bind(eventId)];
	clean.forEach((sku, i) => {
		stmts.push(db.prepare('INSERT INTO event_sku (event_id, sku, sort) VALUES (?,?,?)').bind(eventId, sku, i));
	});
	await db.batch(stmts);
}

// ── Event assets ───────────────────────────────────────────────────────────────

/**
 * @param {any} db
 * @param {string} eventId
 * @param {{ category?: string, kind?: string, r2_key: string, filename?: string|null, content_type?: string|null, size?: number|null, source?: string, uploaded_by?: string|null, shared_with_venue?: boolean }} opts
 */
export async function addAsset(db, eventId, opts) {
	const { category, kind, r2_key, filename, content_type, size, source, uploaded_by, shared_with_venue } = opts;
	const id = uid();
	await db.prepare(
		`INSERT INTO event_asset (id, event_id, category, kind, r2_key, filename, content_type, size, source, shared_with_venue, uploaded_by)
		 VALUES (?,?,?,?,?,?,?,?,?,?,?)`
	).bind(
		id, eventId, category ?? 'media', kind ?? 'file', r2_key, filename ?? null,
		content_type ?? null, size ?? null, source ?? 'internal',
		shared_with_venue === false ? 0 : 1, uploaded_by ?? null
	).run();
	return id;
}

export async function getAsset(db, id) {
	return db.prepare('SELECT * FROM event_asset WHERE id = ?').bind(id).first();
}

export async function deleteAsset(db, id) {
	await db.prepare('DELETE FROM event_asset WHERE id = ?').bind(id).run();
}
