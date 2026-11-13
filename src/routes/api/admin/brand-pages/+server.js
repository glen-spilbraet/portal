import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';
import { getBrandPage, saveBrandTexts, setBrandImage, BRAND_KINDS } from '$lib/server/brandPages.js';
import { warmImageWidths } from '$lib/server/imageCdn.js';
import { notifyShops } from '$lib/server/shopNotify.js';

/**
 * Webshop landing-page content for a publisher or series (admin).
 *   GET  ?kind=publisher|series&ref=…           → content
 *   POST JSON { kind, ref, texts }               → save texts (per language)
 *   POST JSON { kind, ref, op: 'clear_image' }   → remove the image
 *   PUT  multipart { kind, ref, file }           → upload the (already 4:3-cropped) image
 * ref = publisher name, or series id.
 */

async function requireAdmin(cookies, platform) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	const user = db ? await getAllowedUser(db, email) : null;
	if (!user || user.role !== 'admin') error(403, 'Admins only');
	return email;
}

/** Validate kind + ref against the registry; returns the publisher name it belongs to. */
async function resolve(db, kind, ref) {
	if (!BRAND_KINDS.includes(kind) || !ref) error(400, 'kind and ref required');
	if (kind === 'publisher') {
		const row = await db.prepare('SELECT name FROM publisher WHERE name = ?').bind(ref).first();
		if (!row) error(404, 'Unknown publisher');
		return row.name;
	}
	const row = await db.prepare('SELECT publisher FROM series WHERE id = ?').bind(ref).first();
	if (!row) error(404, 'Unknown series');
	return row.publisher;
}

const salesDb = (platform) => {
	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Sales DB unavailable');
	return db;
};

export async function GET({ url, cookies, platform }) {
	await requireAdmin(cookies, platform);
	const db = salesDb(platform);
	const kind = url.searchParams.get('kind') ?? '';
	const ref = url.searchParams.get('ref') ?? '';
	await resolve(db, kind, ref);
	return json(await getBrandPage(db, kind, ref));
}

export async function POST({ request, cookies, platform }) {
	const email = await requireAdmin(cookies, platform);
	const db = salesDb(platform);
	const b = await request.json().catch(() => ({}));
	const publisher = await resolve(db, b.kind, b.ref);
	if (b.op === 'clear_image') await setBrandImage(db, b.kind, b.ref, null, email);
	else await saveBrandTexts(db, b.kind, b.ref, b.texts ?? {}, email);
	await notifyShops(platform, { type: 'brands', kind: b.kind, ref: b.ref, publisher });
	return json(await getBrandPage(db, b.kind, b.ref));
}

export async function PUT({ request, cookies, platform }) {
	const email = await requireAdmin(cookies, platform);
	const db = salesDb(platform);
	const bucket = platform?.env?.IMAGES;
	if (!bucket) error(500, 'Storage unavailable');

	const fd = await request.formData();
	const kind = fd.get('kind')?.toString() ?? '';
	const ref = fd.get('ref')?.toString() ?? '';
	const file = fd.get('file');
	if (!file || typeof file === 'string') error(400, 'No file provided');
	if (!/^image\/(png|jpeg|webp)$/.test(file.type)) error(400, 'PNG, JPEG or WebP only');
	if (file.size > 8 * 1024 * 1024) error(400, 'Image too large (max 8 MB)');
	const publisher = await resolve(db, kind, ref);

	const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
	const key = `brand/${kind}/${crypto.randomUUID()}.${ext}`;
	await bucket.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
	warmImageWidths(platform, key);
	await setBrandImage(db, kind, ref, key, email);
	// The old image is left in R2 (cheap) — shop caches may still point at it for a while.
	await notifyShops(platform, { type: 'brands', kind, ref, publisher });
	return json(await getBrandPage(db, kind, ref));
}
