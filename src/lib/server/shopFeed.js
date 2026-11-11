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
import { listTaxonomy } from './categories.js';
import { membersByDeal } from './exclusivity.js';

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
 * Every award/review instance per SKU (main product + additional products) in
 * ONE query, with what both the `awards` list and the box `badges` need.
 * `skus` (lowercase) narrows it to those products.
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string[] | null} skus
 */
async function loadAwardRows(db, skus) {
	const filter = skus ? `WHERE lower(s.sku) IN (${skus.map(() => '?').join(',')})` : '';
	const rows = /** @type {any[]} */ ((await db.prepare(
		`SELECT lower(s.sku) AS sku, i.id, i.is_nominated, i.is_winner, i.award_category, i.instance_date, i.disclosure_date,
		        i.nominee_badge_key, i.winner_badge_key, i.created_at,
		        m.name AS media_name, m.country AS media_country, m.badge_placement, m.badge_placement_2,
		        m.badge_pad_top, m.badge_pad_right, m.badge_pad_bottom, m.badge_pad_left, m.badge_size_pct
		 FROM (SELECT id AS instance_id, sku FROM press_instance WHERE sku IS NOT NULL AND sku != ''
		       UNION SELECT instance_id, sku FROM press_instance_product WHERE sku IS NOT NULL AND sku != '') s
		 JOIN press_instance i ON i.id = s.instance_id
		 JOIN award_media m ON m.id = i.media_id
		 ${filter}`
	).bind(...(skus ?? [])).all()).results ?? []);
	// Same sku listed twice on one instance → once.
	const seen = new Set();
	const out = rows.filter((r) => { const k = `${r.id}|${r.sku}`; if (seen.has(k)) return false; seen.add(k); return true; });

	const ids = [...new Set(out.map((r) => r.id))];
	/** @type {Record<string, any[]>} */
	const statements = {};
	const stmtRows = /** @type {any[]} */ (skus
		? (ids.length ? (await db.prepare(`SELECT instance_id, statement, score FROM award_statement WHERE instance_id IN (${ids.map(() => '?').join(',')}) ORDER BY rowid`).bind(...ids).all()).results ?? [] : [])
		: (await db.prepare('SELECT instance_id, statement, score FROM award_statement ORDER BY rowid').all()).results ?? []);
	for (const st of stmtRows) (statements[st.instance_id] ??= []).push({ statement: st.statement ?? null, score: st.score ?? null });
	return { rows: out, statements };
}

/**
 * The feed's catalogue-wide sections (publisher prefixes/overrides, series,
 * publisher market licences, every product's webshop publish state). These stay
 * COMPLETE even in a ?sku= refresh (the shop may rely on that), but reading them
 * in full on each of the shop's thousands of per-product calls was ~half of all
 * database load. So for ?sku= calls they come from a short-lived per-isolate
 * copy (≤ GLOBALS_TTL_MS old), with the requested SKUs' rows always read fresh
 * (by primary key) and merged in — the product being refreshed is never stale.
 * The full feed always reads everything fresh.
 * @param {import('@cloudflare/workers-types').D1Database} salesDb
 * @param {string[] | null} skuVariants requested SKUs (as given/upper/lower), or null = full feed
 */
const GLOBALS_TTL_MS = 5 * 60 * 1000;
/** @type {{ at: number, data: any } | null} */
let globalsCache = null;
async function readGlobals(salesDb, skuVariants) {
	const where = (col) => (skuVariants ? ` WHERE ${col} IN (${skuVariants.map(() => '?').join(',')})` : '');
	const v = skuVariants ?? [];
	const [prefixRes, overrideRes, seriesRes] = await salesDb.batch([
		salesDb.prepare('SELECT prefix, publisher FROM publisher_prefix ORDER BY prefix'),
		salesDb.prepare(`SELECT sku, publisher FROM product_publisher_override${where('sku')} ORDER BY sku`).bind(...v),
		salesDb.prepare(`SELECT ps.sku, s.name AS series, s.publisher
			FROM product_series ps JOIN series s ON s.id = ps.series_id${where('ps.sku')} ORDER BY ps.sku`).bind(...v)
	]);
	// Webshop market licensing: markets allowed per publisher, and each product's
	// publish state. published_markets NULL = default (all the publisher allows).
	// Guarded — the tables arrive with migration 0080.
	/** @type {Record<string, string[]>} */
	const publisherMarkets = {};
	/** @type {any[]} */
	let productWebshop = [];
	try {
		const [marketRes, webshopRes] = await salesDb.batch([
			salesDb.prepare('SELECT publisher, market FROM publisher_market ORDER BY publisher, market'),
			salesDb.prepare(`SELECT sku, published_markets, override_license FROM product_webshop${where('sku')} ORDER BY sku`).bind(...v)
		]);
		for (const r of /** @type {any[]} */ (marketRes.results ?? [])) (publisherMarkets[r.publisher] ??= []).push(r.market);
		productWebshop = (/** @type {any[]} */ (webshopRes.results ?? [])).map((r) => ({
			sku: r.sku,
			published_markets: r.published_markets == null ? null : (() => { try { return JSON.parse(r.published_markets); } catch { return []; } })(),
			override_license: !!r.override_license
		}));
	} catch { /* migration 0080 not applied yet */ }
	return { prefixes: prefixRes.results ?? [], overrides: overrideRes.results ?? [], series: seriesRes.results ?? [], publisherMarkets, productWebshop };
}
/**
 * Exclusivity agreements for the shop (Admin → Exclusivity): in a market with a
 * running agreement, a product may ONLY be shown to the customers in it.
 * Expired agreements are left out; upcoming ones are included (the shop applies
 * start/end dates itself — no webhook fires when a date passes). Customer-group
 * parties are expanded to their HubSpot company ids (`company_ids`, from the
 * sales mirror) so the shop only has to know its customer's company id.
 * customer_numbers = the resolved customers' Rackbeat numbers (exclusivity_member,
 * filled from HubSpot on save / "Refresh customers") — what the shop matches on.
 * Tiny table — read fresh on every call; group expansion only for the groups in play.
 * @param {import('@cloudflare/workers-types').D1Database} salesDb
 * @param {string[] | null} skuVariants
 */
async function readExclusivity(salesDb, skuVariants) {
	const today = new Date().toISOString().slice(0, 10);
	const v = skuVariants ?? [];
	const skuWhere = skuVariants ? ` AND lower(sku) IN (${[...new Set(v.map((x) => x.toLowerCase()))].map(() => '?').join(',')})` : '';
	let deals = [];
	try {
		deals = (await salesDb.prepare(
			`SELECT id, sku, market, start_date, end_date FROM exclusivity_deal
			 WHERE (end_date IS NULL OR end_date >= ?)${skuWhere} ORDER BY sku, market`
		).bind(today, ...(skuVariants ? [...new Set(v.map((x) => x.toLowerCase()))] : [])).all()).results ?? [];
	} catch { return []; } // migration 0103 not applied
	if (!deals.length) return [];
	const ids = deals.map((d) => d.id);
	const parties = (await salesDb.prepare(
		`SELECT deal_id, kind, ref, label FROM exclusivity_party WHERE deal_id IN (${ids.map(() => '?').join(',')})`
	).bind(...ids).all()).results ?? [];
	const groups = [...new Set(parties.filter((p) => p.kind === 'group').map((p) => p.ref))];
	/** @type {Map<string, string[]>} */
	const members = new Map();
	if (groups.length) {
		const rows = (await salesDb.prepare(
			`SELECT DISTINCT customer_group AS g, company_id AS c FROM sales_deals
			 WHERE customer_group IN (${groups.map(() => '?').join(',')}) AND company_id IS NOT NULL AND company_id <> ''`
		).bind(...groups).all()).results ?? [];
		for (const r of rows) (members.get(r.g) ?? members.set(r.g, []).get(r.g)).push(String(r.c));
	}
	const byDeal = new Map();
	for (const p of parties) (byDeal.get(p.deal_id) ?? byDeal.set(p.deal_id, []).get(p.deal_id)).push(p);
	// Resolved customers (HubSpot, incl. group members) with Rackbeat numbers.
	const resolved = await membersByDeal(salesDb, ids);
	return deals.map((d) => {
		const ps = byDeal.get(d.id) ?? [];
		const companyIds = new Set();
		for (const p of ps) {
			if (p.kind === 'company') companyIds.add(String(p.ref));
			else for (const c of members.get(p.ref) ?? []) companyIds.add(c);
		}
		const numbers = new Set();
		for (const m of resolved.get(d.id) ?? []) {
			companyIds.add(String(m.company_id));
			const n = Number(String(m.customer_number ?? '').trim());
			if (m.customer_number != null && Number.isFinite(n)) numbers.add(n);
		}
		return {
			id: d.id, sku: d.sku, market: d.market,
			start_date: d.start_date ?? null, end_date: d.end_date ?? null,
			active: (!d.start_date || d.start_date <= today) && (!d.end_date || d.end_date >= today),
			parties: ps.map((p) => ({ kind: p.kind, ref: String(p.ref), label: p.label ?? p.ref })),
			company_ids: [...companyIds].sort(),
			customer_numbers: [...numbers].sort((a, b) => a - b), // Rackbeat customer numbers (groups expanded)
		};
	});
}
async function loadGlobals(salesDb, skuVariants) {
	if (!skuVariants) return readGlobals(salesDb, null);
	const now = Date.now();
	if (!globalsCache || now - globalsCache.at > GLOBALS_TTL_MS) {
		globalsCache = { at: now, data: await readGlobals(salesDb, null) };
	}
	const fresh = await readGlobals(salesDb, skuVariants);
	const g = globalsCache.data;
	const keys = new Set(skuVariants.map((x) => x.toLowerCase()));
	/** @param {any[]} all @param {any[]} upd */
	const merge = (all, upd) => [...all.filter((r) => !keys.has(String(r.sku).toLowerCase())), ...upd]
		.sort((x, y) => String(x.sku).localeCompare(String(y.sku)));
	return {
		prefixes: fresh.prefixes,                 // tiny — always fresh
		publisherMarkets: fresh.publisherMarkets, // tiny — always fresh
		overrides: merge(g.overrides, fresh.overrides),
		series: merge(g.series, fresh.series),
		productWebshop: merge(g.productWebshop, fresh.productWebshop),
	};
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {import('@cloudflare/workers-types').D1Database} salesDb
 * @param {string} origin absolute base for image URLs
 * @param {{ skus?: string[] }} [opts] only these SKUs (the shop's instant refresh
 *   after a save) — every query is narrowed, instead of building the whole
 *   catalogue and filtering afterwards.
 */
export async function buildShopFeed(db, salesDb, origin, opts = {}) {
	const imgUrl = (/** @type {string | null} */ key) => (key ? `${origin}/api/img/${key}` : null);
	const only = opts.skus?.length ? [...new Set(opts.skus.map((s) => String(s).trim().toLowerCase()).filter(Boolean))] : null;
	const inList = only ? only.map(() => '?').join(',') : '';
	// Index-friendly SKU matching for the per-product refresh (the shop calls it
	// thousands of times a day): sheets via the lower(sku) index (migration 0109;
	// SKUs carry no stray spaces), and the SALES_DB tables by their exact-SKU
	// primary keys, trying the SKU as given + upper/lower case. (lower(trim(sku))
	// and lower(sku) on those tables forced a full scan on every call.)
	const sheetFilter = only ? ` AND lower(sku) IN (${inList})` : '';
	const bySheet = only ? ` WHERE sheet_id IN (SELECT id FROM sales_sheets WHERE lower(sku) IN (${inList}))` : '';
	const andBySheet = only ? ` AND sheet_id IN (SELECT id FROM sales_sheets WHERE lower(sku) IN (${inList}))` : '';
	const b = only ?? [];
	const variants = only ? [...new Set((opts.skus ?? []).flatMap((x) => { const t = String(x).trim(); return t ? [t, t.toUpperCase(), t.toLowerCase()] : []; }))] : [];
	const vList = variants.map(() => '?').join(',');

	const [sheetsRes, trRes, imgRes, videoRes, articleRes] = await db.batch([
		db.prepare(`SELECT id, sku, primary_language, box_image_key, box_flat_image_key, data_fields, youtube_url, preorder_date, restock_date, featured_at, updated_at, awards_updated_at
			FROM sales_sheets WHERE trim(sku) != ''${sheetFilter} ORDER BY updated_at DESC`).bind(...b),
		db.prepare(`SELECT sheet_id, language, key, value FROM translations WHERE trim(value) != ''${andBySheet}`).bind(...b),
		db.prepare(`SELECT sheet_id, r2_key, type FROM sheet_images${bySheet} ORDER BY display_order ASC`).bind(...b),
		db.prepare(`SELECT sheet_id, url, orientation, markets FROM sheet_video${bySheet} ORDER BY display_order ASC, created_at ASC`).bind(...b),
		db.prepare(`SELECT sheet_id, url, title, description, site_name, image_key, image_url, favicon_url, markets FROM sheet_article${bySheet} ORDER BY display_order ASC, created_at ASC`).bind(...b)
	]);

	// markets: JSON array of DK/SE/NO/INT/PL, or null = available in all markets.
	const mkts = (/** @type {string|null} */ v) => { if (v == null) return null; try { return JSON.parse(v); } catch { return null; } };

	/** @type {Record<string, any[]>} */
	const videos = {};
	for (const r of /** @type {any[]} */ (videoRes.results ?? [])) (videos[r.sheet_id] ??= []).push({ url: r.url, orientation: r.orientation === '9:16' ? '9:16' : '16:9', markets: mkts(r.markets) });

	/** @type {Record<string, any[]>} */
	const articles = {};
	for (const r of /** @type {any[]} */ (articleRes.results ?? [])) (articles[r.sheet_id] ??= []).push({
		url: r.url, title: r.title, description: r.description, site_name: r.site_name,
		image: imgUrl(r.image_key) || r.image_url || null, favicon: r.favicon_url || null, markets: mkts(r.markets)
	});

	/** @type {Record<string, Record<string, Record<string, string>>>} */
	const tr = {};
	for (const r of /** @type {any[]} */ (trRes.results ?? [])) ((tr[r.sheet_id] ??= {})[r.language] ??= {})[r.key] = String(r.value).trim();

	/** @type {Record<string, string[]>} */
	const gallery = {};
	/** @type {Record<string, { content: string[], people_playing: string[] }>} */
	const typed = {};
	for (const r of /** @type {any[]} */ (imgRes.results ?? [])) {
		(gallery[r.sheet_id] ??= []).push(r.r2_key);
		const t = (typed[r.sheet_id] ??= { content: [], people_playing: [] });
		(r.type === 'content' ? t.content : t.people_playing).push(r.r2_key);
	}

	// Awards keyed by every SKU an instance names (main + additional products):
	// newest first, then outlet name, then newest created.
	const { rows: awardRows, statements } = await loadAwardRows(db, only);
	const cmpDesc = (/** @type {any} */ a, /** @type {any} */ b) => String(b ?? '').localeCompare(String(a ?? ''));
	/** @type {Record<string, any[]>} */
	const awards = {};
	for (const i of [...awardRows].sort((a, b) => cmpDesc(a.instance_date, b.instance_date)
		|| String(a.media_name ?? '').localeCompare(String(b.media_name ?? ''), undefined, { sensitivity: 'base' })
		|| cmpDesc(a.created_at, b.created_at))) {
		(awards[i.sku] ??= []).push({
			media: i.media_name,
			media_country: i.media_country ?? null,
			award_category: i.award_category ?? null,
			is_nominated: !!i.is_nominated,
			is_winner: !!i.is_winner,
			instance_date: i.instance_date ?? null,
			disclosure_date: i.disclosure_date ?? null,
			badges: { nominee: imgUrl(i.nominee_badge_key), winner: imgUrl(i.winner_badge_key) },
			statements: statements[i.id] ?? []
		});
	}

	const products = [];
	const seen = new Set();
	// Newest sheet wins if a SKU has more than one.
	for (const s of /** @type {any[]} */ (sheetsRes.results ?? [])) {
		const key = String(s.sku).trim().toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);

		/** @type {Record<string, { name: string | null, description: string | null, long_description: string | null, usps: string[] }>} */
		const texts = {};
		for (const [lang, t] of Object.entries(tr[s.id] ?? {})) {
			const usps = [];
			for (let n = 1; n <= MAX_USP; n++) if (t[`usp_${n}`]) usps.push(t[`usp_${n}`]);
			if (t.product_name || t.product_description || t.long_description || usps.length) {
				// long_description is Markdown (render with $lib/markdown.js rules).
				texts[lang] = { name: t.product_name ?? null, description: t.product_description ?? null, long_description: t.long_description ?? null, usps };
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
				box: imgUrl(s.box_image_key),       // 3D box (sheet main)
				flat: imgUrl(s.box_flat_image_key), // flat front
				content: (typed[s.id]?.content ?? []).map(imgUrl).filter(Boolean),
				people_playing: (typed[s.id]?.people_playing ?? []).map(imgUrl).filter(Boolean),
				// All gallery images untyped, for shops that predate the typed lists.
				gallery: (gallery[s.id] ?? []).map(imgUrl).filter(Boolean)
			},
			youtube_url: s.youtube_url || null,
			videos: videos[s.id] ?? [],
			articles: articles[s.id] ?? [],
			preorder_date: s.preorder_date || null,
			restock_date: s.restock_date || null,
			// Starred in the Portal → show under "Featured Products" (newest star first).
			featured: !!s.featured_at,
			featured_at: s.featured_at || null,
			awards: awards[key] ?? []
		});
	}

	// Box badges exactly as the sheets and catalogues resolve them: winner badge
	// once disclosed, else nominee; newest first, with each outlet's corners,
	// padding (% of box) and size (% of box width).
	// (Same rules as awards.js getBadgesForSkus, from the rows already loaded.)
	const today = new Date().toISOString().slice(0, 10);
	/** @type {Record<string, any[]>} */
	const badgesBySku = {};
	for (const r of [...awardRows].sort((a, b) => cmpDesc(a.instance_date, b.instance_date) || cmpDesc(a.created_at, b.created_at))) {
		const disclosed = !r.disclosure_date || r.disclosure_date <= today;
		const isWinner = !!(r.is_winner && r.winner_badge_key && disclosed);
		const key = isWinner ? r.winner_badge_key : (r.is_nominated ? r.nominee_badge_key : null);
		if (!key) continue;
		(badgesBySku[r.sku] ??= []).push({
			image: imgUrl(key),
			kind: isWinner ? 'winner' : 'nominee',
			media: r.media_name ?? null,
			placement: r.badge_placement || 'bottom-right',
			placement_2: r.badge_placement_2 || null,
			pad: { top: r.badge_pad_top ?? 0, right: r.badge_pad_right ?? 0, bottom: r.badge_pad_bottom ?? 0, left: r.badge_pad_left ?? 0 },
			size_pct: r.badge_size_pct ?? 15
		});
	}
	for (const p of products) /** @type {any} */ (p).badges = badgesBySku[p.sku.toLowerCase()] ?? [];

	// Category groups/categories with labels, and every SKU's categories.
	// (Usage counts aren't part of the feed — skip that full product_category scan.)
	const taxonomy = await listTaxonomy(salesDb, { counts: false });
	const productCats = await salesDb.prepare(
		`SELECT sku, category_id FROM product_category${only ? ` WHERE sku IN (${vList})` : ''} ORDER BY sku`
	).bind(...variants).all();

	const { prefixes, overrides, series, publisherMarkets, productWebshop } = await loadGlobals(salesDb, only ? variants : null);
	const exclusivity = await readExclusivity(salesDb, only ? variants : null);

	return {
		generated_at: new Date().toISOString(),
		image_sizes: [300, 400, 1000, 1600], // append ?size=N to any image URL
		products,
		publishers: {
			// Resolve a SKU like the sales sync does: override first, else the prefix
			// equal to the SKU's leading letters, uppercased ("GO919150" → "GO").
			overrides,
			prefixes
		},
		// Webshop market licensing. markets = valid codes. publisher_markets[name]
		// = licensed markets (absent/empty = none). products[].published_markets:
		// null = default (publish to all the publisher allows); array = explicit;
		// override_license = publish regardless of the publisher licence.
		markets: ['DK', 'SE', 'NO', 'INT', 'PL'],
		publisher_markets: publisherMarkets,
		product_webshop: productWebshop,
		// Exclusivity: while an agreement is running (start_date ≤ today ≤ end_date,
		// null = open), the product must ONLY be shown in that market to customers
		// whose HubSpot company id is in company_ids — hidden for everyone else,
		// incl. anonymous visitors. Expired agreements are omitted. In a ?sku=
		// refresh this holds only the requested SKUs' agreements.
		exclusivity,
		series,
		categories: {
			groups: taxonomy.map((g) => ({
				id: g.id, position: g.position, labels: g.labels,
				categories: g.categories.map((c) => ({ id: c.id, position: c.position, labels: c.labels }))
			})),
			products: productCats.results ?? []
		}
	};
}
