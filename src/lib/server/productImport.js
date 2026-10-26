/**
 * One-time product migration from the shop CSV into the Portal.
 *
 * Syncs ONLY: SKU (match/create), name (new sheets only), published markets
 * (DK/SE/NO/INT — PL never touched), Game Type (Spiltype) + Type (Typen)
 * categories, and preorder/restock dates. Everything else in the CSV is ignored.
 *
 * Portal split: sheets + dates live on the app DB (`DB`); published markets,
 * categories, publisher licences and the taxonomy live on `SALES_DB`.
 */

import { createSheet, setTranslation, updateSheet } from '$lib/db.js';
import { listTaxonomy } from '$lib/server/categories.js';
import { MARKETS, getPublisherMarkets, resolvePublisherForSku } from '$lib/server/webshopMarkets.js';

const PRIMARY_LANGUAGE = 'da';           // language new auto-created sheets get
const CSV_DELIM = ';';

// CSV "Publiseret <X>" → Portal market. PL is intentionally absent.
const MARKET_FROM_CSV = { DA: 'DK', SE: 'SE', NO: 'NO', EN: 'INT' };

// Category synonyms (lowercased CSV token → a label that exists in the Portal).
// Direct any-language label matches are tried first; these are the fallbacks.
const CATEGORY_SYNONYMS = {
	// Game Type (Spiltype, Danish)
	'samarbejde': 'samarbejdsspil',
	// Type (Typen, Norwegian)
	'brettspill': 'brætspil',
	'leketøy': 'legetøj',
	'puslespill': 'puslespil',
	'rollespill (rpg)': 'rollespil (rpg)'
};

// ── CSV parsing (semicolon, quoted fields, embedded newlines, "" escapes) ───
export function parseCsv(text, delim = CSV_DELIM) {
	const rows = [];
	let row = [], field = '', inQuotes = false;
	const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (inQuotes) {
			if (c === '"') {
				if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
			} else field += c;
		} else if (c === '"') inQuotes = true;
		else if (c === delim) { row.push(field); field = ''; }
		else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
		else field += c;
	}
	if (field !== '' || row.length) { row.push(field); rows.push(row); }
	if (!rows.length) return [];
	const header = rows[0].map((h) => h.trim());
	return rows.slice(1)
		.filter((r) => r.some((v) => (v ?? '').trim() !== ''))
		.map((r) => { const o = {}; header.forEach((h, i) => (o[h] = r[i] ?? '')); return o; });
}

const isBlank = (v) => { const t = (v ?? '').trim(); return t === '' || t.toLowerCase() === 'null'; };
const yes = (v) => (v ?? '').trim().toLowerCase() === 'ja';

/** Comma-separated multi-value cell → trimmed non-blank tokens. */
function tokens(v) {
	if (isBlank(v)) return [];
	return v.split(',').map((t) => t.trim()).filter((t) => t && t.toLowerCase() !== 'null');
}

/**
 * Parse the funky `da_DK: 2026-11-14 00:00:00, …` date cell → `yyyy-mm-dd`.
 * All entries carry the same timestamp; we treat it as UTC and take the date in
 * Europe/Copenhagen (so a `…15 22:00:00` UTC value becomes the 16th locally).
 */
const DATE_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit' });
export function parseDateCell(v) {
	if (isBlank(v)) return null;
	const m = v.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
	if (!m) { const d = v.match(/(\d{4})-(\d{2})-(\d{2})/); return d ? d[0] : null; }
	const utc = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
	if (isNaN(utc.getTime())) return null;
	return DATE_FMT.format(utc); // en-CA → yyyy-mm-dd
}

// ── Taxonomy resolver (CSV token → category_id, scoped to a group) ──────────
function buildResolver(taxonomy) {
	const groupByName = {};
	for (const g of taxonomy) {
		const name = (g.labels?.en || g.labels?.da || '').trim().toLowerCase();
		groupByName[name] = g;
	}
	/** group label ('game type'|'type') → { byLabel: Map(lowerLabel→id), ids:Set } */
	const make = (groupName) => {
		const g = groupByName[groupName];
		const byLabel = new Map(); const ids = new Set();
		for (const c of g?.categories ?? []) {
			ids.add(c.id);
			for (const lab of Object.values(c.labels ?? {})) {
				const k = (lab ?? '').trim().toLowerCase();
				if (k) byLabel.set(k, c.id);
			}
		}
		return { byLabel, ids };
	};
	const gameType = make('game type');
	const type = make('type');
	const resolve = (grp, token) => {
		const k = token.trim().toLowerCase();
		let id = grp.byLabel.get(k);
		if (!id && CATEGORY_SYNONYMS[k]) id = grp.byLabel.get(CATEGORY_SYNONYMS[k]);
		return id ?? null;
	};
	return {
		managedIds: new Set([...gameType.ids, ...type.ids]),
		resolveGameType: (t) => resolve(gameType, t),
		resolveType: (t) => resolve(type, t)
	};
}

// ── Load current Portal state (bulk) ────────────────────────────────────────
async function loadState(db, salesDb) {
	const [sheets, webshop, cats, prefixes, overrides, taxonomy] = await Promise.all([
		db.prepare('SELECT id, sku, primary_language FROM sales_sheets').all(),
		salesDb.prepare('SELECT sku, published_markets, override_license FROM product_webshop').all(),
		salesDb.prepare('SELECT sku, category_id FROM product_category').all(),
		salesDb.prepare('SELECT prefix, publisher FROM publisher_prefix').all(),
		salesDb.prepare('SELECT sku, publisher FROM product_publisher_override').all(),
		listTaxonomy(salesDb)
	]);
	const sheetBySku = new Map();
	for (const r of sheets.results ?? []) sheetBySku.set(String(r.sku).toLowerCase(), r);
	const webshopBySku = new Map();
	for (const r of webshop.results ?? []) {
		let pm = null;
		if (r.published_markets != null) { try { pm = JSON.parse(r.published_markets); } catch { pm = []; } }
		webshopBySku.set(String(r.sku).toLowerCase(), { publishedMarkets: pm, overrideLicense: !!r.override_license });
	}
	const catsBySku = new Map();
	for (const r of cats.results ?? []) {
		const k = String(r.sku).toLowerCase();
		(catsBySku.get(k) ?? catsBySku.set(k, new Set()).get(k)).add(r.category_id);
	}
	const prefixMap = {}; for (const r of prefixes.results ?? []) prefixMap[r.prefix] = r.publisher;
	const overrideMap = {}; for (const r of overrides.results ?? []) overrideMap[String(r.sku).toLowerCase()] = r.publisher;
	const resolver = buildResolver(taxonomy);
	// publisher licences, cached per publisher as we go
	return { sheetBySku, webshopBySku, catsBySku, prefixMap, overrideMap, resolver };
}

function publisherForSku(state, sku) {
	const ov = state.overrideMap[sku.toLowerCase()];
	if (ov) return ov;
	const pfx = (sku.match(/^[A-Za-z]+/)?.[0] ?? '').toUpperCase();
	return state.prefixMap[pfx] ?? pfx ?? null;
}

/**
 * Build the full migration plan from parsed CSV rows. Pure read — no writes.
 * Returns { summary, reports, items } where items are self-contained apply ops.
 */
export async function buildPlan(db, salesDb, rows) {
	const state = await loadState(db, salesDb);
	const licenceCache = new Map(); // publisher → Set(markets)
	const licenceFor = async (pub) => {
		if (!pub) return new Set();
		if (!licenceCache.has(pub)) licenceCache.set(pub, new Set(await getPublisherMarkets(salesDb, pub)));
		return licenceCache.get(pub);
	};

	const items = [];
	const unmapped = { Spiltype: {}, Typen: {} };
	const notMirrored = [];
	const dateSamples = [];
	let create = 0, publishedChanges = 0, dateChanges = 0, categoryChanges = 0;

	for (const r of rows) {
		const sku = (r['Varenummer'] ?? '').trim();
		if (!sku) continue;
		const key = sku.toLowerCase();
		const existingSheet = state.sheetBySku.get(key);
		const willCreate = !existingSheet;
		if (willCreate) create++;

		// ── Published markets (clamped to licence; PL + override preserved) ──
		const pub = publisherForSku(state, sku);
		const licence = await licenceFor(pub);
		const existingWs = state.webshopBySku.get(key) ?? { publishedMarkets: null, overrideLicense: false };
		const override = existingWs.overrideLicense;
		const existingPublished = existingWs.publishedMarkets; // array | null
		const wanted = {}; const missed = [];
		for (const [csvMkt, mkt] of Object.entries(MARKET_FROM_CSV)) {
			const want = yes(r[`Publiseret ${csvMkt}`]);
			if (!want) continue;
			if (override || licence.has(mkt)) wanted[mkt] = true;
			else missed.push(mkt); // CSV wants it but publisher isn't licensed → not mirrored
		}
		const publishedSet = MARKETS.filter((m) => m !== 'PL' && wanted[m]);
		// Preserve PL exactly as it was (only when explicitly set before).
		if (Array.isArray(existingPublished) && existingPublished.includes('PL')) publishedSet.push('PL');
		if (missed.length) notMirrored.push({ sku, markets: missed });
		const prevPublished = Array.isArray(existingPublished) ? [...existingPublished].sort() : null;
		const publishedChanged = JSON.stringify(prevPublished) !== JSON.stringify([...publishedSet].sort());
		if (publishedChanged) publishedChanges++;

		// ── Categories (sweep the two managed groups, only if CSV has values) ──
		const gtTokens = tokens(r['Spiltype']);
		const tyTokens = tokens(r['Typen']);
		let catIds = null; // null = leave categories untouched
		if (gtTokens.length || tyTokens.length) {
			const ids = new Set();
			for (const t of gtTokens) { const id = state.resolver.resolveGameType(t); if (id) ids.add(id); else unmapped.Spiltype[t] = (unmapped.Spiltype[t] ?? 0) + 1; }
			for (const t of tyTokens) { const id = state.resolver.resolveType(t); if (id) ids.add(id); else unmapped.Typen[t] = (unmapped.Typen[t] ?? 0) + 1; }
			catIds = [...ids];
			const existingManaged = new Set([...(state.catsBySku.get(key) ?? new Set())].filter((id) => state.resolver.managedIds.has(id)));
			const changed = existingManaged.size !== catIds.length || catIds.some((id) => !existingManaged.has(id));
			if (changed) categoryChanges++;
		}

		// ── Dates (set when present; never clear when the CSV is empty) ──
		const preorder = parseDateCell(r['Udgivelsesdato']);
		const restock = parseDateCell(r['Restock dato']);
		if (preorder || restock) { if (dateChanges < 1e9) dateChanges++; if (dateSamples.length < 15) dateSamples.push({ sku, preorder, restock }); }

		items.push({
			sku,
			name: (r['Produktnavn'] ?? '').trim(),
			create: willCreate,
			primaryLanguage: existingSheet?.primary_language ?? PRIMARY_LANGUAGE,
			published: publishedSet,
			preorder, restock,
			catIds
		});
	}

	// Cap report payloads
	const notMirroredSample = notMirrored.slice(0, 200);
	return {
		summary: {
			totalRows: rows.length,
			create,
			update: rows.length - create,
			publishedChanges,
			dateChanges,
			categoryChanges,
			notMirroredCount: notMirrored.length
		},
		reports: {
			unmappedCategories: unmapped,
			notMirrored: notMirroredSample,
			notMirroredTruncated: Math.max(0, notMirrored.length - notMirroredSample.length),
			dateSamples
		},
		items
	};
}

/** Category ids in the two managed groups, for scoped sweeps. */
async function managedCategoryIds(salesDb) {
	const resolver = buildResolver(await listTaxonomy(salesDb));
	return resolver.managedIds;
}

/**
 * Apply a chunk of plan items. Idempotent & re-runnable: creates missing
 * sheets, sets name only on creation, upserts dates/markets/categories.
 */
export async function applyItems(db, salesDb, items, by) {
	const managed = await managedCategoryIds(salesDb);
	let created = 0, updated = 0;
	const errors = [];
	for (const it of items) {
		try {
			// find sheet by sku (re-checked here so apply is idempotent/resumable)
			const row = await db.prepare('SELECT id FROM sales_sheets WHERE lower(sku) = lower(?)').bind(it.sku).first();
			let sheetId = row?.id;
			if (!sheetId) {
				sheetId = crypto.randomUUID();
				await createSheet(db, sheetId, it.sku, it.primaryLanguage || PRIMARY_LANGUAGE, by);
				if (it.name) await setTranslation(db, sheetId, it.primaryLanguage || PRIMARY_LANGUAGE, 'product_name', it.name);
				created++;
			} else updated++;

			// Dates (set when provided; don't clear)
			const patch = {};
			if (it.preorder) patch.preorder_date = it.preorder;
			if (it.restock) patch.restock_date = it.restock;
			if (Object.keys(patch).length) await updateSheet(db, sheetId, patch);

			// Published markets (SALES_DB) — full set incl. preserved PL; override untouched
			const prev = await salesDb.prepare('SELECT override_license FROM product_webshop WHERE lower(sku)=lower(?)').bind(it.sku).first();
			const overrideLicense = prev ? !!prev.override_license : false;
			await salesDb.prepare(
				`INSERT INTO product_webshop (sku, published_markets, override_license, updated_by, updated_at)
				 VALUES (?, ?, ?, ?, ?)
				 ON CONFLICT(sku) DO UPDATE SET published_markets=excluded.published_markets, updated_by=excluded.updated_by, updated_at=excluded.updated_at`
			).bind(it.sku, JSON.stringify(it.published), overrideLicense ? 1 : 0, by ?? null, new Date().toISOString()).run();

			// Categories — sweep the managed groups only, when CSV had values
			if (Array.isArray(it.catIds)) {
				const managedList = [...managed];
				const ph = managedList.map(() => '?').join(',');
				const stmts = [
					salesDb.prepare(`DELETE FROM product_category WHERE lower(sku)=lower(?) AND category_id IN (${ph})`).bind(it.sku, ...managedList),
					...it.catIds.map((id) => salesDb.prepare('INSERT OR IGNORE INTO product_category (sku, category_id, created_by) VALUES (?, ?, ?)').bind(it.sku, id, by ?? null))
				];
				await salesDb.batch(stmts);
			}
		} catch (e) {
			errors.push({ sku: it.sku, error: e instanceof Error ? e.message : String(e) });
		}
	}
	return { created, updated, errors };
}
