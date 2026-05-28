import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';

/** GET /api/catalogues/logo-library
 *  Returns all unique logos used across all catalogues, deduped by R2 key.
 */
export async function GET({ cookies, platform }) {
	const token  = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	const email  = await verifySession(token ?? '', secret);
	if (!email) error(401, 'Unauthorized');

	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const rows = await db.prepare(`
		SELECT logo_key AS key, 'logo' AS image_type, name AS label, updated_at
		FROM catalogues
		WHERE logo_key IS NOT NULL AND logo_key != ''
		ORDER BY updated_at DESC
	`).all();

	// Deduplicate by R2 key
	const seen   = new Set();
	const images = [];
	for (const row of (rows.results ?? [])) {
		if (!seen.has(row.key)) {
			seen.add(row.key);
			images.push(row);
		}
	}

	return json({ images });
}
