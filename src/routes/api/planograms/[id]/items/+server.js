import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { addPlanogramItem, upsertLibraryItem } from '$lib/db.js';

async function checkAuth(cookies, platform) {
	return verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
}

export async function POST({ params, request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);
	const { sku, name, widthCm, heightCm, isPlaceholder } = await request.json();
	if (!sku?.trim()) error(400, 'SKU required');
	if (!widthCm || !heightCm) error(400, 'Dimensions required');
	const cleanSku = sku.trim().toUpperCase();
	const id = await addPlanogramItem(db, params.id, cleanSku, name ?? null, widthCm, heightCm, !!isPlaceholder);
	// Mirror into the global item library
	await upsertLibraryItem(db, { id: crypto.randomUUID(), sku: cleanSku, name: name ?? null, widthCm, heightCm });
	return json({ id });
}
