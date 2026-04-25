import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getCatalogue, generateShareToken } from '$lib/db.js';

export async function POST({ params, cookies, platform }) {
	const token = cookies.get('session');
	if (!verifySession(token ?? '', platform?.env?.APP_SECRET ?? 'dev-secret')) {
		error(401, 'Unauthorized');
	}

	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');

	const catalogue = await getCatalogue(db, params.id);
	if (!catalogue) error(404, 'Catalogue not found');

	// Return existing token or generate a new one
	const shareToken = catalogue.share_token ?? await generateShareToken(db, params.id);
	return json({ shareToken });
}
