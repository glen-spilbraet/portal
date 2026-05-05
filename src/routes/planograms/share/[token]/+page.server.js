import { error } from '@sveltejs/kit';
import { getPlanogramProjectByShareToken, listPlanogramItems } from '$lib/db.js';

export async function load({ params, platform }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const project = await getPlanogramProjectByShareToken(db, params.token);
	if (!project) error(404, 'Share link not found or has been revoked');

	const items = await listPlanogramItems(db, project.id);

	return {
		token: params.token,
		name: project.name,
		language: project.language ?? null,
		settings: JSON.parse(project.settings || '{}'),
		placements: JSON.parse(project.placements || '[]'),
		libraryItems: items.map(i => ({
			id: i.id,
			sku: i.sku,
			name: i.name,
			widthCm: i.width_cm,
			heightCm: i.height_cm,
			isPlaceholder: i.is_placeholder === 1,
			photoUrl: i.is_placeholder === 0
				? `/api/planograms/share/${params.token}/photos/${i.id}`
				: null,
		})),
	};
}
