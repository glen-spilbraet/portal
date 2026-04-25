import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import {
	getPlanogramProject, updatePlanogramProject, deletePlanogramProject,
	listPlanogramItems
} from '$lib/db.js';

async function checkAuth(cookies, platform) {
	return verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
}

export async function GET({ params, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);
	const project = await getPlanogramProject(db, params.id);
	if (!project) error(404);
	const items = await listPlanogramItems(db, params.id);
	return json({
		...project,
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

export async function PUT({ params, request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);
	const body = await request.json();
	const patch = {};
	if ('settings' in body) patch.settings = JSON.stringify(body.settings);
	if ('placements' in body) patch.placements = JSON.stringify(body.placements);
	if ('name' in body && body.name?.trim()) patch.name = body.name.trim();
	if (!Object.keys(patch).length) error(400, 'Nothing to update');
	await updatePlanogramProject(db, params.id, patch);
	return json({ ok: true });
}

export async function PATCH({ params, request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);
	const body = await request.json();
	if (!body.name?.trim()) error(400, 'Name required');
	await updatePlanogramProject(db, params.id, { name: body.name.trim() });
	return json({ ok: true });
}

export async function DELETE({ params, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	const bucket = platform?.env?.PHOTOS;
	if (!db) error(500);

	// Delete all photos from R2
	if (bucket) {
		const items = await listPlanogramItems(db, params.id);
		await Promise.all(
			items.filter(i => i.photo_key).map(i => bucket.delete(i.photo_key).catch(() => {}))
		);
	}

	await deletePlanogramProject(db, params.id);
	return json({ ok: true });
}
