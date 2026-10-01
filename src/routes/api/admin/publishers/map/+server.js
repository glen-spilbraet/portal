import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';
import { mapSku, unmapSku } from '$lib/server/publishers.js';

async function requireAdmin(cookies, platform) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	const user = db ? await getAllowedUser(db, email) : null;
	if (!user || user.role !== 'admin') error(403, 'Admins only');
}

// Map a SKU to a publisher, or remove its mapping.
export async function POST({ request, cookies, platform }) {
	await requireAdmin(cookies, platform);
	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Sales DB unavailable');
	const body = await request.json().catch(() => ({}));
	const sku = (body?.sku ?? '').trim();
	if (!sku) return json({ message: 'sku required' }, { status: 400 });
	if (body.remove) await unmapSku(db, sku);
	else {
		if (!body?.publisher?.trim()) return json({ message: 'publisher required' }, { status: 400 });
		await mapSku(db, sku, body.publisher);
	}
	return json({ ok: true });
}
