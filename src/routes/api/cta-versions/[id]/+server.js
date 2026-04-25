import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { updateCtaVersionName, upsertCtaVersionTranslation, deleteCtaVersion } from '$lib/db.js';

async function checkAuth(cookies, platform) {
	const token = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	return verifySession(token ?? '', secret);
}

// PUT: update name OR a translation
// Body: { field: 'name', value: '...' } | { field: 'translation', lang: '...', value: '...' }
export async function PUT({ params, request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');
	const body = await request.json();
	if (body.field === 'name') {
		await updateCtaVersionName(db, params.id, body.value ?? '');
	} else if (body.field === 'translation') {
		await upsertCtaVersionTranslation(db, params.id, body.lang, body.value ?? '');
	} else {
		error(400, 'Unknown field');
	}
	return json({ ok: true });
}

export async function DELETE({ params, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');
	await deleteCtaVersion(db, params.id);
	return json({ ok: true });
}
