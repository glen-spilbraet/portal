import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getSheet } from '$lib/db.js';
import { updateRackbeatCustomFieldsBySlug, fetchRackbeatCustomFieldByName, updateRackbeatCustomFieldById, PIECES_FIELD_RE } from '$lib/rackbeat.js';

// Editable game attributes written back to Rackbeat by slug. (The logical key
// "pieces" is handled separately by name, since its slug varies per account.)
const ALLOWED = new Set(['age-minimum', 'duration', 'player-count-minimum', 'player-count-maximum']);

/** POST /api/sheets/:id/rackbeat-fields  { values: { "<slug>"|"pieces": "<value>", … } } */
export async function POST({ params, request, cookies, platform }) {
	const user = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!user) error(401, 'Unauthorized');

	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');

	const sheet = await getSheet(db, params.id);
	if (!sheet) error(404, 'Sheet not found');

	const apiKey = platform?.env?.RACKBEAT_API_KEY;
	const body = await request.json().catch(() => ({}));
	const values = body.values ?? {};

	const slugValues = {};
	for (const [k, v] of Object.entries(values)) {
		if (ALLOWED.has(k)) slugValues[k] = v;
	}

	let wrote = false;
	if (Object.keys(slugValues).length) {
		const r = await updateRackbeatCustomFieldsBySlug(sheet.sku, apiKey, slugValues);
		if (!r.ok) error(502, `Rackbeat update failed (${r.status})${r.error ? ': ' + r.error : ''}`);
		wrote = true;
	}

	// Pieces: resolve the field by name, then write by its numeric id.
	if ('pieces' in values) {
		const pf = await fetchRackbeatCustomFieldByName(sheet.sku, apiKey, PIECES_FIELD_RE);
		if (pf?.id == null) error(502, 'Rackbeat “pieces” field not found for this product');
		const r = await updateRackbeatCustomFieldById(sheet.sku, apiKey, pf.id, values.pieces);
		if (!r.ok) error(502, `Rackbeat update failed (${r.status})${r.error ? ': ' + r.error : ''}`);
		wrote = true;
	}

	if (!wrote) error(400, 'No valid fields to update');
	return json({ ok: true });
}
