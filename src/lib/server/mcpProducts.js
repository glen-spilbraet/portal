/**
 * Product data for the MCP server. Assembles everything shown on a sales sheet
 * (identity, text, bullets, attributes, images) from sales_sheets + translations
 * + data_fields + sheet_images. Read-only.
 */
import { getSheet, getTranslations, getImages } from '$lib/db.js';

const LANGS = ['en', 'da', 'sv', 'no'];
const MAX_USP = 8;

/** Fuzzy search by SKU, product name (any language) or EAN/data-field text. */
export async function searchProducts(db, query, limit = 30) {
	const q = `%${(query ?? '').toLowerCase().trim()}%`;
	const rows = await db
		.prepare(
			`SELECT s.id, s.sku, s.status, s.primary_language,
			        (SELECT value FROM translations t WHERE t.sheet_id = s.id AND t.key = 'product_name'
			          ORDER BY (t.language = s.primary_language) DESC, (t.language = 'en') DESC LIMIT 1) AS name
			 FROM sales_sheets s
			 WHERE lower(s.sku) LIKE ?
			    OR lower(COALESCE(s.data_fields, '')) LIKE ?
			    OR EXISTS (SELECT 1 FROM translations tx WHERE tx.sheet_id = s.id AND tx.key = 'product_name' AND lower(COALESCE(tx.value, '')) LIKE ?)
			 ORDER BY s.updated_at DESC
			 LIMIT ?`
		)
		.bind(q, q, q, limit)
		.all();
	return (rows.results ?? []).map((r) => ({ sku: r.sku, name: r.name || r.sku, status: r.status ?? null }));
}

/** Map a data_fields JSON array into a plain {key: value} object (non-empty). */
function fieldMap(dataFields) {
	let arr = [];
	try { arr = JSON.parse(dataFields || '[]'); } catch { arr = []; }
	const out = {};
	for (const f of arr) if (f?.key && f.value != null && `${f.value}`.trim() !== '') out[f.key] = f.value;
	return out;
}

/** Full structured product for one SKU. `origin` builds absolute image URLs. */
export async function getProductBySku(db, sku, lang, origin) {
	const row = await db
		.prepare('SELECT * FROM sales_sheets WHERE lower(sku) = lower(?) ORDER BY updated_at DESC LIMIT 1')
		.bind(sku)
		.first();
	if (!row) return null;

	const [translations, images] = await Promise.all([getTranslations(db, row.id), getImages(db, row.id)]);
	const primary = row.primary_language ?? 'en';
	const L = lang && LANGS.includes(lang) ? lang : primary;
	const t = (language) => translations[language] ?? {};

	const pick = (key) => t(L)[key] || t(primary)[key] || '';
	const bullets = [];
	for (let i = 1; i <= MAX_USP; i++) {
		const v = pick(`usp_${i}`);
		if (v && v.trim()) bullets.push(v.trim());
	}
	const names = {};
	for (const l of LANGS) if (t(l).product_name) names[l] = t(l).product_name;

	const f = fieldMap(row.data_fields);
	const imgUrl = (key) => (key ? `${origin}/api/img/${key}` : null);
	const availableLanguages = LANGS.filter((l) => Object.keys(translations[l] ?? {}).length > 0);

	return {
		sku: row.sku,
		status: row.status ?? null,
		language: L,
		primary_language: primary,
		available_languages: availableLanguages,
		name: pick('product_name') || row.sku,
		names,
		description: pick('product_description'),
		bullets,
		attributes: {
			ean: f.ean ?? null,
			age: f.age ?? null,
			play_time: f.time ?? null,
			players: f.players ?? null,
			height: f.height ?? null,
			width: f.width ?? null,
			depth: f.depth ?? null,
			weight: f.weight ?? null,
			stock_date: f.stock_date ?? null
		},
		images: {
			box: imgUrl(row.box_image_key),
			gallery: (images ?? []).map((im) => imgUrl(im.r2_key)).filter(Boolean)
		},
		youtube_url: row.youtube_url ?? null
	};
}

/** Raw image bytes (base64) for a SKU — box image or a gallery index. */
export async function getProductImageBytes(platform, db, sku, which = 'box') {
	const bucket = platform?.env?.IMAGES;
	if (!bucket) return { error: 'Image storage unavailable' };
	const row = await db
		.prepare('SELECT id, box_image_key FROM sales_sheets WHERE lower(sku) = lower(?) ORDER BY updated_at DESC LIMIT 1')
		.bind(sku)
		.first();
	if (!row) return { error: `No product with SKU ${sku}` };

	let key = row.box_image_key;
	if (which !== 'box') {
		const idx = Number(which);
		const images = await getImages(db, row.id);
		key = Number.isInteger(idx) ? images?.[idx]?.r2_key : null;
	}
	if (!key) return { error: `No ${which} image for SKU ${sku}` };

	// Prefer a smaller webp variant (good for vision, small payload); fall back.
	const dot = key.lastIndexOf('.');
	const slash = key.lastIndexOf('/');
	const variantKey = dot > slash ? key.slice(0, dot) + '_400.webp' : key + '_400.webp';
	let obj = await bucket.get(variantKey);
	let mimeType = 'image/webp';
	if (!obj) {
		obj = await bucket.get(key);
		mimeType = obj?.httpMetadata?.contentType || 'image/jpeg';
	}
	if (!obj) return { error: 'Image object not found' };

	const buf = await obj.arrayBuffer();
	const bytes = new Uint8Array(buf);
	let binary = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
	return { base64: btoa(binary), mimeType };
}
