import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { updateSheet, setTranslation, getTranslations } from '$lib/db.js';

async function checkAuth(cookies, platform) {
	const token = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	return verifySession(token ?? '', secret);
}

/**
 * PUT /api/sheets/:id — save sheet data changes.
 * Body: { type, ...payload }
 * type='translation' → { language, key, value }
 * type='sheet'       → { field, value }
 */
export async function PUT({ params, request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401, 'Unauthorized');

	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');

	const body = await request.json();

	if (body.type === 'translation') {
		const { language, key, value } = body;
		if (!language || !key) error(400, 'Missing language or key');
		await setTranslation(db, params.id, language, key, value ?? '');
	} else if (body.type === 'sheet') {
		const { field, value } = body;
		const allowed = ['data_fields', 'usp_count', 'box_image_key', 'status', 'hidden_elements', 'cta_version_id'];
		if (!allowed.includes(field)) error(400, `Field '${field}' not writable`);
		await updateSheet(db, params.id, { [field]: value });
	} else {
		error(400, 'Unknown change type');
	}

	return json({ ok: true });
}

/** GET /api/sheets/:id/translations?lang=en */
export async function GET({ params, url, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401, 'Unauthorized');

	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');

	const lang = url.searchParams.get('lang') ?? 'en';
	const all = await getTranslations(db, params.id);
	return json(all[lang] ?? {});
}
