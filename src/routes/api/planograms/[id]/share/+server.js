import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getPlanogramProject, generatePlanogramShareToken, revokePlanogramShareToken } from '$lib/db.js';

async function checkAuth(cookies, platform) {
	return verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
}

export async function POST({ params, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);
	const project = await getPlanogramProject(db, params.id);
	if (!project) error(404);
	const token = project.share_token ?? await generatePlanogramShareToken(db, params.id);
	return json({ token });
}

export async function DELETE({ params, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);
	await revokePlanogramShareToken(db, params.id);
	return json({ ok: true });
}
