import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getCatalogueItems, addCatalogueItem, addImageSection, addGridSection, removeCatalogueItem, reorderCatalogueItems } from '$lib/db.js';

async function checkAuth(cookies, platform) {
	const token = cookies.get('session');
	return verifySession(token ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
}

export async function GET({ params, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);
	return json(await getCatalogueItems(db, params.id));
}

export async function POST({ params, request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);
	const body = await request.json();
	const id = crypto.randomUUID();

	if (body.type === 'image_half' || body.type === 'image_full') {
		await addImageSection(db, id, params.id, body.type);
		return json({ id });
	}

	if (body.type === 'grid') {
		const gridSize = body.gridSize === 6 ? 6 : 4;
		await addGridSection(db, id, params.id, gridSize);
		return json({ id });
	}

	const { sheetId } = body;
	if (!sheetId) error(400);
	await addCatalogueItem(db, id, params.id, sheetId);
	return json({ id });
}

export async function PUT({ params, request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);
	const { orderedIds } = await request.json();
	if (!Array.isArray(orderedIds)) error(400);
	await reorderCatalogueItems(db, params.id, orderedIds);
	return json({ ok: true });
}

export async function DELETE({ params, request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);
	const { itemId } = await request.json();
	if (!itemId) error(400);
	await removeCatalogueItem(db, itemId, params.id);
	return json({ ok: true });
}
