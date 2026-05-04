import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getEffectiveEmail } from '$lib/server/effectiveEmail.js';
import { listDataProducts, createDataProduct } from '$lib/db.js';

export async function GET({ cookies, platform }) {
	const token = cookies.get('session');
	if (!(await verifySession(token ?? '', platform?.env?.APP_SECRET ?? 'dev-secret'))) error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');
	return json(await listDataProducts(db));
}

export async function POST({ request, cookies, platform }) {
	const email = await getEffectiveEmail(cookies, platform);
	if (!email) error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');
	const { name } = await request.json();
	if (!name?.trim()) error(400, 'Name required');
	const id = await createDataProduct(db, name.trim(), email);
	return json({ id }, { status: 201 });
}
