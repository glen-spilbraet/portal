import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { listPlanogramProjects, createPlanogramProject } from '$lib/db.js';

async function checkAuth(cookies, platform) {
	return verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
}

export async function GET({ cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);
	return json(await listPlanogramProjects(db));
}

export async function POST({ request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);
	const { name } = await request.json();
	if (!name?.trim()) error(400, 'Name required');
	const id = crypto.randomUUID();
	await createPlanogramProject(db, id, name.trim());
	return json({ id });
}
