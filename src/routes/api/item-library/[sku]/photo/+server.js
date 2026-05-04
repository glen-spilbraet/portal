import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getLibraryItemBySku, updateLibraryItemPhoto, getPlaceholdersBySku, updatePlanogramItem, getPlanogramProject, updatePlanogramProject } from '$lib/db.js';

async function checkAuth(cookies, platform) {
	return verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
}

/** GET /api/item-library/[sku]/photo — serve the library photo for a product */
export async function GET({ params, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	const bucket = platform?.env?.PHOTOS;
	if (!db || !bucket) error(500);

	const row = await getLibraryItemBySku(db, params.sku.toUpperCase());
	if (!row) error(404, 'Not in library');
	if (!row.photo_key) error(404, 'No photo');

	const obj = await bucket.get(row.photo_key);
	if (!obj) error(404);

	const headers = new Headers();
	obj.writeHttpMetadata(headers);
	headers.set('Cache-Control', 'private, max-age=3600');
	return new Response(obj.body, { headers });
}

/** POST /api/item-library/[sku]/photo — upload a photo and distribute to all planogram placeholders */
export async function POST({ params, request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	const bucket = platform?.env?.PHOTOS;
	if (!db || !bucket) error(500);

	const sku = params.sku.toUpperCase();
	const row = await getLibraryItemBySku(db, sku);
	if (!row) error(404, 'Not in library');

	const contentType = request.headers.get('content-type') || 'image/jpeg';
	const ext = contentType.split('/')[1]?.split(';')[0] ?? 'jpg';
	const libraryKey = `item-library/${sku}.${ext}`;

	// Read body once into a buffer so we can reuse it for each planogram item
	const buffer = await request.arrayBuffer();

	// 1. Store in the library's own R2 path
	await bucket.put(libraryKey, buffer, { httpMetadata: { contentType } });
	await updateLibraryItemPhoto(db, sku, libraryKey);

	// 2. Find every planogram item with this SKU that is still a placeholder and push the photo
	const placeholders = await getPlaceholdersBySku(db, sku);
	let distributed = 0;
	for (const item of placeholders) {
		const itemKey = `planogram-photos/${item.project_id}/${item.id}.${ext}`;
		try {
			await bucket.put(itemKey, buffer, { httpMetadata: { contentType } });
			await updatePlanogramItem(db, item.id, { photo_key: itemKey, is_placeholder: 0 });

			// Also patch the placements JSON in the project so shelf renders update too
			const project = await getPlanogramProject(db, item.project_id);
			if (project?.placements) {
				try {
					const placements = JSON.parse(project.placements);
					let changed = false;
					for (const p of placements) {
						if (p.libId === item.id && p.isPlaceholder) {
							p.isPlaceholder = false;
							p.photoUrl = `/api/planograms/${item.project_id}/items/${item.id}/photo`;
							changed = true;
						}
					}
					if (changed) {
						await updatePlanogramProject(db, item.project_id, { placements: JSON.stringify(placements) });
					}
				} catch { /* malformed placements JSON — skip */ }
			}

			distributed++;
		} catch { /* skip any individual failure */ }
	}

	return json({ ok: true, distributed });
}
