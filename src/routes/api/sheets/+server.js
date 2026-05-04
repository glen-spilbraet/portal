import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';

export async function GET({ url, cookies, platform }) {
	const token  = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	const email  = await verifySession(token ?? '', secret);
	if (!email) error(401, 'Unauthorised');

	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const user = await getAllowedUser(db, email);
	if (!user) error(403, 'Access denied');

	const sku = url.searchParams.get('sku')?.trim();
	if (!sku) error(400, 'sku is required');

	const sheet = await db
		.prepare('SELECT id, sku FROM sales_sheets WHERE LOWER(sku) = LOWER(?) LIMIT 1')
		.bind(sku)
		.first();

	return json({ sheet: sheet ?? null });
}
