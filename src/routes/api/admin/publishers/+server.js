import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';
import { createPublisher, searchLineItemSkus } from '$lib/server/publishers.js';

/** Admin gate (role via DB); registry lives on the shared SALES_DB. */
async function requireAdmin(cookies, platform) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	const user = db ? await getAllowedUser(db, email) : null;
	if (!user || user.role !== 'admin') error(403, 'Admins only');
}

// SKU search for the mapping page.
export async function GET({ url, cookies, platform }) {
	await requireAdmin(cookies, platform);
	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Sales DB unavailable');
	const q = (url.searchParams.get('q') ?? '').trim();
	if (q.length < 2) return json([]);
	return json(await searchLineItemSkus(db, q));
}

// Create a registry publisher (may have no SKU prefix).
export async function POST({ request, cookies, platform }) {
	await requireAdmin(cookies, platform);
	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Sales DB unavailable');
	const body = await request.json().catch(() => ({}));
	if (!body?.name?.trim()) return json({ message: 'Name is required' }, { status: 400 });
	await createPublisher(db, body.name);
	return json({ ok: true });
}
