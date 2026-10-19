import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';
import { setPublisherMarkets } from '$lib/server/webshopMarkets.js';

async function requireAdmin(cookies, platform) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	const user = db ? await getAllowedUser(db, email) : null;
	if (!user || user.role !== 'admin') error(403, 'Admins only');
}

/** POST /api/admin/publishers/markets  { publisher, markets: string[] } — replaces a publisher's licensed markets. */
export async function POST({ request, cookies, platform }) {
	await requireAdmin(cookies, platform);
	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Sales DB unavailable');
	const body = await request.json().catch(() => ({}));
	const publisher = (body?.publisher ?? '').trim();
	if (!publisher) return json({ message: 'publisher is required' }, { status: 400 });
	const markets = await setPublisherMarkets(db, publisher, Array.isArray(body.markets) ? body.markets : []);
	return json({ ok: true, markets });
}
