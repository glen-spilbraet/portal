import { json, error } from '@sveltejs/kit';
import { relationCounts } from '$lib/server/relations.js';

/** GET /api/sheets/relations — { counts: { <lower-case sku>: n } } for the sheet overview. (Access: `sheets` via the central gate.) */
export async function GET({ platform }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');
	return json({ counts: await relationCounts(db) });
}
