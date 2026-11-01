import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getPlanogramProject, updatePlanogramProject } from '$lib/db.js';

async function checkAuth(cookies, platform) {
	return verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
}

/** GET /api/planograms/[id]/thumbnail — serve the generated shelf thumbnail (auth required) */
export async function GET({ params, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	const bucket = platform?.env?.PHOTOS;
	if (!db || !bucket) error(500);

	const project = await getPlanogramProject(db, params.id);
	if (!project?.thumbnail_key) error(404, 'No thumbnail');

	const obj = await bucket.get(project.thumbnail_key);
	if (!obj) error(404);

	const headers = new Headers();
	obj.writeHttpMetadata(headers);
	headers.set('Content-Type', 'image/jpeg');
	headers.set('Cache-Control', 'private, max-age=86400'); // card busts via ?v=updated_at
	return new Response(obj.body, { headers });
}

/** POST /api/planograms/[id]/thumbnail — store a generated JPG thumbnail */
export async function POST({ params, request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	const bucket = platform?.env?.PHOTOS;
	if (!db || !bucket) error(500);

	const project = await getPlanogramProject(db, params.id);
	if (!project) error(404);

	const key = `planogram-thumbs/${params.id}.jpg`;
	const buffer = await request.arrayBuffer();
	await bucket.put(key, buffer, { httpMetadata: { contentType: 'image/jpeg' } });
	if (project.thumbnail_key !== key) await updatePlanogramProject(db, params.id, { thumbnail_key: key });

	return json({ ok: true, key });
}
