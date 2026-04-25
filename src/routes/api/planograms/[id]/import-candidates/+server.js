import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getPlanogramImportCandidates } from '$lib/db.js';

async function checkAuth(cookies, platform) {
	return verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
}

export async function GET({ params, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);
	const rows = await getPlanogramImportCandidates(db, params.id);
	return json({
		items: rows.map(r => ({
			id: r.id,
			projectId: r.project_id,
			projectName: r.project_name,
			sku: r.sku,
			name: r.name,
			widthCm: r.width_cm,
			heightCm: r.height_cm,
			isPlaceholder: r.is_placeholder === 1,
			createdAt: r.created_at,
		})),
	});
}
