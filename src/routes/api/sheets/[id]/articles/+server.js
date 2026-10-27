import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getSheet, getArticles, addArticle, deleteArticle, setArticleMarkets } from '$lib/db.js';
import { fetchLinkPreview } from '$lib/server/linkPreview.js';
import { warmImageWidths } from '$lib/server/imageCdn.js';
import { notifyShops } from '$lib/server/shopNotify.js';

async function checkAuth(cookies, platform) {
	return verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

/** Download the og:image to R2 (best-effort, size-capped). Returns the R2 key or null. */
async function cacheImage(bucket, sheetId, articleId, imageUrl) {
	if (!bucket || !imageUrl) return null;
	try {
		const res = await fetch(imageUrl, { headers: { 'User-Agent': 'SpilbraetPortal/1.0' }, signal: AbortSignal.timeout(9000) });
		if (!res.ok) return null;
		const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
		if (!EXT[type]) return null;
		const buf = await res.arrayBuffer();
		if (buf.byteLength > 6_000_000) return null; // cap ~6MB
		const key = `${sheetId}/article/${articleId}.${EXT[type]}`;
		await bucket.put(key, buf, { httpMetadata: { contentType: type } });
		return key;
	} catch { return null; }
}

/** POST /api/sheets/:id/articles  { url }  — fetch preview, cache image, store. */
export async function POST({ params, request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');
	const sheet = await getSheet(db, params.id);
	if (!sheet) error(404, 'Sheet not found');

	const body = await request.json().catch(() => ({}));
	const preview = await fetchLinkPreview(body.url);
	if (!preview) error(400, 'Invalid URL');

	const articleId = crypto.randomUUID();
	const imageKey = await cacheImage(platform?.env?.IMAGES, params.id, articleId, preview.image);
	if (imageKey) warmImageWidths(platform, imageKey);

	const existing = await getArticles(db, params.id);
	await addArticle(db, params.id, articleId, {
		url: preview.url, title: preview.title, description: preview.description,
		siteName: preview.siteName, imageKey, imageUrl: preview.image, favicon: preview.favicon
	}, existing.length);

	await notifyShops(platform, { type: 'sheet_article', sku: sheet.sku });
	return json({ ok: true, id: articleId, articles: await getArticles(db, params.id) });
}

/** DELETE /api/sheets/:id/articles?articleId=… */
export async function DELETE({ params, url, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');
	const sheet = await getSheet(db, params.id);
	if (!sheet) error(404, 'Sheet not found');
	const articleId = url.searchParams.get('articleId');
	if (!articleId) error(400, 'articleId required');
	await deleteArticle(db, articleId);
	await notifyShops(platform, { type: 'sheet_article', sku: sheet.sku });
	return json({ ok: true, articles: await getArticles(db, params.id) });
}

/** PATCH /api/sheets/:id/articles  { articleId, markets: string[]|null }  — availability. */
export async function PATCH({ params, request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');
	const sheet = await getSheet(db, params.id);
	if (!sheet) error(404, 'Sheet not found');
	const body = await request.json().catch(() => ({}));
	if (!body.articleId) error(400, 'articleId required');
	await setArticleMarkets(db, body.articleId, Array.isArray(body.markets) ? body.markets : null);
	await notifyShops(platform, { type: 'sheet_article', sku: sheet.sku });
	return json({ ok: true });
}
