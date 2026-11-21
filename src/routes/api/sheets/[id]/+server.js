import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { updateSheet, setTranslation, getTranslations, ensureProductName } from '$lib/db.js';
import { normalizeLang } from '$lib/languages.js';

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
		const { key, value } = body;
		const language = normalizeLang(body.language);
		if (!language) error(400, `Unknown language "${body.language ?? ''}"`);
		if (!key || typeof key !== 'string') error(400, 'Missing key');
		await setTranslation(db, params.id, language, key, value ?? '');
		// First text in a language → give that language the (shared) product name too.
		if (key !== 'product_name' && String(value ?? '').trim()) await ensureProductName(db, params.id, language);
	} else if (body.type === 'sheet') {
		const { field, value } = body;
		const allowed = ['data_fields', 'usp_count', 'box_image_key', 'box_flat_image_key', 'status', 'hidden_elements', 'cta_version_id', 'youtube_url', 'preorder_date', 'restock_date'];
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

	const lang = normalizeLang(url.searchParams.get('lang')) ?? 'en';
	const all = await getTranslations(db, params.id);
	return json(all[lang] ?? {});
}
