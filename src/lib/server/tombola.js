/**
 * Event Tombola data layer (DB binding). One tombola per event, reached publicly
 * via a short code (/tombola/<code>). Nothing here ever deletes participant data:
 * shoutouts are hidden (not deleted) and winners are recorded once per person.
 */

const uid = () => crypto.randomUUID();

// No 0/O/1/I/L — easy to read off a screen and type.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function makeCode(len = 6) {
	const bytes = crypto.getRandomValues(new Uint8Array(len));
	return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
function makeDeviceToken() {
	const bytes = crypto.getRandomValues(new Uint8Array(24));
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const LIMITS = { name: 40, email: 120, zip: 12, shout: 120 };
/** Seconds between two shoutouts from the same phone. */
export const SHOUT_COOLDOWN = 10;

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// ── Tombola ──────────────────────────────────────────────────────────────────

export async function getTombolaForEvent(db, eventId) {
	return db.prepare('SELECT * FROM tombola WHERE event_id = ?').bind(eventId).first();
}

/** Tombola + its event (title/date/venue) by public code. */
export async function getTombolaByCode(db, code) {
	return db.prepare(
		`SELECT t.*, e.title AS event_title, e.event_date, v.name AS venue_name
		 FROM tombola t LEFT JOIN event e ON e.id = t.event_id LEFT JOIN venue v ON v.id = e.venue_id
		 WHERE t.code = ?`
	).bind(String(code ?? '').toUpperCase()).first();
}

/** Create the event's tombola (idempotent — returns the existing one). */
export async function ensureTombola(db, eventId, email) {
	const existing = await getTombolaForEvent(db, eventId);
	if (existing) return existing;
	for (let i = 0; i < 5; i++) {
		try {
			await db.prepare('INSERT INTO tombola (id, event_id, code, created_by) VALUES (?,?,?,?)')
				.bind(uid(), eventId, makeCode(), email ?? null).run();
			break;
		} catch (e) {
			// Code collision → retry; a parallel create for the same event → fall through.
			if (await getTombolaForEvent(db, eventId)) break;
			if (i === 4) throw e;
		}
	}
	return getTombolaForEvent(db, eventId);
}

export async function setTombolaStatus(db, tombolaId, status) {
	if (status !== 'open' && status !== 'closed') throw new Error('Bad status');
	await db.prepare(`UPDATE tombola SET status = ?, closed_at = CASE WHEN ? = 'closed' THEN datetime('now') ELSE NULL END WHERE id = ?`)
		.bind(status, status, tombolaId).run();
}

export async function tombolaStats(db, tombolaId) {
	const r = await db.prepare(
		`SELECT (SELECT COUNT(*) FROM tombola_entry WHERE tombola_id = ?1) AS entries,
		        (SELECT COUNT(*) FROM tombola_winner WHERE tombola_id = ?1) AS winners,
		        (SELECT COUNT(*) FROM tombola_shoutout WHERE tombola_id = ?1) AS shoutouts`
	).bind(tombolaId).first();
	return { entries: r?.entries ?? 0, winners: r?.winners ?? 0, shoutouts: r?.shoutouts ?? 0 };
}

// ── Entries (public) ─────────────────────────────────────────────────────────

/**
 * Sign up. Returns { entry, token } or { error }. The same email can join a
 * tombola once; a repeat sign-up does NOT hand out the original phone's token
 * (that would let anyone post shoutouts in someone else's name).
 */
export async function joinTombola(db, tombola, input, userAgent) {
	if (tombola.status !== 'open') return { error: 'closed' };
	const first_name = clean(input.first_name, LIMITS.name);
	const last_name = clean(input.last_name, LIMITS.name);
	const email = clean(input.email, LIMITS.email).toLowerCase();
	const zip = clean(input.zip, LIMITS.zip);
	if (!first_name || !last_name || !email || !zip) return { error: 'missing' };
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: 'email' };
	if (!input.consent) return { error: 'consent' };

	const dupe = await db.prepare('SELECT id FROM tombola_entry WHERE tombola_id = ? AND email = ?').bind(tombola.id, email).first();
	if (dupe) return { error: 'duplicate' };

	const id = uid(), token = makeDeviceToken();
	try {
		await db.prepare(
			`INSERT INTO tombola_entry (id, tombola_id, first_name, last_name, email, zip, device_token, consent, user_agent)
			 VALUES (?,?,?,?,?,?,?,1,?)`
		).bind(id, tombola.id, first_name, last_name, email, zip, token, String(userAgent ?? '').slice(0, 250)).run();
	} catch {
		return { error: 'duplicate' }; // UNIQUE(tombola_id, email) race
	}
	return { entry: { id, first_name, last_name }, token };
}

/** The phone's own entry (by its device token), scoped to this tombola. */
export async function getEntryByToken(db, tombolaId, token) {
	if (!token) return null;
	return db.prepare(
		`SELECT e.id, e.first_name, e.last_name, e.created_at,
		        (SELECT drawn_at FROM tombola_winner w WHERE w.entry_id = e.id) AS won_at
		 FROM tombola_entry e WHERE e.tombola_id = ? AND e.device_token = ?`
	).bind(tombolaId, String(token)).first();
}

export async function listOwnShoutouts(db, entryId) {
	const r = await db.prepare('SELECT id, message, created_at FROM tombola_shoutout WHERE entry_id = ? ORDER BY created_at DESC LIMIT 20').bind(entryId).all();
	return r.results ?? [];
}

/** Post a shoutout. Returns { shout } or { error }. */
export async function addShoutout(db, tombola, entry, message) {
	const msg = clean(message, LIMITS.shout);
	if (!msg) return { error: 'empty' };
	const last = await db.prepare(
		`SELECT CAST(strftime('%s','now') - strftime('%s', MAX(created_at)) AS INTEGER) AS ago FROM tombola_shoutout WHERE entry_id = ?`
	).bind(entry.id).first();
	if (last?.ago != null && last.ago < SHOUT_COOLDOWN) return { error: 'cooldown', wait: SHOUT_COOLDOWN - last.ago };
	const id = uid();
	await db.prepare('INSERT INTO tombola_shoutout (id, tombola_id, entry_id, message) VALUES (?,?,?,?)').bind(id, tombola.id, entry.id, msg).run();
	return { shout: { id, message: msg } };
}

// ── Board (internal) ─────────────────────────────────────────────────────────

/**
 * Everything the big screen needs that changed since `since` (D1 datetime
 * string; inclusive — the client de-dupes by id). Never returns email or zip.
 */
export async function boardFeed(db, tombolaId, since) {
	const s = since || '1970-01-01 00:00:00';
	const [t, entries, shouts, winners, count] = await db.batch([
		db.prepare('SELECT status FROM tombola WHERE id = ?').bind(tombolaId),
		db.prepare('SELECT id, first_name, last_name, created_at FROM tombola_entry WHERE tombola_id = ? AND created_at >= ? ORDER BY created_at').bind(tombolaId, s),
		db.prepare(
			`SELECT s.id, s.entry_id, s.message, s.created_at, e.first_name, e.last_name
			 FROM tombola_shoutout s JOIN tombola_entry e ON e.id = s.entry_id
			 WHERE s.tombola_id = ? AND s.hidden = 0 AND s.created_at >= ? ORDER BY s.created_at`
		).bind(tombolaId, s),
		db.prepare(
			`SELECT w.id, w.entry_id, w.drawn_at, e.first_name, e.last_name
			 FROM tombola_winner w JOIN tombola_entry e ON e.id = w.entry_id
			 WHERE w.tombola_id = ? ORDER BY w.drawn_at`
		).bind(tombolaId),
		db.prepare('SELECT COUNT(*) AS n FROM tombola_entry WHERE tombola_id = ?').bind(tombolaId),
	]);
	const now = await db.prepare(`SELECT datetime('now') AS now`).first();
	return {
		status: t.results?.[0]?.status ?? 'closed',
		count: count.results?.[0]?.n ?? 0,
		entries: entries.results ?? [],
		shoutouts: shouts.results ?? [],
		winners: winners.results ?? [],
		now: now?.now,
	};
}

/**
 * Draw a winner at random among entries that haven't won yet. Uses
 * crypto randomness server-side; the board only animates the result.
 * Returns the winner (names only) or null when everyone has won.
 */
export async function drawWinner(db, tombolaId, drawnBy) {
	const pool = await db.prepare(
		`SELECT id, first_name, last_name FROM tombola_entry
		 WHERE tombola_id = ? AND id NOT IN (SELECT entry_id FROM tombola_winner WHERE tombola_id = ?)`
	).bind(tombolaId, tombolaId).all();
	const list = pool.results ?? [];
	if (!list.length) return null;
	const rnd = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
	const pick = list[Math.floor(rnd * list.length)];
	const id = uid();
	await db.prepare('INSERT INTO tombola_winner (id, tombola_id, entry_id, drawn_by) VALUES (?,?,?,?)').bind(id, tombolaId, pick.id, drawnBy ?? null).run();
	return { id, entry_id: pick.id, first_name: pick.first_name, last_name: pick.last_name, remaining: list.length - 1 };
}

// ── Admin (internal) ─────────────────────────────────────────────────────────

/** Full participant list (with email/zip) for the admin table + CSV export. */
export async function listEntriesAdmin(db, tombolaId) {
	const r = await db.prepare(
		`SELECT e.id, e.first_name, e.last_name, e.email, e.zip, e.created_at,
		        w.drawn_at AS won_at,
		        (SELECT COUNT(*) FROM tombola_shoutout s WHERE s.entry_id = e.id) AS shoutouts
		 FROM tombola_entry e LEFT JOIN tombola_winner w ON w.entry_id = e.id
		 WHERE e.tombola_id = ? ORDER BY e.created_at`
	).bind(tombolaId).all();
	return r.results ?? [];
}

export async function listShoutoutsAdmin(db, tombolaId) {
	const r = await db.prepare(
		`SELECT s.id, s.message, s.hidden, s.created_at, e.first_name, e.last_name
		 FROM tombola_shoutout s JOIN tombola_entry e ON e.id = s.entry_id
		 WHERE s.tombola_id = ? ORDER BY s.created_at DESC LIMIT 200`
	).bind(tombolaId).all();
	return r.results ?? [];
}

export async function setShoutoutHidden(db, tombolaId, shoutId, hidden) {
	await db.prepare('UPDATE tombola_shoutout SET hidden = ? WHERE id = ? AND tombola_id = ?').bind(hidden ? 1 : 0, shoutId, tombolaId).run();
}
