import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { listCtaVersions, createCtaVersion } from '$lib/db.js';

async function checkAuth(cookies, platform) {
	const token = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	return verifySession(token ?? '', secret);
}

export async function GET({ cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');
	return json(await listCtaVersions(db));
}

export async function POST({ request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');
	const { name } = await request.json();
	if (!name?.trim()) error(400, 'Name required');
	const id = crypto.randomUUID();
	await createCtaVersion(db, id, name.trim());
	return json({ id, name: name.trim() });
}
