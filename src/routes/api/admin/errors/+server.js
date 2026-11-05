import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';
import { rawDb } from '$lib/server/errorLog.js';

async function requireAdmin({ cookies, platform }) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorized');
	const db = rawDb(platform?.env?.DB);
	const u = await getAllowedUser(db, email);
	if (u?.role !== 'admin') error(403, 'Admins only');
	return db;
}

// GET ?fingerprint=… → recent occurrences of one group.
export async function GET(event) {
	const db = await requireAdmin(event);
	const fp = event.url.searchParams.get('fingerprint') ?? '';
	const rows = (await db.prepare(
		`SELECT id, ref, at, source, status, method, path, message, stack, user_email, user_agent
		 FROM error_log WHERE fingerprint = ? ORDER BY id DESC LIMIT 50`
	).bind(fp).all()).results ?? [];
	return json({ rows });
}

// POST { fingerprint, resolved } → mark a group (un)resolved. New occurrences reopen it.
// POST { purge: true } → delete everything older than 90 days.
export async function POST(event) {
	const db = await requireAdmin(event);
	const b = await event.request.json().catch(() => ({}));
	if (b.purge) {
		await db.prepare(`DELETE FROM error_log WHERE at < datetime('now', '-90 days')`).run();
		return json({ ok: true });
	}
	if (typeof b.fingerprint !== 'string') error(400, 'fingerprint required');
	await db.prepare('UPDATE error_log SET resolved = ? WHERE fingerprint = ?').bind(b.resolved ? 1 : 0, b.fingerprint).run();
	return json({ ok: true });
}
