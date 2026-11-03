import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';

// Exploratory, admin-only proxy to the company's own Lagersystem instance (NOT
// the public demo api.lagersystem.dk). The key stays server-side; we forward a
// GET or POST and return the raw response so we can learn the real schema.
const BASE = 'https://spilbraetdk.lagersystem.dk';

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

export async function POST({ request, cookies, platform }) {
	await requireAdmin(cookies, platform);

	const apiKey = platform?.env?.LAGERSYSTEM_API_KEY;
	if (!apiKey) error(500, 'LAGERSYSTEM_API_KEY is not configured on this environment');

	const input = await request.json().catch(() => ({}));
	let path = String(input.path || '/api/login');
	if (!path.startsWith('/')) path = '/' + path;
	const method = String(input.method || 'GET').toUpperCase();
	if (!['GET', 'POST'].includes(method)) error(400, 'Only GET or POST');

	const target = BASE + path;
	const headers = { 'X-APIKEY': apiKey, Accept: 'application/json' };
	let fetchBody;
	if (method === 'POST' && input.body != null && input.body !== '') {
		headers['Content-Type'] = 'application/json';
		fetchBody = typeof input.body === 'string' ? input.body : JSON.stringify(input.body);
	}

	const started = Date.now();
	let res;
	try {
		res = await fetch(target, { method, headers, body: fetchBody });
	} catch (e) {
		return json({ ok: false, target, method, error: `fetch failed: ${e instanceof Error ? e.message : String(e)}` });
	}
	const ms = Date.now() - started;
	const contentType = res.headers.get('content-type') || '';
	const raw = await res.text();
	let body;
	if (contentType.includes('application/json')) {
		try { body = JSON.parse(raw); } catch { body = raw.slice(0, 40000); }
	} else {
		body = raw.slice(0, 40000);
	}
	return json({ ok: res.ok, status: res.status, contentType, ms, target, method, body });
}
