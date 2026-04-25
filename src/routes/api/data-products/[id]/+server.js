import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getDataProduct, updateDataProduct, deleteDataProduct } from '$lib/db.js';

function auth(cookies, platform) {
	const token = cookies.get('session');
	if (!verifySession(token ?? '', platform?.env?.APP_SECRET ?? 'dev-secret')) error(401, 'Unauthorized');
}

export async function GET({ params, cookies, platform }) {
	auth(cookies, platform);
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');
	const product = await getDataProduct(db, params.id);
	if (!product) error(404, 'Not found');
	return json(product);
}

export async function PUT({ params, request, cookies, platform }) {
	auth(cookies, platform);
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');
	const patch = await request.json();
	// Only allow safe fields
	const allowed = ['name', 'mappings', 'skus'];
	const safe = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)));
	await updateDataProduct(db, params.id, safe);
	return json({ ok: true });
}

export async function DELETE({ params, cookies, platform }) {
	auth(cookies, platform);
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');
	await deleteDataProduct(db, params.id);
	return json({ ok: true });
}
