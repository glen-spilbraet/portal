import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getSheet } from '$lib/db.js';
import { updateRackbeatCustomFieldsBySlug } from '$lib/rackbeat.js';

// Only the editable game attributes may be written back to Rackbeat.
const ALLOWED = new Set(['age-minimum', 'duration', 'player-count-minimum', 'player-count-maximum']);

/** POST /api/sheets/:id/rackbeat-fields  { values: { "<slug>": "<value>", … } } */
export async function POST({ params, request, cookies, platform }) {
	const user = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!user) error(401, 'Unauthorized');

	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');

	const sheet = await getSheet(db, params.id);
	if (!sheet) error(404, 'Sheet not found');

	const body = await request.json().catch(() => ({}));
	const slugValues = {};
	for (const [k, v] of Object.entries(body.values ?? {})) {
		if (ALLOWED.has(k)) slugValues[k] = v;
	}
	if (!Object.keys(slugValues).length) error(400, 'No valid fields to update');

	const r = await updateRackbeatCustomFieldsBySlug(sheet.sku, platform?.env?.RACKBEAT_API_KEY, slugValues);
	if (!r.ok) error(502, `Rackbeat update failed (${r.status})${r.error ? ': ' + r.error : ''}`);

	return json({ ok: true });
}
