/**
 * Product content feed for the B2B shop (glen-spilbraet/shop). Read-only.
 *
 * The shop takes its product list from Rackbeat and layers this on top: sheet
 * texts per language, images, facts, awards, plus the publisher/series mapping
 * for every SKU. Texts are passed through as written: no fallback between
 * languages, no translation. That is the shop's rule, not ours to apply here.
 *
 * Sheets and awards come from DB (env-specific); the publisher and series
 * mapping from SALES_DB (shared prod), same as everywhere else in the portal.
 */
import { listAllInstances, getBadgesForSkus } from './awards.js';

const MAX_USP = 8;

/** @param {string | null | undefined} dataFields */
function fieldMap(dataFields) {
	let arr = [];
	try { arr = JSON.parse(dataFields || '[]'); } catch { arr = []; }
	/** @type {Record<string, string>} */
	const out = {};
	for (const f of arr) if (f?.key && f.value != null && `${f.value}`.trim() !== '') out[f.key] = `${f.value}`.trim();
	return out;
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {import('@cloudflare/workers-types').D1Database} salesDb
 * @param {string} origin absolute base for image URLs
 */
export async function buildShopFeed(db, salesDb, origin) {
	const imgUrl = (/** @type {string | null} */ key) => (key ? `${origin}/api/img/${key}` : null);

	const [sheetsRes, trRes, imgRes] = await db.batch([
		db.prepare(`SELECT id, sku, primary_language, box_image_key, data_fields, youtube_url, updated_at, awards_updated_at
			FROM sales_sheets WHERE trim(sku) != '' ORDER BY updated_at DESC`),
		db.prepare(`SELECT sheet_id, language, key, value FROM translations WHERE trim(value) != ''`),
		db.prepare(`SELECT sheet_id, r2_key FROM sheet_images ORDER BY display_order ASC`)
	]);

	/** @type {Record<string, Record<string, Record<string, string>>>} */
	const tr = {};
	for (const r of /** @type {any[]} */ (trRes.results ?? [])) ((tr[r.sheet_id] ??= {})[r.language] ??= {})[r.key] = String(r.value).trim();

	/** @type {Record<string, string[]>} */
	const gallery = {};
	for (const r of /** @type {any[]} */ (imgRes.results ?? [])) (gallery[r.sheet_id] ??= []).push(r.r2_key);

	// Awards keyed by every SKU an instance names (main + additional products).
	/** @type {Record<string, any[]>} */
	const awards = {};
	for (const i of await listAllInstances(db)) {
		const entry = {
			media: i.media_name,
			media_country: i.media_country ?? null,
			award_category: i.award_category ?? null,
			is_nominated: !!i.is_nominated,
			is_winner: !!i.is_winner,
			instance_date: i.instance_date ?? null,
			disclosure_date: i.disclosure_date ?? null,
			badges: { nominee: imgUrl(i.nominee_badge_key), winner: imgUrl(i.winner_badge_key) },
			statements: (i.statements ?? []).map((/** @type {any} */ s) => ({ statement: s.statement ?? null, score: s.score ?? null }))
		};
		const skus = [i.sku, ...(i.additional_products ?? []).map((/** @type {any} */ a) => a.sku)];
		for (const sku of new Set(skus.filter(Boolean).map((/** @type {string} */ s) => s.toLowerCase()))) (awards[sku] ??= []).push(entry);
	}

	const products = [];
	const seen = new Set();
	// Newest sheet wins if a SKU has more than one.
	for (const s of /** @type {any[]} */ (sheetsRes.results ?? [])) {
		const key = String(s.sku).trim().toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);

		/** @type {Record<string, { name: string | null, description: string | null, usps: string[] }>} */
		const texts = {};
		for (const [lang, t] of Object.entries(tr[s.id] ?? {})) {
			const usps = [];
			for (let n = 1; n <= MAX_USP; n++) if (t[`usp_${n}`]) usps.push(t[`usp_${n}`]);
			if (t.product_name || t.product_description || usps.length) {
				texts[lang] = { name: t.product_name ?? null, description: t.product_description ?? null, usps };
			}
		}
		const f = fieldMap(s.data_fields);
		products.push({
			sku: String(s.sku).trim(),
			updated_at: Math.max(Number(s.updated_at) || 0, Number(s.awards_updated_at) || 0),
			primary_language: s.primary_language ?? null,
			texts,
			facts: {
				ean: f.ean ?? null,
				players: f.players ?? null,
				age: f.age ?? null,
				play_time: f.time ?? null,
				width: f.width ?? null,
				height: f.height ?? null,
				depth: f.depth ?? null,
				weight: f.weight ?? null
			},
			images: {
				box: imgUrl(s.box_image_key),
				gallery: (gallery[s.id] ?? []).map(imgUrl).filter(Boolean)
			},
			youtube_url: s.youtube_url || null,
			awards: awards[key] ?? []
		});
	}

	// Box badges exactly as the sheets and catalogues resolve them: winner badge
	// once disclosed, else nominee; newest first, with each outlet's corners,
	// padding (% of box) and size (% of box width).
	const today = new Date().toISOString().slice(0, 10);
	const badgesBySku = /** @type {Record<string, any[]>} */ (await getBadgesForSkus(db, products.map((p) => p.sku), today));
	for (const p of products) {
		/** @type {any} */ (p).badges = (badgesBySku[p.sku] ?? []).map((/** @type {any} */ b) => ({
			image: imgUrl(b.image_key),
			kind: b.kind,
			media: b.media,
			placement: b.placement,
			placement_2: b.placement_2,
			pad: b.pad,
			size_pct: b.size_pct
		}));
	}

	const [prefixRes, overrideRes, seriesRes] = await salesDb.batch([
		salesDb.prepare('SELECT prefix, publisher FROM publisher_prefix ORDER BY prefix'),
		salesDb.prepare('SELECT sku, publisher FROM product_publisher_override ORDER BY sku'),
		salesDb.prepare(`SELECT ps.sku, s.name AS series, s.publisher
			FROM product_series ps JOIN series s ON s.id = ps.series_id ORDER BY ps.sku`)
	]);

	return {
		generated_at: new Date().toISOString(),
		image_sizes: [300, 400, 1000, 1600], // append ?size=N to any image URL
		products,
		publishers: {
			// Resolve a SKU like the sales sync does: override first, else the prefix
			// equal to the SKU's leading letters, uppercased ("GO919150" → "GO").
			overrides: overrideRes.results ?? [],
			prefixes: prefixRes.results ?? []
		},
		series: seriesRes.results ?? []
	};
}
