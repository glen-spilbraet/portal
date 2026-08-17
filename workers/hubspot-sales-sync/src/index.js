/**
 * hubspot-sales-sync
 *
 * Daily mirror of HubSpot "Closed Won" + auto_imported deals into the
 * portal-db `sales_deals` table, for the portal's Sales Stats dashboard.
 *
 * READ-ONLY against HubSpot. The only writes are to our own D1 table.
 *
 * Triggers:
 *   - daily cron   -> refresh current+previous year, then incremental sweep of
 *                     anything edited since the last run (catches corrections to
 *                     older deals: changed amount / close date).
 *   - monthly cron -> full reconcile of all years (also catches deletions /
 *                     un-wins of old deals).
 *   - HTTP GET/POST with `Authorization: Bearer <SYNC_SECRET>` -> manual run
 *       ?year=2024        single year (handy for testing / backfill)
 *       ?since=2025       full refresh from that year onward
 *       ?incremental=1    sweep deals modified since last run (?modifiedSince=ISO to override)
 *       ?reconcile=1      full re-sync of all years
 */

const HS = 'https://api.hubapi.com';
const MONTHLY_CRON = '0 3 1 * *';

/** Shift a YYYY-MM-DD string by n days (UTC). */
function addDaysYmd(s, n) {
	const d = new Date(s + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

// Deal properties we pull from HubSpot.
const DEAL_PROPS = [
	'dealname',
	'closedate',
	'amount_in_home_currency', // amount converted to the account home currency (DKK)
	'amount',                  // raw amount in the deal's own currency
	'deal_currency_code',
	'pipeline',
	'dealstage',
	'hs_lastmodifieddate',
	'rackbeat_id', // links the deal to its Rackbeat order/invoice/credit note
	'forecast_start_date', // forecast deals only
	'forecast_end_date',
];

// Forecast pipeline stages (same Sales Pipeline as closed deals).
const FORECAST_STAGES = ['961100990', '5037397224']; // [0] Forecasting, Expired Forecast

// Line-item properties fetched for the incremental sync (internal names).
const LINE_ITEM_PROPS = [
	'hs_sku', 'name', 'price', 'discount', 'amount', // amount = "Net price"
	'line_item_revenue_in_company_currency', 'hs_line_item_currency_code',
	'quantity', 'quantity_log_create', 'quantity_log_start', 'hs_lastmodifieddate',
];

/** Leading alpha of a SKU, uppercased (publisher grouping key); null if none. */
function skuPrefix(sku) {
	if (!sku) return null;
	const m = String(sku).match(/^[A-Za-z]+/);
	return m ? m[0].toUpperCase() : null;
}

// Company properties (the "customer level" data).
const COMPANY_PROPS = ['name', 'country', 'customer_group', 'customer_color', 'hubspot_owner_id', 'notes_last_contacted'];

/** HubSpot date/datetime → YYYY-MM-DD (handles ISO strings and epoch-ms). */
function hsYmd(v) {
	if (!v) return null;
	const s = String(v);
	if (/^\d{12,}$/.test(s)) return new Date(Number(s)).toISOString().slice(0, 10); // epoch ms
	return s.slice(0, 10); // ISO 8601
}

export default {
	async scheduled(event, env, ctx) {
		ctx.waitUntil(handleScheduled(event, env));
	},

	async fetch(request, env, ctx) {
		const auth = request.headers.get('Authorization') || '';
		const token = auth.replace(/^Bearer\s+/i, '');
		if (!env.SYNC_SECRET || token !== env.SYNC_SECRET) {
			return json({ error: 'Unauthorized' }, 401);
		}
		const url = new URL(request.url);
		try {
			if (url.searchParams.get('forecast') === '1') {
				return json({ ok: true, ...(await syncForecastDeals(env)) });
			}
			if (url.searchParams.get('lineimport') === '1') {
				const body = await request.json().catch(() => ({}));
				const rows = Array.isArray(body.rows) ? body.rows : [];
				if (!rows.length) return json({ ok: false, error: 'rows[] required' }, 400);
				return json({ ok: true, inserted: await importLineItems(env, rows) });
			}
			if (url.searchParams.get('lineitems') === '1') {
				const from = url.searchParams.get('from');
				const to = url.searchParams.get('to');
				if (from && to) {
					// Window backfill: refresh line items for closed deals closing in [from,to).
					// Use small windows (≤ ~a quarter) to stay under the subrequest cap.
					const maps = await resolvePublisherMaps(env);
					const deals = (await env.DB.prepare('SELECT deal_id, company_id, close_date, amount_raw, amount_dkk, currency FROM sales_deals WHERE close_date >= ? AND close_date < ?').bind(from, to).all()).results || [];
					const res = await refreshLineItemsForDeals(env, deals, 'closed', maps);
					return json({ ok: true, window: `${from} → ${to}`, ...res });
				}
				const since = url.searchParams.get('since') || (await getMeta(env.DB))?.last_run || null;
				return json({ ok: true, ...(await syncLineItems(env, since)) });
			}
			if (url.searchParams.get('props')) {
				// Diagnostic: list properties whose name/label matches a term.
				// &obj=line_items (or deals, default) selects the object type.
				const term = url.searchParams.get('props').toLowerCase();
				const obj = url.searchParams.get('obj') || 'deals';
				const data = await hsGet(env, `${HS}/crm/v3/properties/${obj}`);
				const hits = (data.results || [])
					.filter((p) => p.name.toLowerCase().includes(term) || (p.label || '').toLowerCase().includes(term))
					.map((p) => ({ name: p.name, label: p.label, type: p.type }));
				return json({ term, matches: hits });
			}
			if (url.searchParams.get('counts') === '1') {
				// Diagnostic: how many Closed-Won deals (2024+) exist with vs without
				// auto_imported — i.e. how much revenue our sync currently excludes.
				const since = String(Date.UTC(2024, 0, 1));
				const count = async (filters) => {
					const data = await hsPost(env, `${HS}/crm/v3/objects/deals/search`, { filterGroups: [{ filters }], properties: ['dealname'], limit: 1 });
					return data.total ?? 0;
				};
				const base = [
					{ propertyName: 'hs_is_closed_won', operator: 'EQ', value: 'true' },
					{ propertyName: 'closedate', operator: 'GTE', value: since },
				];
				const won = await count(base);
				const wonAuto = await count([...base, { propertyName: 'auto_imported', operator: 'EQ', value: 'true' }]);
				return json({ won_2024plus: won, won_auto_imported_2024plus: wonAuto, won_not_auto_imported: won - wonAuto });
			}
			if (url.searchParams.get('fix') === '1') {
				const body = await request.json().catch(() => ({}));
				const dealIds = Array.isArray(body.dealIds) ? body.dealIds.map(String) : [];
				const field = body.field;
				if (!dealIds.length || !['date', 'amount', 'currency', 'all'].includes(field)) {
					return json({ ok: false, error: 'dealIds[] and field (date|amount|currency|all) required' }, 400);
				}
				return json({ ok: true, ...(await runFix(env, dealIds, field)) });
			}
			if (url.searchParams.get('verify') === '1') {
				const from = url.searchParams.get('from'); // deal close_date >= (YYYY-MM-DD)
				const to = url.searchParams.get('to'); //   deal close_date <  (YYYY-MM-DD, exclusive)
				if (!from || !to) return json({ ok: false, error: 'from & to (YYYY-MM-DD) required' }, 400);
				// Invoice window is deliberately DECOUPLED from the deal window. An
				// invoice is only ever dated at/after the deal closes and can lag by
				// months, so we index invoices from a month before the period up to
				// today — otherwise a late invoice is missed and the deal is wrongly
				// flagged "not_found" (which also hides real amount/date mismatches).
				const today = new Date().toISOString().slice(0, 10);
				const invTo = to > today ? to : today;
				const range = { dealFrom: from, dealTo: to, invFrom: addDaysYmd(from, -31), invTo, label: `${from} → ${to}` };
				// &force=1 re-resolves every deal, ignoring the invoice cache (use after
				// a partial-shipment invoice may have been added to an already-resolved order).
				const force = url.searchParams.get('force') === '1';
				// &bulk=1 (curl/cron only — no edge timeout) warms the cache with one
				// window fetch for a large first backfill instead of per-deal lookups.
				const bulk = url.searchParams.get('bulk') === '1';
				return json({ ok: true, ...(await runVerification(env, range, { force, bulk })) });
			}
			let summary;
			if (url.searchParams.get('reconcile') === '1') {
				summary = await runSync(env, {});
			} else if (url.searchParams.get('incremental') === '1') {
				const since = url.searchParams.get('modifiedSince') || (await getMeta(env.DB))?.last_run || null;
				summary = await incrementalSync(env, since);
			} else {
				const yearParam = url.searchParams.get('year');
				const sinceParam = url.searchParams.get('since');
				const opts = yearParam
					? { onlyYear: parseInt(yearParam, 10) }
					: sinceParam
					? { sinceYear: parseInt(sinceParam, 10) }
					: {};
				summary = await runSync(env, opts);
			}
			return json({ ok: true, ...summary });
		} catch (e) {
			return json({ ok: false, error: e?.message ?? String(e) }, 500);
		}
	},
};

async function handleScheduled(event, env) {
	const currentYear = new Date().getUTCFullYear();
	const prev = (await getMeta(env.DB))?.last_run || null;
	if (event?.cron === MONTHLY_CRON) {
		await runSync(env, {}); // monthly full reconcile (catches deletions / un-wins)
		await syncForecastDeals(env);
		await syncLineItems(env, prev);
		return;
	}
	// Daily: refresh the active window, then sweep anything edited since last run.
	await runSync(env, { sinceYear: currentYear - 1 });
	const inc = await incrementalSync(env, prev);
	await syncForecastDeals(env); // small set; refresh the forecast mirror daily
	await syncLineItems(env, prev, inc?.modifiedIds); // line items for changed deals + all forecast
}

async function runSync(env, { onlyYear, sinceYear }) {
	const started = new Date().toISOString();
	await setMeta(env.DB, { status: 'running', message: `started ${started}`, last_run: started });

	try {
		const startYear = onlyYear ?? sinceYear ?? parseInt(env.START_YEAR || '2024', 10);
		const endYear = onlyYear ?? new Date().getUTCFullYear();

		// Gather deals year-by-year to stay under HubSpot Search's 10k-per-query cap.
		const deals = [];
		for (let year = startYear; year <= endYear; year++) {
			const yearDeals = await fetchDealsForYear(env, year);
			deals.push(...yearDeals);
		}

		const { rows, companyCount } = await enrichDeals(env, deals);
		await writeRows(env.DB, rows, { onlyYear, sinceYear });

		const finished = new Date().toISOString();
		await setMeta(env.DB, {
			status: 'ok',
			last_run: finished,
			deal_count: rows.length,
			message: onlyYear ? `synced year ${onlyYear}: ${rows.length} deals` : `synced ${rows.length} deals`,
		});
		return { deals: rows.length, companies: companyCount, years: `${startYear}-${endYear}` };
	} catch (e) {
		await setMeta(env.DB, { status: 'error', message: e?.message ?? String(e) });
		throw e;
	}
}

/**
 * Incremental sweep: upsert every Closed-Won + auto_imported deal modified since
 * `sinceIso` (previous run), regardless of year — so corrections to older deals
 * (amount / close date) land in the mirror. Upsert-only, never deletes.
 */
async function incrementalSync(env, sinceIso) {
	// Watermark = previous run minus a 2h overlap buffer (fallback: 2 days back).
	const base = sinceIso ? Date.parse(sinceIso) : Date.now() - 2 * 86400000;
	const sinceMs = (Number.isFinite(base) ? base : Date.now() - 2 * 86400000) - 2 * 3600 * 1000;

	try {
		const deals = await fetchModifiedDeals(env, sinceMs);
		if (!deals.length) {
			const finished = new Date().toISOString();
			await setMeta(env.DB, { status: 'ok', last_run: finished, message: `incremental: no changes since ${new Date(sinceMs).toISOString()}` });
			return { incremental: true, changed: 0, since: new Date(sinceMs).toISOString(), modifiedIds: [] };
		}
		const { rows } = await enrichDeals(env, deals);
		await insertRows(env.DB, rows);
		const finished = new Date().toISOString();
		await setMeta(env.DB, { status: 'ok', last_run: finished, message: `incremental: upserted ${rows.length} changed deals` });
		return { incremental: true, changed: rows.length, since: new Date(sinceMs).toISOString(), modifiedIds: deals.map((d) => d.id) };
	} catch (e) {
		await setMeta(env.DB, { status: 'error', message: `incremental failed: ${e?.message ?? String(e)}` });
		throw e;
	}
}

/**
 * Resolve owners + primary company for a set of deals and build D1 rows.
 * @returns {{ rows: object[], companyCount: number }}
 */
async function enrichDeals(env, deals) {
	if (!deals.length) return { rows: [], companyCount: 0 };
	const owners = await fetchOwners(env);
	const dealCompany = await fetchDealCompanyAssociations(env, deals.map((d) => d.id));
	const companyIds = [...new Set(Object.values(dealCompany).filter(Boolean))];
	const companies = await fetchCompanies(env, companyIds);
	const rows = deals.map((d) => {
		const p = d.properties || {};
		const companyId = dealCompany[d.id] || null;
		const c = (companyId && companies[companyId]) || {};
		const owner = c.hubspot_owner_id ? owners[c.hubspot_owner_id] : null;
		const country = c.country || '';
		return {
			deal_id: d.id,
			deal_name: p.dealname || null,
			close_date: p.closedate ? String(p.closedate).slice(0, 10) : null,
			amount_dkk: num(p.amount_in_home_currency),
			amount_raw: num(p.amount),
			currency: p.deal_currency_code || null,
			pipeline: p.pipeline || null,
			dealstage: p.dealstage || null,
			company_id: companyId,
			company_name: c.name || null,
			owner_email: owner?.email || null,
			owner_name: owner?.name || null,
			country: country || null,
			market: marketFromCountry(country),
			customer_group: c.customer_group || null,
			customer_level: c.customer_color || null,
			last_contacted: hsYmd(c.notes_last_contacted),
			rackbeat_id: p.rackbeat_id || null,
			updated_at: p.hs_lastmodifieddate ? String(p.hs_lastmodifieddate) : null,
			forecast_start_date: hsYmd(p.forecast_start_date),
			forecast_end_date: hsYmd(p.forecast_end_date),
		};
	});
	return { rows, companyCount: companyIds.length };
}

// ---- Rackbeat verification (amount & close date vs Rackbeat invoices) --------

const RB = 'https://app.rackbeat.com/api';
const AMOUNT_TOLERANCE = 0.5; // kr, absorbs rounding
// Above this many unresolved deals, one bulk window fetch beats N targeted calls.
const BULK_THRESHOLD = 80;

/** Shared Rackbeat GET with timeout + retry (honours 429 backoff). */
async function rbGet(env, path, tries = 4) {
	const headers = { Authorization: `Bearer ${env.RACKBEAT_API_KEY}`, Accept: 'application/json' };
	for (let a = 0; a < tries; a++) {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), 20000);
		try {
			const res = await fetch(`${RB}${path}`, { headers, signal: ctrl.signal });
			clearTimeout(timer);
			if (res.status === 429) { await sleep(1000 * (a + 1)); continue; }
			if (!res.ok) return null;
			return await res.json();
		} catch (_e) {
			clearTimeout(timer);
			await sleep(500 * (a + 1));
		}
	}
	return null;
}

/** Compact invoice record used for matching + caching. */
function invRecord(inv) {
	return {
		number: inv.number,
		invoice_date: inv.invoice_date,
		total_subtotal: inv.total_subtotal,
		currency: inv.currency,
		currency_rate: inv.currency_rate,
		is_creditnote: inv.is_creditnote,
	};
}

/**
 * Targeted invoice lookup — NO date window, so a late invoice is never missed.
 * Order refs → Rackbeat's order_number filter; IN-/CN- refs → search by number.
 */
async function fetchInvoicesByOrder(env, ref) {
	if (ref.startsWith('IN-') || ref.startsWith('CN-')) {
		const num = ref.slice(3);
		const body = await rbGet(env, `/customer-invoices?limit=100&search=${encodeURIComponent(num)}`);
		return (body?.customer_invoices || []).filter((i) => String(i.number) === num).map(invRecord);
	}
	const body = await rbGet(env, `/customer-invoices?limit=100&order_number=${encodeURIComponent(ref)}`);
	return (body?.customer_invoices || []).map(invRecord);
}

/** Reduce a set of invoices into the figures we verify + cache. */
function figuresFromInvoices(invs) {
	if (!invs || !invs.length) return null;
	return {
		numbers: invs.map((i) => i.number),
		subtotal: invs.reduce((s, i) => s + (i.total_subtotal || 0), 0),
		dates: invs.map((i) => i.invoice_date),
		currency: invs[0].currency || null,
		currency_rate: invs[0].currency_rate ?? null,
	};
}

/** Load cached invoice figures for a set of rackbeat_ids. */
async function loadInvoiceCache(env, ids) {
	const map = new Map();
	const STALE_MS = 14 * 86400 * 1000; // re-attempt not-found deals after 14 days
	const now = Date.now();
	for (const batch of chunks([...new Set(ids)], 100)) {
		const ph = batch.map(() => '?').join(',');
		const rows = await env.DB.prepare(`SELECT * FROM resolved_invoices WHERE rackbeat_id IN (${ph})`).bind(...batch).all();
		for (const r of rows.results || []) {
			const numbers = r.invoice_numbers ? String(r.invoice_numbers).split(',') : [];
			if (numbers.length === 0) {
				// Not-found sentinel: keep as a cache hit only while fresh, so a late
				// invoice is re-checked after the TTL (found invoices never expire).
				const age = now - Date.parse(r.resolved_at || '');
				if (!(age >= 0) || age > STALE_MS) continue;
			}
			map.set(r.rackbeat_id, {
				numbers,
				subtotal: r.subtotal,
				dates: r.invoice_dates ? String(r.invoice_dates).split(',') : [],
				currency: r.currency,
				currency_rate: r.currency_rate,
			});
		}
	}
	return map;
}

/** Upsert resolved invoice figures. entries: [{rackbeat_id, figures}]. */
async function saveInvoiceCache(env, entries) {
	const now = new Date().toISOString();
	const sql = `INSERT OR REPLACE INTO resolved_invoices (rackbeat_id, invoice_numbers, subtotal, invoice_dates, currency, currency_rate, resolved_at) VALUES (?,?,?,?,?,?,?)`;
	for (const batch of chunks(entries, 50)) {
		await env.DB.batch(batch.map((e) => {
			const f = e.figures; // null = not-found sentinel (empty invoice_numbers)
			return env.DB.prepare(sql).bind(
				e.rackbeat_id, f ? f.numbers.join(',') : '', f ? f.subtotal : null, f ? f.dates.join(',') : '', f ? f.currency : null, f ? (f.currency_rate ?? null) : null, now
			);
		}));
	}
}

/** Write resolved invoice numbers to the HubSpot deal's `invoice_id` property. */
async function writeInvoiceIds(env, updates) {
	let written = 0;
	for (const batch of chunks(updates, 100)) {
		const inputs = batch.map((u) => ({ id: u.dealId, properties: { invoice_id: u.invoiceId } }));
		try {
			await hsPost(env, `${HS}/crm/v3/objects/deals/batch/update`, { inputs });
			written += inputs.length;
		} catch (_batchErr) {
			// A batch fails atomically (e.g. a unique-constraint clash). Fall back
			// to per-item so good writes still land and only the clash is skipped.
			for (const inp of inputs) {
				try { await hsPatch(env, `${HS}/crm/v3/objects/deals/${inp.id}`, { properties: inp.properties }); written++; }
				catch (e) { console.log(`invoice_id write failed for deal ${inp.id}: ${String(e?.message ?? e).slice(0, 160)}`); }
			}
		}
	}
	return written;
}

/**
 * Bulk-fetch all customer invoices since 2023-12 and index them by invoice
 * number and by linked order number. Pages fetched in parallel batches.
 */
async function fetchAllInvoices(env, invFrom, invTo) {
	const headers = { Authorization: `Bearer ${env.RACKBEAT_API_KEY}`, Accept: 'application/json' };
	const base = `/customer-invoices?limit=100&date_from=${encodeURIComponent(invFrom + ' 00:00:00')}&date_to=${encodeURIComponent(invTo + ' 23:59:59')}`;
	// Timeout + retry each page; a hung request must not stall the whole run.
	const rbFetchJson = async (url, tries = 4) => {
		for (let a = 0; a < tries; a++) {
			const ctrl = new AbortController();
			const timer = setTimeout(() => ctrl.abort(), 20000);
			try {
				const res = await fetch(url, { headers, signal: ctrl.signal });
				clearTimeout(timer);
				if (res.status === 429) { await sleep(1000 * (a + 1)); continue; }
				if (!res.ok) return null;
				return await res.json();
			} catch (_e) {
				clearTimeout(timer);
				await sleep(500 * (a + 1));
			}
		}
		console.log(`invoices: page failed after retries: ${url}`);
		return null;
	};
	const getPage = async (p) => {
		const b = await rbFetchJson(`${RB}${base}&page=${p}`);
		return b?.customer_invoices || [];
	};

	const byNumber = new Map();
	const byOrder = new Map();
	const add = (inv) => {
		const rec = {
			number: inv.number,
			invoice_date: inv.invoice_date,
			total_subtotal: inv.total_subtotal,
			currency: inv.currency,
			currency_rate: inv.currency_rate,
			is_creditnote: inv.is_creditnote,
		};
		byNumber.set(String(inv.number), rec);
		for (const o of inv.orders || []) {
			const k = String(o);
			if (!byOrder.has(k)) byOrder.set(k, []);
			byOrder.get(k).push(rec);
		}
	};

	const first = await rbFetchJson(`${RB}${base}&page=1`);
	if (!first) throw new Error('Rackbeat invoices page 1 failed');
	const totalPages = first.pages || 1;
	for (const inv of first.customer_invoices || []) add(inv);

	const BATCH = 6;
	for (let start = 2; start <= totalPages; start += BATCH) {
		const pages = [];
		for (let p = start; p < Math.min(start + BATCH, totalPages + 1); p++) pages.push(p);
		const results = await Promise.all(pages.map(getPage));
		for (const arr of results) for (const inv of arr) add(inv);
	}
	return { byNumber, byOrder, invoiceCount: byNumber.size };
}

/**
 * Verify every deal's amount + close date against its Rackbeat invoice.
 * Match: IN-/CN- by invoice number; plain by linked order number.
 * Amount = amount_raw vs invoice total_subtotal (own currency, ±0.5).
 * Date = close_date vs invoice_date (exact). Stores only discrepancies.
 */
async function runVerification(env, range, opts = {}) {
	if (!env.RACKBEAT_API_KEY) throw new Error('No RACKBEAT_API_KEY on worker');
	await setVerifyStatus(env.DB, 'running');

	const tStart = Date.now();
	const dealsRes = await env.DB
		.prepare(
			`SELECT deal_id, deal_name, rackbeat_id, close_date, amount_raw, amount_dkk, currency, owner_name, company_name
			 FROM sales_deals WHERE rackbeat_id IS NOT NULL AND rackbeat_id != '' AND close_date >= ? AND close_date < ?`
		)
		.bind(range.dealFrom, range.dealTo)
		.all();
	const deals = dealsRes.results || [];

	// Resolve invoice figures. Cache hits (incl. not-found sentinels) cost 0
	// Rackbeat calls. Unresolved deals are resolved by targeted order_number /
	// invoice-number lookups — NO date window, so late invoices are never missed.
	// Work is TIME-BUDGETED so a single request stays well under Cloudflare's
	// ~100s edge timeout; if not everything fits, we return {partial:true} and
	// the client calls again (each call caches more — resumable). `opts.bulk`
	// (curl/cron only, no edge timeout) uses one window fetch to warm the cache
	// cheaply for a large first backfill.
	const cache = opts.force ? new Map() : await loadInvoiceCache(env, deals.map((d) => d.rackbeat_id));
	const unresolved = deals.filter((d) => !cache.has(d.rackbeat_id));
	const bulk = (opts.bulk && unresolved.length > BULK_THRESHOLD) ? await fetchAllInvoices(env, range.invFrom, range.invTo) : null;

	const SENTINEL = { numbers: [], subtotal: null, dates: [], currency: null, currency_rate: null };
	const budgetMs = opts.budgetMs ?? 65000;
	const newly = [];
	const hsWrites = [];
	let attempted = 0;
	const resolveOne = async (d) => {
		const rid = d.rackbeat_id;
		const isDoc = rid.startsWith('IN-') || rid.startsWith('CN-');
		let invs = null;
		if (bulk) {
			if (isDoc) { const inv = bulk.byNumber.get(rid.slice(3)); invs = inv ? [inv] : []; }
			else invs = (bulk.byOrder.get(rid) || []).filter((i) => !i.is_creditnote);
		}
		if (!invs || !invs.length) {
			const found = await fetchInvoicesByOrder(env, rid);
			invs = isDoc ? found : found.filter((i) => !i.is_creditnote);
		}
		const fig = figuresFromInvoices(invs);
		cache.set(rid, fig || SENTINEL);
		newly.push({ rackbeat_id: rid, figures: fig });
		if (fig) hsWrites.push({ dealId: d.deal_id, invoiceId: fig.numbers.join(',') });
	};
	for (let i = 0; i < unresolved.length; i += 5) {
		if (!bulk && Date.now() - tStart > budgetMs) break; // time budget (interactive)
		const slice = unresolved.slice(i, i + 5);
		await Promise.all(slice.map(resolveOne));
		attempted += slice.length;
	}
	if (newly.length) await saveInvoiceCache(env, newly);
	const written = hsWrites.length ? await writeInvoiceIds(env, hsWrites) : 0;
	const remaining = unresolved.length - attempted;
	console.log(`verify ${range.label}: ${deals.length} deals, attempted ${attempted}/${unresolved.length} (${written} invoice_ids), remaining ${remaining} in ${Date.now() - tStart}ms`);

	// Not everything resolved within the budget — persist nothing, ask the client
	// to call again. Status stays 'running' so the UI keeps its progress state.
	if (remaining > 0) {
		await setVerifyStatus(env.DB, 'running');
		return { ok: true, partial: true, checked: deals.length, resolved: deals.length - remaining, remaining, invoiceIdsWritten: written };
	}

	const issues = [];
	let ok = 0, amountMis = 0, dateMis = 0, rateMis = 0, notFound = 0, multiple = 0;
	const round4 = (x) => (x == null ? null : Math.round(x * 10000) / 10000);

	for (const d of deals) {
		const fig = cache.get(d.rackbeat_id);
		if (!fig || !fig.numbers || fig.numbers.length === 0) {
			notFound++;
			issues.push({ deal_id: d.deal_id, deal_name: d.deal_name, rackbeat_id: d.rackbeat_id, owner_name: d.owner_name, company_name: d.company_name, close_date: d.close_date, amount_raw: d.amount_raw, currency: d.currency, invoice_number: null, rb_date: null, rb_subtotal: null, hs_rate: null, rb_rate: null, rb_currency: null, amount_match: 0, date_match: 0, rate_match: 0, issue: 'not_found' });
			continue;
		}

		// Sum across invoices when an order has several (partial shipments).
		const rbSubtotal = fig.subtotal || 0;
		const amount_match = Math.abs((d.amount_raw || 0) - rbSubtotal) <= AMOUNT_TOLERANCE ? 1 : 0;
		const date_match = fig.dates.includes(d.close_date) ? 1 : 0;

		// Currency rate: HubSpot's effective rate (home DKK per unit of deal
		// currency) vs the invoice's currency_rate, exact to 4 decimals. Skipped
		// (treated as OK) when the deal has no amount or the invoice no rate.
		const rbCurrency = fig.currency || null;
		const rbRate = round4(fig.currency_rate);
		const hsRate = d.amount_raw ? round4(d.amount_dkk / d.amount_raw) : null;
		const currencyOk = !rbCurrency || !d.currency || rbCurrency === d.currency;
		const rate_match = hsRate == null || rbRate == null ? 1 : currencyOk && hsRate === rbRate ? 1 : 0;
		const multi = fig.numbers.length > 1;

		if (amount_match && date_match && rate_match) { ok++; continue; }
		if (multi) multiple++;
		if (!amount_match) amountMis++;
		if (!date_match) dateMis++;
		if (!rate_match) rateMis++;
		const parts = [];
		if (!amount_match) parts.push('amount');
		if (!date_match) parts.push('date');
		if (!rate_match) parts.push('rate');
		issues.push({
			deal_id: d.deal_id, deal_name: d.deal_name, rackbeat_id: d.rackbeat_id, owner_name: d.owner_name, company_name: d.company_name,
			close_date: d.close_date, amount_raw: d.amount_raw, currency: d.currency,
			invoice_number: fig.numbers.join(','), rb_date: fig.dates.join(','), rb_subtotal: rbSubtotal,
			hs_rate: hsRate, rb_rate: rbRate, rb_currency: rbCurrency,
			amount_match, date_match, rate_match, issue: multi ? 'multiple' : parts.join('+'),
		});
	}

	// Persist: replace issues, update meta.
	await env.DB.prepare('DELETE FROM verification_issues').run();
	const cols = ['deal_id', 'deal_name', 'rackbeat_id', 'owner_name', 'company_name', 'close_date', 'amount_raw', 'currency', 'invoice_number', 'rb_date', 'rb_subtotal', 'hs_rate', 'rb_rate', 'rb_currency', 'amount_match', 'date_match', 'rate_match', 'issue'];
	const ph = `(${cols.map(() => '?').join(',')})`;
	const sql = `INSERT OR REPLACE INTO verification_issues (${cols.join(',')}) VALUES ${ph}`;
	for (const batch of chunks(issues, 50)) {
		await env.DB.batch(batch.map((r) => env.DB.prepare(sql).bind(...cols.map((c) => r[c] ?? null))));
	}
	const finished = new Date().toISOString();
	await env.DB
		.prepare(
			`INSERT INTO verification_meta (id, last_run, checked, ok, amount_mismatch, date_mismatch, rate_mismatch, not_found, multiple, status, message)
			 VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', ?)
			 ON CONFLICT(id) DO UPDATE SET last_run=excluded.last_run, checked=excluded.checked, ok=excluded.ok,
			   amount_mismatch=excluded.amount_mismatch, date_mismatch=excluded.date_mismatch, rate_mismatch=excluded.rate_mismatch, not_found=excluded.not_found,
			   multiple=excluded.multiple, status='ok', message=excluded.message`
		)
		.bind(finished, deals.length, ok, amountMis, dateMis, rateMis, notFound, multiple, `${range.label} · ${cache.size} invoices resolved`)
		.run();

	return { scope: range.label, checked: deals.length, ok, amount_mismatch: amountMis, date_mismatch: dateMis, rate_mismatch: rateMis, not_found: notFound, multiple, invoiceCount: cache.size, newlyResolved: newly.length, invoiceIdsWritten: written, partial: false, issues: issues.length };
}

/**
 * Fix selected deals by writing Rackbeat's values into HubSpot, then syncing
 * our DB. field = 'date' | 'amount' | 'both'. Source of truth = the stored
 * verification_issues row (rb_date / rb_subtotal).
 */
async function runFix(env, dealIds, field) {
	if (!env.HUBSPOT_TOKEN) throw new Error('No HUBSPOT_TOKEN');
	const wantDate = field === 'date' || field === 'all';
	const wantAmount = field === 'amount' || field === 'all';
	const wantCurrencies = field === 'currency' || field === 'all'; // rate + currency code
	const round4 = (x) => (x == null ? null : Math.round(x * 10000) / 10000);
	let fixed = 0, failed = 0;
	const errors = [];

	for (const id of dealIds) {
		try {
			const row = await env.DB.prepare('SELECT * FROM verification_issues WHERE deal_id = ?').bind(id).first();
			if (!row) { failed++; errors.push({ id, error: 'not in issues list' }); continue; }

			const props = {};
			if (wantDate && row.rb_date && !String(row.rb_date).includes(',')) {
				props.closedate = Date.parse(`${row.rb_date}T00:00:00Z`); // epoch ms, midnight UTC
			}
			if (wantAmount && row.rb_subtotal != null) {
				props.amount = String(row.rb_subtotal);
			}
			// Currencies: align the deal's currency with the invoice. If the code is
			// wrong, switch it (+ amount + rate); otherwise just write the rate.
			// HubSpot recomputes amount_in_home_currency from the rate/currency.
			if (wantCurrencies) {
				if (row.rb_currency && row.currency !== row.rb_currency) {
					props.deal_currency_code = row.rb_currency;
					if (row.rb_subtotal != null) props.amount = String(row.rb_subtotal);
					if (row.rb_rate != null) props.hs_exchange_rate = String(row.rb_rate);
				} else if (row.rb_rate != null) {
					props.hs_exchange_rate = String(row.rb_rate);
				}
			}
			if (!Object.keys(props).length) { failed++; errors.push({ id, error: 'nothing fixable for this field' }); continue; }

			// Write to HubSpot, then read the deal back for accurate mirror values.
			await hsPatch(env, `${HS}/crm/v3/objects/deals/${id}`, { properties: props });
			const back = await hsGet(env, `${HS}/crm/v3/objects/deals/${id}?properties=amount,amount_in_home_currency,closedate,hs_exchange_rate,deal_currency_code`);
			const p = back.properties || {};
			const newClose = p.closedate ? String(p.closedate).slice(0, 10) : row.close_date;
			const newRaw = num(p.amount);
			const newDkk = num(p.amount_in_home_currency);
			const newCur = p.deal_currency_code || row.currency;
			await env.DB.prepare('UPDATE sales_deals SET close_date = ?, amount_raw = ?, amount_dkk = ?, currency = ? WHERE deal_id = ?')
				.bind(newClose, newRaw, newDkk, newCur, id).run();

			// Re-evaluate against Rackbeat; drop the row if it now matches.
			const amtOk = row.rb_subtotal == null ? row.amount_match : Math.abs((newRaw || 0) - row.rb_subtotal) <= 0.5 ? 1 : 0;
			const dateOk = !row.rb_date || String(row.rb_date).includes(',') ? row.date_match : newClose === row.rb_date ? 1 : 0;
			const newRate = newRaw ? round4(newDkk / newRaw) : null;
			const currencyMismatch = newCur && row.rb_currency && newCur !== row.rb_currency;
			const rateOk = row.rb_rate == null || currencyMismatch || newRate == null
				? row.rate_match
				: newRate === round4(row.rb_rate) ? 1 : 0;
			if (amtOk && dateOk && rateOk && !currencyMismatch) {
				await env.DB.prepare('DELETE FROM verification_issues WHERE deal_id = ?').bind(id).run();
			} else {
				const parts = [];
				if (!amtOk) parts.push('amount');
				if (!dateOk) parts.push('date');
				if (!rateOk) parts.push('rate');
				const issue = row.issue === 'multiple' ? 'multiple' : parts.join('+');
				await env.DB.prepare('UPDATE verification_issues SET close_date = ?, amount_raw = ?, currency = ?, hs_rate = ?, amount_match = ?, date_match = ?, rate_match = ?, issue = ? WHERE deal_id = ?')
					.bind(newClose, newRaw, newCur, newRate, amtOk, dateOk, rateOk, issue, id).run();
			}
			fixed++;
		} catch (e) {
			failed++;
			errors.push({ id, error: (e?.message ?? String(e)).slice(0, 200) });
		}
	}

	await recomputeVerifyMeta(env.DB);
	return { fixed, failed, errors: errors.slice(0, 25) };
}

async function recomputeVerifyMeta(db) {
	const c = await db
		.prepare(
			`SELECT COUNT(*) total,
			        SUM(CASE WHEN amount_match=0 AND issue!='not_found' THEN 1 ELSE 0 END) amt,
			        SUM(CASE WHEN date_match=0 AND issue!='not_found' THEN 1 ELSE 0 END) dt,
			        SUM(CASE WHEN rate_match=0 AND issue!='not_found' THEN 1 ELSE 0 END) rt,
			        SUM(CASE WHEN issue='not_found' THEN 1 ELSE 0 END) nf,
			        SUM(CASE WHEN issue='multiple' THEN 1 ELSE 0 END) mu
			 FROM verification_issues`
		)
		.first();
	const meta = await db.prepare('SELECT checked FROM verification_meta WHERE id = 1').first();
	const checked = meta?.checked ?? 0;
	await db
		.prepare('UPDATE verification_meta SET amount_mismatch=?, date_mismatch=?, rate_mismatch=?, not_found=?, multiple=?, ok=? WHERE id=1')
		.bind(c?.amt || 0, c?.dt || 0, c?.rt || 0, c?.nf || 0, c?.mu || 0, Math.max(0, checked - (c?.total || 0)))
		.run();
}

/** Set verification run status ('running'|'ok'|'error') without touching counts. */
async function setVerifyStatus(db, status, message) {
	await db
		.prepare(
			`INSERT INTO verification_meta (id, status, message) VALUES (1, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET status = excluded.status,
			   message = COALESCE(excluded.message, verification_meta.message)`
		)
		.bind(status, message ?? null)
		.run();
}

// ---- HubSpot fetch helpers --------------------------------------------------

async function fetchOwners(env) {
	const map = {};
	let after;
	do {
		const url = new URL(`${HS}/crm/v3/owners/`);
		url.searchParams.set('limit', '500');
		if (after) url.searchParams.set('after', after);
		const data = await hsGet(env, url.toString());
		for (const o of data.results || []) {
			const name = [o.firstName, o.lastName].filter(Boolean).join(' ').trim();
			map[o.id] = { email: o.email || null, name: name || o.email || null };
		}
		after = data.paging?.next?.after;
	} while (after);
	return map;
}

async function fetchDealsForYear(env, year) {
	// HubSpot Search returns at most 10,000 results per query (pagination past
	// `after=10000` errors). A single year can exceed that, so we chunk by
	// month — each month stays well under the cap.
	//
	// `closedate` is a HubSpot *datetime* property; the Search API wants its
	// filter values as epoch milliseconds (UTC), not YYYY-MM-DD strings.
	const results = [];
	for (let month = 0; month < 12; month++) {
		const gte = String(Date.UTC(year, month, 1));
		const lt = String(Date.UTC(year, month + 1, 1)); // month 12 rolls to next Jan
		let after;
		do {
			const body = {
				filterGroups: [
					{
						filters: [
							{ propertyName: 'hs_is_closed_won', operator: 'EQ', value: 'true' },
							{ propertyName: 'auto_imported', operator: 'EQ', value: 'true' },
							{ propertyName: 'closedate', operator: 'GTE', value: gte },
							{ propertyName: 'closedate', operator: 'LT', value: lt },
						],
					},
				],
				properties: DEAL_PROPS,
				sorts: [{ propertyName: 'closedate', direction: 'ASCENDING' }],
				limit: 100,
				...(after ? { after } : {}),
			};
			const data = await hsPost(env, `${HS}/crm/v3/objects/deals/search`, body);
			results.push(...(data.results || []));
			after = data.paging?.next?.after;
		} while (after);
	}
	return results;
}

async function fetchModifiedDeals(env, sinceMs) {
	// `hs_lastmodifieddate` is a datetime property → filter value in epoch millis.
	const results = [];
	let after;
	do {
		const body = {
			filterGroups: [
				{
					filters: [
						{ propertyName: 'hs_is_closed_won', operator: 'EQ', value: 'true' },
						{ propertyName: 'auto_imported', operator: 'EQ', value: 'true' },
						{ propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: String(sinceMs) },
					],
				},
			],
			properties: DEAL_PROPS,
			sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'ASCENDING' }],
			limit: 100,
			...(after ? { after } : {}),
		};
		const data = await hsPost(env, `${HS}/crm/v3/objects/deals/search`, body);
		results.push(...(data.results || []));
		after = data.paging?.next?.after;
	} while (after);
	return results;
}

async function fetchDealCompanyAssociations(env, dealIds) {
	const out = {};
	for (const chunk of chunks(dealIds, 100)) {
		const body = { inputs: chunk.map((id) => ({ id })) };
		const data = await hsPost(env, `${HS}/crm/v4/associations/deals/companies/batch/read`, body);
		for (const r of data.results || []) {
			const from = r.from?.id;
			const to = r.to?.[0]?.toObjectId ?? r.to?.[0]?.id ?? null;
			if (from) out[from] = to ? String(to) : null;
		}
	}
	return out;
}

async function fetchCompanies(env, companyIds) {
	const out = {};
	for (const chunk of chunks(companyIds, 100)) {
		const body = { inputs: chunk.map((id) => ({ id })), properties: COMPANY_PROPS };
		const data = await hsPost(env, `${HS}/crm/v3/objects/companies/batch/read`, body);
		for (const c of data.results || []) {
			out[c.id] = c.properties || {};
		}
	}
	return out;
}

async function hsGet(env, url) {
	return hsRequest(env, url, { method: 'GET' });
}

async function hsPost(env, url, body) {
	return hsRequest(env, url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
}

async function hsPatch(env, url, body) {
	return hsRequest(env, url, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
}

async function hsRequest(env, url, init, attempt = 0) {
	const res = await fetch(url, {
		...init,
		headers: {
			Authorization: `Bearer ${env.HUBSPOT_TOKEN}`,
			Accept: 'application/json',
			...(init.headers || {}),
		},
	});
	if (res.status === 429 && attempt < 5) {
		const wait = parseInt(res.headers.get('Retry-After') || '2', 10) * 1000 || 2000;
		await sleep(wait);
		return hsRequest(env, url, init, attempt + 1);
	}
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`HubSpot ${res.status} ${init.method} ${url}: ${text.slice(0, 300)}`);
	}
	return res.json();
}

// ---- D1 write ---------------------------------------------------------------

const ROW_COLS = [
	'deal_id', 'deal_name', 'close_date', 'amount_dkk', 'amount_raw', 'currency',
	'pipeline', 'dealstage', 'company_id', 'company_name', 'owner_email', 'owner_name',
	'country', 'market', 'customer_group', 'customer_level', 'last_contacted', 'rackbeat_id', 'updated_at',
];

const FORECAST_COLS = [...ROW_COLS, 'forecast_start_date', 'forecast_end_date'];

/** Fetch + replace all forecast-stage deals into forecast_deals (small set). */
async function syncForecastDeals(env) {
	const deals = [];
	let after;
	do {
		const body = {
			filterGroups: [{ filters: [{ propertyName: 'dealstage', operator: 'IN', values: FORECAST_STAGES }] }],
			properties: DEAL_PROPS,
			sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
			limit: 100,
			...(after ? { after } : {}),
		};
		const data = await hsPost(env, `${HS}/crm/v3/objects/deals/search`, body);
		deals.push(...(data.results || []));
		after = data.paging?.next?.after;
	} while (after);

	const { rows } = await enrichDeals(env, deals);
	await env.DB.prepare('DELETE FROM forecast_deals').run();
	const ph = `(${FORECAST_COLS.map(() => '?').join(',')})`;
	const sql = `INSERT OR REPLACE INTO forecast_deals (${FORECAST_COLS.join(',')}) VALUES ${ph}`;
	for (const batch of chunks(rows, 50)) {
		await env.DB.batch(batch.map((r) => env.DB.prepare(sql).bind(...FORECAST_COLS.map((c) => r[c] ?? null))));
	}
	return { forecast_deals: rows.length };
}

// Columns accepted by the bulk line-item import (pre-computed rows).
const LINE_ITEM_COLS = [
	'line_item_id', 'deal_id', 'deal_kind', 'company_id', 'close_date', 'sku', 'sku_prefix',
	'name', 'unit_price', 'discount', 'net_price', 'amount_dkk', 'currency', 'quantity',
	'publisher', 'quantity_log_create', 'quantity_log_start',
];

/** Bulk-insert pre-computed line-item rows (used by the one-time CSV importer). */
async function importLineItems(env, rows) {
	const ph = `(${LINE_ITEM_COLS.map(() => '?').join(',')})`;
	const sql = `INSERT OR REPLACE INTO deal_line_items (${LINE_ITEM_COLS.join(',')}) VALUES ${ph}`;
	for (const batch of chunks(rows, 50)) {
		await env.DB.batch(batch.map((r) => env.DB.prepare(sql).bind(...LINE_ITEM_COLS.map((c) => r[c] ?? null))));
	}
	return rows.length;
}

// ── Incremental line-item sync ───────────────────────────────────────────────

/** Publisher mapping tables → { prefixMap, overrideMap } for resolving new lines. */
async function resolvePublisherMaps(env) {
	const [pfx, ovr] = await Promise.all([
		env.DB.prepare('SELECT prefix, publisher FROM publisher_prefix').all(),
		env.DB.prepare('SELECT sku, publisher FROM product_publisher_override').all(),
	]);
	const prefixMap = {}; for (const r of pfx.results || []) prefixMap[r.prefix] = r.publisher;
	const overrideMap = {}; for (const r of ovr.results || []) overrideMap[r.sku] = r.publisher;
	return { prefixMap, overrideMap };
}

/** Fetch line items for a set of deals → { dealId: [{ id, p }] }. */
async function fetchDealLineItems(env, dealIds) {
	const dealToLine = {};
	const allLineIds = new Set();
	for (const chunk of chunks(dealIds, 100)) {
		const data = await hsPost(env, `${HS}/crm/v4/associations/deals/line_items/batch/read`, { inputs: chunk.map((id) => ({ id })) });
		for (const r of data.results || []) {
			const from = r.from?.id;
			if (!from) continue;
			const ids = (r.to || []).map((t) => String(t.toObjectId ?? t.id)).filter(Boolean);
			dealToLine[from] = ids;
			ids.forEach((i) => allLineIds.add(i));
		}
	}
	const props = {};
	for (const chunk of chunks([...allLineIds], 100)) {
		const data = await hsPost(env, `${HS}/crm/v3/objects/line_items/batch/read`, { inputs: chunk.map((id) => ({ id })), properties: LINE_ITEM_PROPS });
		for (const li of data.results || []) props[li.id] = li.properties || {};
	}
	const byDeal = {};
	for (const [dealId, ids] of Object.entries(dealToLine)) {
		byDeal[dealId] = ids.filter((i) => props[i]).map((i) => ({ id: i, p: props[i] }));
	}
	return byDeal;
}

/** Build one deal_line_items row from a HubSpot line item + its (mirror) deal row. */
function buildLineRow(li, deal, kind, maps) {
	const p = li.p;
	const sku = p.hs_sku || null;
	const pfx = skuPrefix(sku);
	const net = num(p.amount);
	const currency = p.hs_line_item_currency_code || deal.currency || null;
	let dkk = num(p.line_item_revenue_in_company_currency);
	if (dkk == null) {
		if (currency === 'DKK') dkk = net;
		else {
			const rate = deal.amount_raw && deal.amount_dkk != null ? deal.amount_dkk / deal.amount_raw : null;
			dkk = net != null && rate != null ? net * rate : null;
		}
	}
	// Intentional: unmapped → SKU prefix (not "Unknown"); null when no prefix.
	const publisher = maps.overrideMap[sku] ?? maps.prefixMap[pfx] ?? pfx ?? null;
	return {
		line_item_id: li.id, deal_id: String(deal.deal_id), deal_kind: kind,
		company_id: deal.company_id ?? null, close_date: deal.close_date ?? null,
		sku, sku_prefix: pfx, name: p.name || null,
		unit_price: num(p.price), discount: num(p.discount), net_price: net,
		amount_dkk: dkk, currency, quantity: num(p.quantity),
		publisher, quantity_log_create: num(p.quantity_log_create), quantity_log_start: num(p.quantity_log_start),
	};
}

/** Replace line items for the given deal rows: delete existing, insert current. */
async function refreshLineItemsForDeals(env, dealRows, kind, maps) {
	if (!dealRows.length) return { deals: 0, lines: 0 };
	const dealById = {};
	for (const d of dealRows) dealById[String(d.deal_id)] = d;
	const dealIds = Object.keys(dealById);
	const byDeal = await fetchDealLineItems(env, dealIds);
	const rows = [];
	for (const [dealId, items] of Object.entries(byDeal)) {
		const deal = dealById[dealId];
		if (!deal) continue;
		for (const li of items) rows.push(buildLineRow(li, deal, kind, maps));
	}
	for (const chunk of chunks(dealIds, 50)) {
		await env.DB.prepare(`DELETE FROM deal_line_items WHERE deal_id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).run();
	}
	await importLineItems(env, rows);
	return { deals: dealIds.length, lines: rows.length };
}

/** Deals whose line items changed since the watermark (line-only edits). */
async function fetchDealsWithChangedLineItems(env, sinceMs) {
	const lineIds = [];
	let after;
	do {
		const body = {
			filterGroups: [{ filters: [{ propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: String(sinceMs) }] }],
			properties: ['hs_sku'], limit: 100, ...(after ? { after } : {}),
		};
		const data = await hsPost(env, `${HS}/crm/v3/objects/line_items/search`, body);
		lineIds.push(...(data.results || []).map((l) => l.id));
		after = data.paging?.next?.after;
	} while (after);
	if (!lineIds.length) return [];
	const dealIds = new Set();
	for (const chunk of chunks(lineIds, 100)) {
		const data = await hsPost(env, `${HS}/crm/v4/associations/line_items/deals/batch/read`, { inputs: chunk.map((id) => ({ id })) });
		for (const r of data.results || []) for (const t of r.to || []) dealIds.add(String(t.toObjectId ?? t.id));
	}
	return [...dealIds];
}

/** Load mirror deal rows (context for building line items) for a set of ids. */
async function loadDealRows(env, table, ids) {
	const out = [];
	for (const chunk of chunks(ids, 100)) {
		const r = await env.DB
			.prepare(`SELECT deal_id, company_id, close_date, amount_raw, amount_dkk, currency FROM ${table} WHERE deal_id IN (${chunk.map(() => '?').join(',')})`)
			.bind(...chunk).all();
		out.push(...(r.results || []));
	}
	return out;
}

/**
 * Incremental line-item refresh: closed deals modified since the watermark (or a
 * supplied id list) + deals whose line items changed, plus ALL forecast deals
 * (small; keeps quantity-logs current). Replaces those deals' lines wholesale,
 * so new/edited/deleted lines all land.
 */
async function syncLineItems(env, sinceIso, modifiedClosedIds = null) {
	const maps = await resolvePublisherMaps(env);
	const base = sinceIso ? Date.parse(sinceIso) : Date.now() - 2 * 86400000;
	const sinceMs = (Number.isFinite(base) ? base : Date.now() - 2 * 86400000) - 2 * 3600 * 1000;

	const closedIds = modifiedClosedIds ?? (await fetchModifiedDeals(env, sinceMs)).map((d) => d.id);
	const lineChanged = await fetchDealsWithChangedLineItems(env, sinceMs);
	const candidates = [...new Set([...closedIds, ...lineChanged].map(String))];
	const closedRows = candidates.length ? await loadDealRows(env, 'sales_deals', candidates) : [];
	const closed = await refreshLineItemsForDeals(env, closedRows, 'closed', maps);

	const fcRows = (await env.DB.prepare('SELECT deal_id, company_id, close_date, amount_raw, amount_dkk, currency FROM forecast_deals').all()).results || [];
	const forecast = await refreshLineItemsForDeals(env, fcRows, 'forecast', maps);

	return { closed_deals: closed.deals, closed_lines: closed.lines, forecast_deals: forecast.deals, forecast_lines: forecast.lines };
}

/** INSERT OR REPLACE rows by deal_id (no deletes). Used by both paths. */
async function insertRows(db, rows) {
	const placeholders = `(${ROW_COLS.map(() => '?').join(',')})`;
	const insertSql = `INSERT OR REPLACE INTO sales_deals (${ROW_COLS.join(',')}) VALUES ${placeholders}`;
	for (const batch of chunks(rows, 50)) {
		const stmts = batch.map((r) => db.prepare(insertSql).bind(...ROW_COLS.map((c) => r[c] ?? null)));
		await db.batch(stmts);
	}
}

async function writeRows(db, rows, { onlyYear, sinceYear }) {
	// Replace exactly the window we just re-fetched: a single year, everything
	// from `sinceYear` onward (daily cron), or the whole table (full rebuild).
	if (onlyYear) {
		await db
			.prepare('DELETE FROM sales_deals WHERE close_date >= ? AND close_date < ?')
			.bind(`${onlyYear}-01-01`, `${onlyYear + 1}-01-01`)
			.run();
	} else if (sinceYear) {
		await db.prepare('DELETE FROM sales_deals WHERE close_date >= ?').bind(`${sinceYear}-01-01`).run();
	} else {
		await db.prepare('DELETE FROM sales_deals').run();
	}
	await insertRows(db, rows);
}

async function getMeta(db) {
	return db.prepare('SELECT * FROM sales_sync_meta WHERE id = 1').first().catch(() => null);
}

async function setMeta(db, fields) {
	const current = await db.prepare('SELECT * FROM sales_sync_meta WHERE id = 1').first().catch(() => null);
	const merged = {
		last_run: fields.last_run ?? current?.last_run ?? null,
		status: fields.status ?? current?.status ?? null,
		deal_count: fields.deal_count ?? current?.deal_count ?? null,
		message: fields.message ?? current?.message ?? null,
	};
	await db
		.prepare(
			`INSERT INTO sales_sync_meta (id, last_run, status, deal_count, message)
			 VALUES (1, ?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET last_run=excluded.last_run, status=excluded.status,
			   deal_count=excluded.deal_count, message=excluded.message`
		)
		.bind(merged.last_run, merged.status, merged.deal_count, merged.message)
		.run();
}

// ---- utils ------------------------------------------------------------------

function marketFromCountry(country) {
	const c = (country || '').trim().toLowerCase();
	if (c === 'denmark' || c === 'danmark') return 'Denmark';
	if (c === 'sweden' || c === 'sverige') return 'Sweden';
	if (c === 'norway' || c === 'norge') return 'Norway';
	return 'International';
}

function num(v) {
	if (v == null || v === '') return null;
	const n = parseFloat(v);
	return Number.isFinite(n) ? n : null;
}

function chunks(arr, size) {
	const out = [];
	for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
	return out;
}

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

function json(obj, status = 200) {
	return new Response(JSON.stringify(obj, null, 2), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}
