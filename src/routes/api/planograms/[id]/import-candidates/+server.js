import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { listLibraryItems } from '$lib/db.js';

async function checkAuth(cookies, platform) {
	return verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
}

/** GET /api/planograms/[id]/import-candidates — returns the global item library */
export async function GET({ cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);
	const rows = await listLibraryItems(db);
	return json({
		items: rows.map(r => ({
			id: r.id,
			sku: r.sku,
			name: r.name,
			widthCm: r.width_cm,
			heightCm: r.height_cm,
			hasPhoto: !!r.photo_key,
		})),
	});
}
