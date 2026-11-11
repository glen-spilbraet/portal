import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';
import { applyItems } from '$lib/server/productImport.js';
import { notifyShops } from '$lib/server/shopNotify.js';

async function requireAdmin(cookies, platform) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	const user = db ? await getAllowedUser(db, email) : null;
	if (!user || user.role !== 'admin') error(403, 'Admins only');
	return email;
}

/** POST /api/admin/product-import/apply — { items: [...], last?: true } (one chunk) → writes them;
 *  `last` on the final chunk sends the shops a single { type: 'full' } notice. */
export async function POST({ request, cookies, platform }) {
	const email = await requireAdmin(cookies, platform);
	const db = platform?.env?.DB;
	const salesDb = platform?.env?.SALES_DB;
	if (!db || !salesDb) error(500, 'DB unavailable');

	const body = await request.json().catch(() => ({}));
	const items = Array.isArray(body.items) ? body.items : [];
	if (!items.length) error(400, 'No items');
	if (items.length > 400) error(400, 'Chunk too large (max 400)');

	const res = await applyItems(db, salesDb, items, email);
	// A bulk import touches many products: tell the shops ONCE, after the last
	// chunk, to re-read the full feed (instead of one notice per product).
	if (body.last === true) await notifyShops(platform, { type: 'full' });
	return json(res);
}
