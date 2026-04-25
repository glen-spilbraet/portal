import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { listCatalogues, createCatalogue } from '$lib/db.js';

async function checkAuth(cookies, platform) {
	const token = cookies.get('session');
	return verifySession(token ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
}

export async function GET({ cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);
	return json(await listCatalogues(db));
}

export async function POST({ request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);
	const { name, language } = await request.json();
	if (!name?.trim()) error(400, 'Name required');
	const id = crypto.randomUUID();
	await createCatalogue(db, id, name.trim(), language ?? 'en');
	return json({ id });
}
