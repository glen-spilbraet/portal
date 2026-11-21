import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getEffectiveEmail } from '$lib/server/effectiveEmail.js';
import { listCatalogues, listOwnCatalogues, listSharedCatalogues, createCatalogue } from '$lib/db.js';

async function checkAuth(cookies, platform) {
	return verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
}

/** GET — admins: everything; others: their own plus what is shared with them. */
export async function GET({ cookies, platform, locals }) {
	const email = await checkAuth(cookies, platform);
	if (!email) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);
	if (/** @type {any} */ (locals).auth?.user?.role === 'admin') return json(await listCatalogues(db));
	const [own, shared] = await Promise.all([listOwnCatalogues(db, email), listSharedCatalogues(db, email)]);
	return json([...own, ...shared]);
}

export async function POST({ request, cookies, platform }) {
	const email = await getEffectiveEmail(cookies, platform);
	if (!email) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);
	const { name, language } = await request.json();
	if (!name?.trim()) error(400, 'Name required');
	const id = crypto.randomUUID();
	await createCatalogue(db, id, name.trim(), language ?? 'en', email);
	return json({ id });
}
