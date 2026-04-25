import { json, error } from '@sveltejs/kit';
import { getPlanogramProjectByShareToken, listPlanogramItems } from '$lib/db.js';

/** GET /api/planograms/share/[token] — public endpoint, no auth required */
export async function GET({ params, platform }) {
	const db = platform?.env?.DB;
	if (!db) error(500);
	const project = await getPlanogramProjectByShareToken(db, params.token);
	if (!project) error(404, 'Share link not found or revoked');
	const items = await listPlanogramItems(db, project.id);
	return json({
		id: project.id,
		name: project.name,
		settings: project.settings ? JSON.parse(project.settings) : {},
		placements: project.placements ? JSON.parse(project.placements) : [],
		libraryItems: items.map(i => ({
			id: i.id,
			sku: i.sku,
			name: i.name,
			widthCm: i.width_cm,
			heightCm: i.height_cm,
			isPlaceholder: i.is_placeholder === 1,
		})),
	});
}
