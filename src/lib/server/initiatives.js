/**
 * "Initiatives" for a custom report: everything we've done for the report's
 * products — awards, press and events — shown publisher-facing on the shared
 * report (Stats ⟷ Initiatives pane).
 *
 * Which initiatives: an awards/press entry or event is included when at least
 * ONE of its products matches the report's rules, where publisher rules are
 * matched on the product's MAPPED publisher (per-SKU override → SKU prefix →
 * prefix code; same resolution as deal_line_items.publisher). Only the matching
 * products are shown on each card, so other publishers' titles at the same
 * event/award never leak into a publisher's report.
 *
 * Publisher-facing visibility:
 *   - awards: nominated / winner only; a win shows only once its
 *     disclosure_date has passed (before that it shows as nominated);
 *     "submitted" and "nothing" are hidden
 *   - press:  sent / used / (legacy entries with no status); "not_used" hidden
 *   - events: everything except cancelled; internal notes/contacts never exposed
 *
 * Awards/press/events live in the app DB (`DB`, per environment); the
 * publisher mapping + series live in SALES_DB.
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1 */

const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
const lc = (s) => String(s ?? '').trim().toLowerCase();
const skuPrefix = (sku) => { const m = String(sku ?? '').match(/^[A-Za-z]+/); return m ? m[0].toUpperCase() : null; };
const img = (key) => (key ? `/api/img/${key}` : null);

const AWARD_STATUSES = new Set(['submitted', 'nominated', 'winner', 'nothing']);

/**
 * Build a matcher sku → boolean for the report rules (same semantics as the
 * sales predicate: union of includes, or everything when there are none,
 * minus anything matching an exclude), with publisher rules on the mapped
 * publisher. @param {D1} salesDb
 */
async function ruleMatcher(salesDb, rules, skus) {
	const list = [...new Set(skus.map(lc).filter(Boolean))];
	const pubOf = new Map(), seriesOf = new Map();
	if (list.length) {
		const [pfx, ovr] = await Promise.all([
			salesDb.prepare('SELECT prefix, publisher FROM publisher_prefix').all(),
			salesDb.prepare('SELECT sku, publisher FROM product_publisher_override').all(),
		]);
		const prefixMap = new Map((pfx.results ?? []).map((r) => [String(r.prefix).toUpperCase(), r.publisher]));
		const overrideMap = new Map((ovr.results ?? []).map((r) => [lc(r.sku), r.publisher]));
		for (const s of list) {
			const p = skuPrefix(s);
			pubOf.set(s, overrideMap.get(s) ?? (p ? prefixMap.get(p) ?? p : null));
		}
		if ((rules ?? []).some((r) => r.kind === 'series')) {
			for (const part of chunk(list, 90)) {
				const rows = (await salesDb.prepare(
					`SELECT lower(sku) AS sku, series_id FROM product_series WHERE lower(sku) IN (${part.map(() => '?').join(',')})`
				).bind(...part).all()).results ?? [];
				for (const r of rows) seriesOf.set(r.sku, String(r.series_id));
			}
		}
	}
	// name_contains → the concrete SKU set, resolved once.
	const nameSets = new Map();
	for (const r of rules ?? []) {
		if (r.kind !== 'name_contains' || nameSets.has(r.value)) continue;
		const rows = (await salesDb.prepare(
			`SELECT DISTINCT lower(s.sku) AS sku FROM sales_sheets s JOIN translations tr ON tr.sheet_id = s.id
			 WHERE tr.key = 'product_name' AND lower(COALESCE(tr.value,'')) LIKE ? AND COALESCE(s.sku,'') != ''`
		).bind(`%${lc(r.value)}%`).all()).results ?? [];
		nameSets.set(r.value, new Set(rows.map((x) => x.sku)));
	}
	const hit = (r, sku) => {
		if (r.kind === 'publisher_mapped' || r.kind === 'publisher_sku') return lc(pubOf.get(sku)) === lc(r.value);
		if (r.kind === 'series') return seriesOf.get(sku) === String(r.value);
		if (r.kind === 'name_contains') return nameSets.get(r.value)?.has(sku) ?? false;
		return sku === lc(r.value); // 'sku'
	};
	const inc = (rules ?? []).filter((r) => r.action === 'include');
	const exc = (rules ?? []).filter((r) => r.action === 'exclude');
	return (raw) => {
		const sku = lc(raw);
		if (!sku) return false;
		if (inc.length && !inc.some((r) => hit(r, sku))) return false;
		return !exc.some((r) => hit(r, sku));
	};
}

/** Product name + box image per SKU from Sheets (primary language wins). @param {D1} db */
async function productInfo(db, skus) {
	const m = new Map();
	for (const part of chunk([...new Set(skus.map(lc).filter(Boolean))], 90)) {
		const rows = (await db.prepare(
			`SELECT lower(s.sku) AS sku, s.box_image_key AS img, tr.value AS name
			 FROM sales_sheets s LEFT JOIN translations tr ON tr.sheet_id = s.id AND tr.key = 'product_name' AND COALESCE(tr.value,'') != ''
			 WHERE lower(s.sku) IN (${part.map(() => '?').join(',')})
			 ORDER BY (tr.language = s.primary_language) ASC`
		).bind(...part).all()).results ?? [];
		for (const r of rows) m.set(r.sku, { name: r.name ?? m.get(r.sku)?.name ?? null, image: img(r.img) ?? m.get(r.sku)?.image ?? null });
	}
	return m;
}

/**
 * All initiatives for a report's rule set.
 * @param {D1} db  app DB (awards, press, events, sheets)
 * @param {D1} salesDb  SALES_DB (publisher mapping, series)
 */
export async function loadInitiatives(db, salesDb, rules) {
	const today = new Date().toISOString().slice(0, 10);

	// ── Awards & press (one row per entry, products = main sku + extra products)
	const entries = (await db.prepare(
		`SELECT i.id, i.sku, i.product_name, i.award_category, i.status, i.is_nominated, i.is_winner,
		        i.disclosure_date, i.instance_date, i.proof_url, i.nominee_badge_key, i.winner_badge_key,
		        m.name AS media, m.country AS media_country, m.review_scale
		 FROM press_instance i JOIN award_media m ON m.id = i.media_id`
	).all()).results ?? [];
	const extra = (await db.prepare('SELECT instance_id, sku FROM press_instance_product').all()).results ?? [];
	const stmts = (await db.prepare(
		`SELECT instance_id, statement, score FROM award_statement
		 WHERE COALESCE(statement,'') != '' OR score IS NOT NULL ORDER BY created_at`
	).all()).results ?? [];

	// ── Events (not cancelled)
	const events = (await db.prepare(
		`SELECT e.id, e.title, e.event_date, e.start_time, e.end_time, e.status,
		        e.participants_expected, e.participants_actual,
		        v.name AS venue, v.city, v.country, t.name AS type
		 FROM event e LEFT JOIN venue v ON v.id = e.venue_id LEFT JOIN event_type t ON t.id = e.type_id
		 WHERE e.status != 'cancelled'`
	).all()).results ?? [];
	const eventSkus = (await db.prepare('SELECT event_id, sku FROM event_sku ORDER BY sort').all()).results ?? [];

	const skusOfEntry = new Map(entries.map((e) => [e.id, e.sku ? [e.sku] : []]));
	for (const x of extra) skusOfEntry.get(x.instance_id)?.push(x.sku);
	const skusOfEvent = new Map(events.map((e) => [e.id, []]));
	for (const x of eventSkus) skusOfEvent.get(x.event_id)?.push(x.sku);

	const allSkus = [...[...skusOfEntry.values()].flat(), ...[...skusOfEvent.values()].flat()];
	const matches = await ruleMatcher(salesDb, rules, allSkus);
	const matching = (skus) => [...new Set(skus.filter(matches).map(lc))];

	const awards = [], press = [];
	const usedSkus = new Set();
	const stmtsOf = new Map();
	for (const s of stmts) (stmtsOf.get(s.instance_id) ?? stmtsOf.set(s.instance_id, []).get(s.instance_id)).push(s);

	for (const e of entries) {
		const skus = matching(skusOfEntry.get(e.id) ?? []);
		if (!skus.length) continue;
		const isAward = AWARD_STATUSES.has(e.status) || (!e.status && (e.is_nominated || e.is_winner || e.award_category));
		const quotes = (stmtsOf.get(e.id) ?? []).map((s) => ({ text: s.statement || null, score: s.score ?? null }));
		const base = { id: e.id, date: e.instance_date, media: e.media, country: e.media_country, skus, link: e.proof_url || null };
		if (isAward) {
			const status = e.status || (e.is_winner ? 'winner' : e.is_nominated ? 'nominated' : 'submitted');
			if (status !== 'winner' && status !== 'nominated') continue; // submitted / nothing → not shown
			const disclosed = !e.disclosure_date || e.disclosure_date <= today;
			const shown = status === 'winner' && !disclosed ? 'nominated' : status; // never leak an unannounced win
			const badge = shown === 'winner' ? e.winner_badge_key : shown === 'nominated' ? e.nominee_badge_key : null;
			awards.push({ ...base, category: e.award_category || null, status: shown, badge: img(badge), quotes });
		} else {
			if (e.status === 'not_used') continue;
			press.push({ ...base, status: e.status || 'used', scale: e.review_scale ?? null, quotes });
		}
		skus.forEach((s) => usedSkus.add(s));
	}

	const eventCards = [];
	const imagesOf = new Map();
	const evMatched = events.filter((e) => matching(skusOfEvent.get(e.id) ?? []).length);
	for (const part of chunk(evMatched.map((e) => e.id), 90)) {
		const rows = (await db.prepare(
			`SELECT event_id, r2_key FROM event_asset WHERE kind = 'image' AND category = 'media'
			   AND event_id IN (${part.map(() => '?').join(',')}) ORDER BY created_at`
		).bind(...part).all()).results ?? [];
		for (const r of rows) (imagesOf.get(r.event_id) ?? imagesOf.set(r.event_id, []).get(r.event_id)).push(img(r.r2_key));
	}
	for (const e of evMatched) {
		const skus = matching(skusOfEvent.get(e.id) ?? []);
		skus.forEach((s) => usedSkus.add(s));
		eventCards.push({
			id: e.id, title: e.title || e.type || 'Event', type: e.type || null, date: e.event_date,
			time: e.start_time ? `${e.start_time}${e.end_time ? '–' + e.end_time : ''}` : null,
			upcoming: !!e.event_date && e.event_date >= today && e.status !== 'done',
			venue: e.venue || null, city: e.city || null, country: e.country || null,
			participants: e.participants_actual ?? null, expected: e.participants_expected ?? null,
			skus, images: (imagesOf.get(e.id) ?? []).slice(0, 6),
		});
	}

	const byDateDesc = (a, b) => String(b.date ?? '').localeCompare(String(a.date ?? ''));
	awards.sort(byDateDesc); press.sort(byDateDesc); eventCards.sort(byDateDesc);

	const info = await productInfo(db, [...usedSkus]);
	const products = Object.fromEntries([...usedSkus].map((s) => [s, { sku: s.toUpperCase(), name: info.get(s)?.name ?? s.toUpperCase(), image: info.get(s)?.image ?? null }]));
	// Entries saved before Sheets existed may carry their own product name.
	for (const e of entries) if (e.sku && e.product_name && products[lc(e.sku)] && products[lc(e.sku)].name === e.sku.toUpperCase()) products[lc(e.sku)].name = e.product_name;

	return {
		awards, press, events: eventCards, products,
		summary: {
			awards: awards.length,
			wins: awards.filter((a) => a.status === 'winner').length,
			nominations: awards.filter((a) => a.status === 'nominated').length,
			press: press.length,
			events: eventCards.length,
			participants: eventCards.reduce((n, e) => n + (Number(e.participants) || 0), 0),
			products: usedSkus.size,
		},
	};
}
