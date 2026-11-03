import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';

// Exploratory, admin-only proxy to the Lagersystem REST API. Forwards a GET to
// api.lagersystem.dk with the X-API-Key header (key stays server-side), and
// returns the raw response so we can learn the real schema. GET + /api/ only.
const BASE = 'https://api.lagersystem.dk';

async function requireAdmin(cookies, platform) {
	const token  = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	const email  = await verifySession(token ?? '', secret);
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const user = await getAllowedUser(db, email);
	if (!user || user.role !== 'admin') error(403, 'Admins only');
}

export async function GET({ url, cookies, platform }) {
	await requireAdmin(cookies, platform);

	const apiKey = platform?.env?.LAGERSYSTEM_API_KEY;
	if (!apiKey) error(500, 'LAGERSYSTEM_API_KEY is not configured on this environment');

	let path = url.searchParams.get('path') || '/api/v1/orders';
	if (!path.startsWith('/')) path = '/' + path;
	// Any path is fine — the host is hardcoded, admin-only, GET-only (no SSRF).

	const target = BASE + path;
	const started = Date.now();
	let res;
	try {
		res = await fetch(target, { headers: { 'X-API-Key': apiKey, Accept: 'application/json' } });
	} catch (e) {
		return json({ ok: false, target, error: `fetch failed: ${e instanceof Error ? e.message : String(e)}` });
	}
	const ms = Date.now() - started;
	const contentType = res.headers.get('content-type') || '';
	const raw = await res.text();
	let body;
	if (contentType.includes('application/json')) {
		try { body = JSON.parse(raw); } catch { body = raw.slice(0, 20000); }
	} else {
		body = raw.slice(0, 20000);
	}
	return json({ ok: res.ok, status: res.status, contentType, ms, target, body });
}
