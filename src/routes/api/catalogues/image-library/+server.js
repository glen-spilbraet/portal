import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';

/** GET /api/catalogues/image-library
 *  Returns all unique cover + section images across all catalogues,
 *  deduped by R2 key, ordered newest first.
 */
export async function GET({ cookies, platform }) {
	const token  = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	const email  = await verifySession(token ?? '', secret);
	if (!email) error(401, 'Unauthorized');

	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const rows = await db.prepare(`
		SELECT cover_image_key AS key, 'cover' AS image_type, name AS label, updated_at
		FROM catalogues
		WHERE cover_image_key IS NOT NULL AND cover_image_key != ''
		UNION ALL
		SELECT ci.section_image_key AS key,
		       ci.type              AS image_type,
		       c.name               AS label,
		       c.updated_at
		FROM catalogue_items ci
		JOIN catalogues c ON c.id = ci.catalogue_id
		WHERE ci.section_image_key IS NOT NULL AND ci.section_image_key != ''
		ORDER BY updated_at DESC
	`).all();

	// Deduplicate by R2 key (same photo may be reused across catalogues)
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
