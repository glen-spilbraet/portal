import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser, listPermissionSets, createPermissionSet } from '$lib/db.js';

async function requireAdmin(cookies, platform) {
	const token  = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	const email  = await verifySession(token ?? '', secret);
	if (!email) error(401, 'Unauthorised');
	const db   = platform?.env?.DB;
	if (!db)   error(500, 'Database unavailable');
	const user = await getAllowedUser(db, email);
	if (!user || user.role !== 'admin') error(403, 'Admins only');
	return { db };
}

export async function GET({ cookies, platform }) {
	const { db } = await requireAdmin(cookies, platform);
	const sets = await listPermissionSets(db);
	return json(sets);
}

export async function POST({ request, cookies, platform }) {
	const { db } = await requireAdmin(cookies, platform);
	const body   = await request.json();
	const name   = body.name?.trim();
	if (!name) error(400, 'Name is required');

	const id     = crypto.randomUUID();
	const access = {
		sheets:     body.access_sheets     !== false,
		catalogues: body.access_catalogues !== false,
		planograms: body.access_planograms !== false,
		data:       body.access_data       !== false,
	};
	await createPermissionSet(db, id, name, access);
	return json({ id, name, ...body }, { status: 201 });
}
