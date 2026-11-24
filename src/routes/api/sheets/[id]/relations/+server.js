import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getSheet } from '$lib/db.js';
import { addRelation, removeRelation, relationsForSku, listRelationTypes } from '$lib/server/relations.js';
import { notifyShops } from '$lib/server/shopNotify.js';

/** GET /api/sheets/:id/relations — { types, relations: { outgoing, incoming } } (read-only view). */
export async function GET({ params, platform }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');
	const sheet = await getSheet(db, params.id);
	if (!sheet?.sku) error(404, 'Sheet not found');
	const [types, relations] = await Promise.all([
		listRelationTypes(db).catch(() => []),
		relationsForSku(db, String(sheet.sku).trim()).catch(() => ({ outgoing: [], incoming: [] }))
	]);
	return json({ types, relations });
}

/**
 * POST /api/sheets/:id/relations
 *   { op: 'add' | 'remove', direction: 'forward' | 'inverse', typeId, other }
 * forward: this product is <type> for <other>; inverse: <other> is <type> for
 * this product. Returns the product's relations after the change.
 * (Access: sheetsEdit via the central gate. hooks.server.js tells the shops
 * about this sheet's SKU; the other product is notified here.)
 */
export async function POST({ params, request, cookies, platform }) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');

	const sheet = await getSheet(db, params.id);
	if (!sheet?.sku) error(404, 'Sheet not found');
	const sku = String(sheet.sku).trim();

	const body = await request.json().catch(() => ({}));
	const typeId = String(body.typeId ?? '');
	const other = String(body.other ?? '').trim();
	const forward = body.direction !== 'inverse';
	const pair = forward ? { sku, typeId, target: other } : { sku: other, typeId, target: sku };

	if (body.op === 'remove') {
		await removeRelation(db, pair);
	} else {
		const r = await addRelation(db, { ...pair, by: email });
		if (!r.ok) error(400, r.error);
	}
	if (other) await notifyShops(platform, { type: 'products', skus: [other] }).catch(() => {});

	return json({ ok: true, relations: await relationsForSku(db, sku) });
}
