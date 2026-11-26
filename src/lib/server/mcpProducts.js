/**
 * Product data for the MCP server. Assembles everything shown on a sales sheet
 * (identity, text, bullets, attributes, images) from sales_sheets + translations
 * + data_fields + sheet_images. Read-only.
 */
import { getSheet, getTranslations, getImages } from '$lib/db.js';
import { LANGS, normalizeLang } from '$lib/languages.js';
import { sanitizeProductLanguages, productLanguageName } from '$lib/productLanguages.js';
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
	const L = normalizeLang(lang) ?? primary;
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
		// Languages the product itself comes in (components / rule book). manual_only = only the rule book.
		product_languages: sanitizeProductLanguages(row.product_languages).map((l) => ({ code: l.code, name: productLanguageName(l.code), manual_only: !!l.manual_only })),
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
			flat: imgUrl(row.box_flat_image_key),
			gallery: (images ?? []).map((im) => imgUrl(im.r2_key)).filter(Boolean)
		},
		youtube_url: row.youtube_url ?? null,
		stock: stockOf(row, await getStockMeta(db))
	};
}

// ── Rackbeat stock (mirrored hourly onto sales_sheets.rb_* by the worker) ────

/** Last stock sync run → { as_of, status, message } (null if never run). */
export async function getStockMeta(db) {
	const m = await db.prepare('SELECT last_run, status, message FROM rb_sync_meta WHERE id = 1').first().catch(() => null);
	return m ? { as_of: m.last_run, status: m.status, message: m.message || null } : null;
}

function stockOf(row, meta) {
	if (row.rb_available == null && row.rb_stock == null) {
		return { available: null, note: meta ? 'SKU not found in Rackbeat' : 'Stock not synced yet' };
	}
	return {
		available: row.rb_available,
		barred: row.rb_barred == null ? null : !!row.rb_barred,
		on_hand: row.rb_stock,
		in_order: row.rb_in_order,
		on_purchase_order: row.rb_purchased,
		as_of: meta?.as_of ?? null
	};
}

/**
 * Available stock (Rackbeat "Til rådighed") for products with a sales sheet.
 * Select by `skus` (exact) and/or `query` (SKU prefix / part of SKU or name);
 * optional `max_available` / `min_available` filters (e.g. low stock).
 */
export async function getStock(db, { skus, query, max_available, min_available, limit } = {}) {
	const where = [`trim(s.sku) != ''`];
	const binds = [];
	const list = (Array.isArray(skus) ? skus : typeof skus === 'string' ? skus.split(/[\s,;]+/) : [])
		.map((x) => String(x).trim().toUpperCase()).filter(Boolean).slice(0, 300);
	if (list.length) {
		where.push(`upper(trim(s.sku)) IN (${list.map(() => '?').join(',')})`);
		binds.push(...list);
	}
	const q = String(query ?? '').trim().toLowerCase();
	if (q) {
		where.push(`(lower(s.sku) LIKE ? OR EXISTS (SELECT 1 FROM translations tx WHERE tx.sheet_id = s.id AND tx.key = 'product_name' AND lower(COALESCE(tx.value, '')) LIKE ?))`);
		binds.push(`${q}%`, `%${q}%`);
	}
	if (!list.length && !q && max_available == null && min_available == null) {
		return { error: 'Pass skus, query, or an available filter (max_available / min_available).' };
	}
	if (max_available != null && Number.isFinite(Number(max_available))) { where.push('s.rb_available <= ?'); binds.push(Number(max_available)); }
	if (min_available != null && Number.isFinite(Number(min_available))) { where.push('s.rb_available >= ?'); binds.push(Number(min_available)); }
	const cap = Math.min(Math.max(Number(limit) || 200, 1), 500);

	const [rows, meta] = await Promise.all([
		db.prepare(
			`SELECT s.sku, s.rb_barred, s.rb_available, s.rb_stock, s.rb_in_order, s.rb_purchased,
			        (SELECT value FROM translations t WHERE t.sheet_id = s.id AND t.key = 'product_name'
			          ORDER BY (t.language = s.primary_language) DESC, (t.language = 'en') DESC LIMIT 1) AS name
			 FROM sales_sheets s WHERE ${where.join(' AND ')}
			 ORDER BY s.sku LIMIT ?`
		).bind(...binds, cap + 1).all(),
		getStockMeta(db)
	]);
	const all = rows.results ?? [];
	const results = all.slice(0, cap).map((r) => ({
		sku: r.sku,
		name: r.name || r.sku,
		available: r.rb_available,
		barred: r.rb_barred == null ? null : !!r.rb_barred,
		on_hand: r.rb_stock,
		in_order: r.rb_in_order,
		on_purchase_order: r.rb_purchased
	}));
	const found = new Set(results.map((r) => String(r.sku).trim().toUpperCase()));
	return {
		source: 'Rackbeat (available_quantity = "Til rådighed"), synced hourly',
		as_of: meta?.as_of ?? null,
		sync_status: meta?.status ?? 'never run',
		count: results.length,
		truncated: all.length > cap,
		results,
		...(list.length ? { no_sheet: list.filter((x) => !found.has(x)) } : {})
	};
}

/** Raw image bytes (base64) for a SKU — box image or a gallery index. */
export async function getProductImageBytes(platform, db, sku, which = 'box') {
	const bucket = platform?.env?.IMAGES;
	if (!bucket) return { error: 'Image storage unavailable' };
	const row = await db
		.prepare(`SELECT id, COALESCE(NULLIF(box_image_key, ''), NULLIF(box_flat_image_key, '')) AS box_image_key FROM sales_sheets WHERE lower(sku) = lower(?) ORDER BY updated_at DESC LIMIT 1`)
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
