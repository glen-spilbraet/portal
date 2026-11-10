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

// Our own sites (Spilbræt.dk / Brädspel.se / Brettspill.no): an article there
// exists per language, linked by <link rel="alternate" hreflang>. Adding any one
// of them adds every localised version, each shown only in its own market.
const OWN_SITE = /(^|\.)(spilbraet\.dk|xn--brdspel-5wa\.se|bradspel\.se|brettspill\.no)$/i;
const LANG_MARKET = { da: 'DK', sv: 'SE', no: 'NO', nb: 'NO', nn: 'NO' };
const LANG_LABEL = { DK: 'Danish', SE: 'Swedish', NO: 'Norwegian' };
const marketOfLang = (l) => LANG_MARKET[String(l ?? '').toLowerCase().split(/[-_]/)[0]] ?? null;
const sameUrl = (a, b) => String(a).replace(/\/+$/, '').toLowerCase() === String(b).replace(/\/+$/, '').toLowerCase();

/** POST /api/sheets/:id/articles  { url }  — fetch preview, cache image, store.
 *  For our own sites, all localised versions are added (one per market). */
export async function POST({ params, request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');
	const sheet = await getSheet(db, params.id);
	if (!sheet) error(404, 'Sheet not found');

	const body = await request.json().catch(() => ({}));
	const preview = await fetchLinkPreview(body.url);
	if (!preview) error(400, 'Invalid URL');

	/** @type {{ preview: any, markets: string[] | null }[]} */
	let toAdd = [{ preview, markets: null }];
	const own = OWN_SITE.test(new URL(preview.url).hostname);
	if (own) {
		// One entry per market from the hreflang links (the submitted page included);
		// a page without alternates gets the market of its own og:locale.
		const byMarket = new Map();
		for (const a of preview.alternates ?? []) {
			const m = marketOfLang(a.lang);
			if (m && !byMarket.has(m)) byMarket.set(m, a.href);
		}
		if (!byMarket.size) {
			const m = marketOfLang(preview.locale);
			if (m) byMarket.set(m, preview.url);
		}
		if (byMarket.size) {
			toAdd = await Promise.all([...byMarket].map(async ([m, href]) => ({
				preview: sameUrl(href, preview.url) ? preview : ((await fetchLinkPreview(href)) ?? { ...preview, url: href }),
				markets: [m],
			})));
		}
	}

	// Already on the sheet (same URL) → just (re)set its market instead of a duplicate.
	const existing = await getArticles(db, params.id);
	let order = existing.length;
	const added = [], updated = [];
	for (const { preview: pv, markets } of toAdd) {
		const dup = existing.find((a) => sameUrl(a.url, pv.url));
		if (dup) {
			if (markets) await setArticleMarkets(db, dup.id, markets);
			updated.push(markets?.[0] ?? dup.url);
			continue;
		}
		const articleId = crypto.randomUUID();
		const imageKey = await cacheImage(platform?.env?.IMAGES, params.id, articleId, pv.image);
		if (imageKey) warmImageWidths(platform, imageKey);
		await addArticle(db, params.id, articleId, {
			url: pv.url, title: pv.title, description: pv.description,
			siteName: pv.siteName, imageKey, imageUrl: pv.image, favicon: pv.favicon
		}, order++);
		if (markets) await setArticleMarkets(db, articleId, markets);
		added.push(markets?.[0] ?? null);
	}

	await notifyShops(platform, { type: 'sheet_article', sku: sheet.sku });
	const label = (m) => LANG_LABEL[m] ?? m;
	const message = own && toAdd.some((t) => t.markets)
		? [added.length ? `Added ${added.map(label).join(', ')} version${added.length === 1 ? '' : 's'}` : '',
			updated.length ? `${updated.map(label).join(', ')} already added — market set` : ''].filter(Boolean).join(' · ')
		: null;
	return json({ ok: true, added: added.length, message, articles: await getArticles(db, params.id) });
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
