import { redirect } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { listPlanogramProjects } from '$lib/db.js';

export async function load({ cookies, platform }) {
	const token = cookies.get('session');
	const valid = await verifySession(token ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!valid) redirect(303, '/login?next=/planograms');
	const db = platform?.env?.DB;
	const projects = db ? await listPlanogramProjects(db) : [];
	return { projects };
}
