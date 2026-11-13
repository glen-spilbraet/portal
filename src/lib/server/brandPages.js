/**
 * Webshop landing-page content for publishers and series: a subheader + text
 * per language and one 4:3 image (often a logo). Edited in the Portal under
 * Admin → Publishers → Shop page; served to the shop by /api/shop/brands.
 * All on SALES_DB (shared prod portal-db), like the publisher + series registry.
 *
 *   kind 'publisher' → ref = publisher name
 *   kind 'series'    → ref = series id
 */

export const BRAND_LANGS = ['da', 'sv', 'no', 'en', 'pl'];
export const BRAND_KINDS = ['publisher', 'series'];

/** URL-safe slug from a name ("Æsel & Co." → "aesel-co"). */
export function slugify(/** @type {string} */ s) {
	return String(s ?? '')
		.toLowerCase()
		.replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
		.normalize('NFKD').replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Content for one publisher/series: { image_key, updated_at, updated_by, texts: { da: {subheader, body}, … } }.
 * @param {any} db @param {string} kind @param {string} ref
 */
export async function getBrandPage(db, kind, ref) {
	const [pageRes, textRes] = await db.batch([
		db.prepare('SELECT image_key, updated_by, updated_at FROM brand_page WHERE kind = ? AND ref = ?').bind(kind, ref),
		db.prepare('SELECT language, subheader, body FROM brand_page_text WHERE kind = ? AND ref = ?').bind(kind, ref)
	]);
	const page = /** @type {any} */ (pageRes.results?.[0]) ?? {};
	/** @type {Record<string, {subheader: string, body: string}>} */
	const texts = {};
	for (const l of BRAND_LANGS) texts[l] = { subheader: '', body: '' };
	for (const r of /** @type {any[]} */ (textRes.results ?? [])) texts[r.language] = { subheader: r.subheader ?? '', body: r.body ?? '' };
	return { image_key: page.image_key ?? null, updated_by: page.updated_by ?? null, updated_at: page.updated_at ?? null, texts };
}

/** Which languages have any text, per ref — for the overview dots. @param {any} db @param {string} kind @param {string[]} refs */
export async function brandPageStatus(db, kind, refs) {
	/** @type {Record<string, {image: boolean, langs: string[]}>} */
	const out = {};
	if (!refs.length) return out;
	const ph = refs.map(() => '?').join(',');
	const [pages, texts] = await db.batch([
		db.prepare(`SELECT ref, image_key FROM brand_page WHERE kind = ? AND ref IN (${ph})`).bind(kind, ...refs),
		db.prepare(`SELECT ref, language FROM brand_page_text WHERE kind = ? AND ref IN (${ph})
			AND (trim(COALESCE(subheader,'')) != '' OR trim(COALESCE(body,'')) != '')`).bind(kind, ...refs)
	]);
	for (const r of /** @type {any[]} */ (pages.results ?? [])) (out[r.ref] ??= { image: false, langs: [] }).image = !!r.image_key;
	for (const r of /** @type {any[]} */ (texts.results ?? [])) (out[r.ref] ??= { image: false, langs: [] }).langs.push(r.language);
	return out;
}

/**
 * Save texts (only the languages given) and touch updated_*.
 * @param {any} db @param {string} kind @param {string} ref
 * @param {Record<string, {subheader?: string, body?: string}>} texts
 * @param {string} by
 */
export async function saveBrandTexts(db, kind, ref, texts, by) {
	const stmts = [touch(db, kind, ref, by)];
	for (const [lang, t] of Object.entries(texts ?? {})) {
		if (!BRAND_LANGS.includes(lang)) continue;
		const sub = String(t?.subheader ?? '').trim();
		const body = String(t?.body ?? '').trim();
		stmts.push(sub || body
			? db.prepare(`INSERT INTO brand_page_text (kind, ref, language, subheader, body) VALUES (?,?,?,?,?)
				ON CONFLICT (kind, ref, language) DO UPDATE SET subheader = excluded.subheader, body = excluded.body`).bind(kind, ref, lang, sub, body)
			: db.prepare('DELETE FROM brand_page_text WHERE kind = ? AND ref = ? AND language = ?').bind(kind, ref, lang));
	}
	await db.batch(stmts);
}

/** Set (or clear, with null) the image. Returns the previous key. @param {any} db @param {string} kind @param {string} ref @param {string|null} key @param {string} by */
export async function setBrandImage(db, kind, ref, key, by) {
	const prev = /** @type {any} */ (await db.prepare('SELECT image_key FROM brand_page WHERE kind = ? AND ref = ?').bind(kind, ref).first())?.image_key ?? null;
	await db.batch([
		touch(db, kind, ref, by),
		db.prepare('UPDATE brand_page SET image_key = ? WHERE kind = ? AND ref = ?').bind(key, kind, ref)
	]);
	return prev;
}

/** Remove all content for a publisher/series (when it is deleted). @param {any} db @param {string} kind @param {string} ref */
export async function deleteBrandPage(db, kind, ref) {
	await db.batch([
		db.prepare('DELETE FROM brand_page_text WHERE kind = ? AND ref = ?').bind(kind, ref),
		db.prepare('DELETE FROM brand_page WHERE kind = ? AND ref = ?').bind(kind, ref)
	]);
}

/** @param {any} db @param {string} kind @param {string} ref @param {string} by */
function touch(db, kind, ref, by) {
	return db.prepare(`INSERT INTO brand_page (kind, ref, updated_by, updated_at) VALUES (?,?,?,datetime('now'))
		ON CONFLICT (kind, ref) DO UPDATE SET updated_by = excluded.updated_by, updated_at = excluded.updated_at`).bind(kind, ref, by);
}

/**
 * Every publisher and series with its landing-page content, for the shop.
 * Lists ALL of them (content or not) so the shop can make a page for each;
 * `has_content` says whether anything was filled in.
 * @param {any} db SALES_DB
 * @param {string} origin e.g. https://portal…  (image URLs)
 * @param {{ publisher?: string | null }} [opts]
 */
export async function buildBrandFeed(db, origin, opts = {}) {
	const only = opts.publisher?.trim() || null;
	const [pubRes, serRes, pageRes, textRes, prefixRes] = await db.batch([
		only
			? db.prepare('SELECT name FROM publisher WHERE name = ?').bind(only)
			: db.prepare('SELECT name FROM publisher ORDER BY name COLLATE NOCASE'),
		only
			? db.prepare(`SELECT s.id, s.publisher, s.name, (SELECT COUNT(*) FROM product_series ps WHERE ps.series_id = s.id) AS product_count
				FROM series s WHERE s.publisher = ? ORDER BY s.name COLLATE NOCASE`).bind(only)
			: db.prepare(`SELECT s.id, s.publisher, s.name, (SELECT COUNT(*) FROM product_series ps WHERE ps.series_id = s.id) AS product_count
				FROM series s ORDER BY s.publisher COLLATE NOCASE, s.name COLLATE NOCASE`),
		db.prepare('SELECT kind, ref, image_key, updated_at FROM brand_page'),
		db.prepare('SELECT kind, ref, language, subheader, body FROM brand_page_text'),
		db.prepare('SELECT prefix, publisher FROM publisher_prefix ORDER BY prefix')
	]);

	const imgUrl = (/** @type {string|null} */ key) => (key ? `${origin}/api/img/${key}` : null);
	/** @type {Map<string, any>} */
	const pages = new Map();
	for (const p of /** @type {any[]} */ (pageRes.results ?? [])) pages.set(`${p.kind}\u0000${p.ref}`, p);
	/** @type {Map<string, Record<string, {subheader: string|null, text: string|null}>>} */
	const texts = new Map();
	for (const t of /** @type {any[]} */ (textRes.results ?? [])) {
		const k = `${t.kind}\u0000${t.ref}`;
		if (!texts.has(k)) texts.set(k, {});
		/** @type {any} */ (texts.get(k))[t.language] = { subheader: t.subheader || null, text: t.body || null };
	}
	/** @type {Record<string, string[]>} */
	const prefixes = {};
	for (const r of /** @type {any[]} */ (prefixRes.results ?? [])) (prefixes[r.publisher] ??= []).push(r.prefix);

	const content = (/** @type {string} */ kind, /** @type {string} */ ref) => {
		const page = pages.get(`${kind}\u0000${ref}`);
		const t = texts.get(`${kind}\u0000${ref}`) ?? {};
		/** @type {Record<string, {subheader: string|null, text: string|null}>} */
		const byLang = {};
		for (const l of BRAND_LANGS) byLang[l] = t[l] ?? { subheader: null, text: null };
		const image = imgUrl(page?.image_key ?? null);
		return {
			image, // 4:3 original (PNG if transparent, else JPEG)
			image_cdn: page?.image_key ? `https://img.spilbraet.dk/${page.image_key}` : null, // WebP, append ?w=300|600|1000|1600
			texts: byLang,
			has_content: !!image || Object.keys(t).length > 0,
			updated_at: page?.updated_at ?? null
		};
	};

	/** @type {Map<string, any[]>} */
	const seriesBy = new Map();
	for (const s of /** @type {any[]} */ (serRes.results ?? [])) {
		if (!seriesBy.has(s.publisher)) seriesBy.set(s.publisher, []);
		/** @type {any[]} */ (seriesBy.get(s.publisher)).push({
			id: s.id, name: s.name, slug: slugify(s.name), product_count: s.product_count ?? 0, ...content('series', s.id)
		});
	}

	const publishers = (/** @type {any[]} */ (pubRes.results ?? [])).map((p) => ({
		name: p.name,
		slug: slugify(p.name),
		sku_prefixes: prefixes[p.name] ?? [],
		...content('publisher', p.name),
		series: seriesBy.get(p.name) ?? []
	}));

	return { generated_at: new Date().toISOString(), languages: BRAND_LANGS, publishers };
}
