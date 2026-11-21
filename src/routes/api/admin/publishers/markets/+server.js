import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';
import { setPublisherMarkets, togglePublisherMarket } from '$lib/server/webshopMarkets.js';
import { notifyShops } from '$lib/server/shopNotify.js';

async function requireAdmin(cookies, platform) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	const user = db ? await getAllowedUser(db, email) : null;
	if (!user || user.role !== 'admin') error(403, 'Admins only');
	return email;
}

/**
 * POST /api/admin/publishers/markets
 *   { publisher, market, on }        — switch one market on/off (what the page sends)
 *   { publisher, markets: string[] } — replace the whole list
 */
export async function POST({ request, cookies, platform }) {
	const email = await requireAdmin(cookies, platform);
	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Sales DB unavailable');
	const body = await request.json().catch(() => ({}));
	const publisher = (body?.publisher ?? '').trim();
	if (!publisher) return json({ message: 'publisher is required' }, { status: 400 });
	let markets;
	if (typeof body.market === 'string') {
		markets = await togglePublisherMarket(db, publisher, body.market, !!body.on, email);
		if (!markets) return json({ message: `Unknown market "${body.market}"` }, { status: 400 });
	} else if (Array.isArray(body.markets)) {
		markets = await setPublisherMarkets(db, publisher, body.markets, email);
	} else {
		return json({ message: 'market or markets is required' }, { status: 400 });
	}
	await notifyShops(platform, { type: 'publisher_markets', publisher, markets });
	return json({ ok: true, markets });
}
