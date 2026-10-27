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

// Only these columns are kept while parsing — the CSV also has 4 big description
// fields + prices + images we never use; skipping them keeps the 17 MB file well
// inside the Worker's memory limit. Quotes open only at a field start (product
// names carry lone inch-mark quotes like `3.5"` in unquoted fields).
// Portal text columns in the enriched CSV: short_<lang> / bullets_<lang> / long_<lang>
// for da/sv/no/en. bullets = one per line.
const TEXT_LANGS = ['da', 'sv', 'no', 'en'];
const TEXT_COLS = TEXT_LANGS.flatMap((l) => [`short_${l}`, `bullets_${l}`, `long_${l}`]);
// CSV "Publiseret <flag>" → portal language (DK=da, SE=sv, NO=no, INT/EN=en).
const LANG_FROM_PUB = { DA: 'da', SE: 'sv', NO: 'no', EN: 'en' };

export const NEEDED_COLS = [
	'Varenummer', 'Produktnavn',
	'Publiseret DA', 'Publiseret SE', 'Publiseret NO', 'Publiseret EN',
	'Spiltype', 'Typen', 'Udgivelsesdato', 'Restock dato',
	...TEXT_COLS
];

const parseBullets = (v) => (isBlank(v) ? [] : v.split(/\r?\n/).map((b) => b.trim()).filter(Boolean).slice(0, 6));

/** Streaming CSV parse that stores ONLY `keep` columns. Handles quoted/multiline
 *  fields and "" escapes; line endings handled inline (no extra full-string copies). */
export function parseCsv(text, keep = NEEDED_COLS, delim = CSV_DELIM) {
	const n = text.length;
	let i = 0;
	// 1) header row (keep all, to find column positions)
	const header = [];
	{
		let field = '', q = false, started = false;
		for (; i < n; i++) {
			const c = text[i];
			if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
			else if (c === '"' && !started) { q = true; started = true; }
			else if (c === delim) { header.push(field); field = ''; started = false; }
			else if (c === '\n' || c === '\r') { if (!(c === '\r' && text[i + 1] === '\n')) { header.push(field); i++; break; } }
			else { field += c; started = true; }
		}
	}
	const H = header.map((h) => h.trim());
	const keepSet = new Set(keep);
	const wanted = H.map((h) => keepSet.has(h));

	// 2) data rows — accumulate only wanted columns
	const out = [];
	let obj = {}, col = 0, field = '', q = false, started = false;
	const endField = () => { if (wanted[col]) obj[H[col]] = field; field = ''; col++; started = false; };
	const endRow = () => { endField(); if ((obj['Varenummer'] ?? '').trim()) out.push(obj); obj = {}; col = 0; };
	for (; i < n; i++) {
		const c = text[i];
		if (q) {
			if (c === '"') { if (text[i + 1] === '"') { if (wanted[col]) field += '"'; i++; } else q = false; }
			else if (wanted[col]) field += c;
		} else if (c === '"' && !started) { q = true; started = true; }
		else if (c === delim) endField();
		else if (c === '\n') endRow();
		else if (c === '\r') { if (text[i + 1] !== '\n') endRow(); }
		else { if (wanted[col]) field += c; started = true; }
	}
	if (col > 0 || field !== '') endRow();
	return out;
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
	const [sheets, webshop, cats, prefixes, overrides, taxonomy, trans] = await Promise.all([
		db.prepare('SELECT id, sku, primary_language FROM sales_sheets').all(),
		salesDb.prepare('SELECT sku, published_markets, override_license FROM product_webshop').all(),
		salesDb.prepare('SELECT sku, category_id FROM product_category').all(),
		salesDb.prepare('SELECT prefix, publisher FROM publisher_prefix').all(),
		salesDb.prepare('SELECT sku, publisher FROM product_publisher_override').all(),
		listTaxonomy(salesDb),
		db.prepare(`SELECT lower(s.sku) AS sku, t.language AS lang, t.key AS key
			FROM translations t JOIN sales_sheets s ON s.id = t.sheet_id
			WHERE trim(t.value) != '' AND t.key IN ('product_description','long_description','usp_1','usp_2','usp_3','usp_4','usp_5','usp_6')`).all()
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
	// Which text fields already exist per (sku, lang): { sku: { lang: {short,long,bullets} } }
	const existingText = {};
	for (const r of trans.results ?? []) {
		const field = r.key === 'product_description' ? 'short' : r.key === 'long_description' ? 'long' : 'bullets';
		((existingText[r.sku] ??= {})[r.lang] ??= {})[field] = true;
	}
	return { sheetBySku, webshopBySku, catsBySku, prefixMap, overrideMap, resolver, existingText };
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
	let create = 0, publishedChanges = 0, dateChanges = 0, categoryChanges = 0, textChanges = 0;

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

		// ── Texts (per published language; FILL ONLY WHERE PORTAL IS EMPTY) ──
		const texts = {};
		for (const [flag, L] of Object.entries(LANG_FROM_PUB)) {
			if (!yes(r[`Publiseret ${flag}`])) continue;
			const ex = state.existingText[key]?.[L] ?? {};
			const t = {};
			const short = (r[`short_${L}`] ?? '').trim();
			const long = (r[`long_${L}`] ?? '').trim();
			const bullets = parseBullets(r[`bullets_${L}`]);
			if (short && !ex.short) t.short = short;
			if (long && !ex.long) t.long = long;
			if (bullets.length && !ex.bullets) t.bullets = bullets;
			if (Object.keys(t).length) texts[L] = t;
		}
		const hasText = Object.keys(texts).length > 0;
		if (hasText) textChanges++;

		items.push({
			sku,
			name: (r['Produktnavn'] ?? '').trim(),
			create: willCreate,
			primaryLanguage: existingSheet?.primary_language ?? PRIMARY_LANGUAGE,
			published: publishedSet,
			preorder, restock,
			catIds,
			texts: hasText ? texts : null
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
			textChanges,
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
	const affected = [];
	for (const it of items) {
		try {
			// find sheet by sku (re-checked here so apply is idempotent/resumable)
			const row = await db.prepare('SELECT id, usp_count, primary_language FROM sales_sheets WHERE lower(sku) = lower(?)').bind(it.sku).first();
			let sheetId = row?.id;
			let wasCreated = false;
			if (!sheetId) {
				sheetId = crypto.randomUUID();
				await createSheet(db, sheetId, it.sku, it.primaryLanguage || PRIMARY_LANGUAGE, by);
				if (it.name) await setTranslation(db, sheetId, it.primaryLanguage || PRIMARY_LANGUAGE, 'product_name', it.name);
				created++; wasCreated = true;
			} else updated++;
			const primaryLanguage = row?.primary_language || it.primaryLanguage || PRIMARY_LANGUAGE;

			// Dates (set when provided; don't clear)
			const patch = {};
			if (it.preorder) patch.preorder_date = it.preorder;
			if (it.restock) patch.restock_date = it.restock;
			if (Object.keys(patch).length) await updateSheet(db, sheetId, patch);

			// Texts (per language; each field only where it was empty — decided at plan time)
			if (it.texts) {
				let maxBullets = 0;
				for (const [L, t] of Object.entries(it.texts)) {
					if (t.short) await setTranslation(db, sheetId, L, 'product_description', t.short);
					if (t.long) await setTranslation(db, sheetId, L, 'long_description', t.long);
					if (Array.isArray(t.bullets)) {
						for (let i = 0; i < t.bullets.length; i++) await setTranslation(db, sheetId, L, `usp_${i + 1}`, t.bullets[i]);
						maxBullets = Math.max(maxBullets, t.bullets.length);
					}
				}
				const curCount = wasCreated ? 0 : (row?.usp_count ?? 0);
				if (maxBullets > curCount) await updateSheet(db, sheetId, { usp_count: maxBullets });
			}

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
			affected.push({ sku: it.sku, id: sheetId, lang: primaryLanguage, created: wasCreated });
		} catch (e) {
			errors.push({ sku: it.sku, error: e instanceof Error ? e.message : String(e) });
		}
	}
	return { created, updated, errors, affected };
}
