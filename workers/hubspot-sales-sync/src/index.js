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
];

// Company properties (the "customer level" data).
const COMPANY_PROPS = ['name', 'country', 'customer_group', 'customer_color', 'hubspot_owner_id'];

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
			if (url.searchParams.get('fix') === '1') {
				const body = await request.json().catch(() => ({}));
				const dealIds = Array.isArray(body.dealIds) ? body.dealIds.map(String) : [];
				const field = body.field;
				if (!dealIds.length || !['date', 'amount', 'both', 'rate', 'all', 'currency'].includes(field)) {
					return json({ ok: false, error: 'dealIds[] and field (date|amount|both|rate|all|currency) required' }, 400);
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
				return json({ ok: true, ...(await runVerification(env, range)) });
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
	if (event?.cron === MONTHLY_CRON) {
		await runSync(env, {}); // monthly full reconcile (catches deletions / un-wins)
		return;
	}
	// Daily: refresh the active window, then sweep anything edited since last run.
	const prev = (await getMeta(env.DB))?.last_run || null;
	await runSync(env, { sinceYear: currentYear - 1 });
	await incrementalSync(env, prev);
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
			return { incremental: true, changed: 0, since: new Date(sinceMs).toISOString() };
		}
		const { rows } = await enrichDeals(env, deals);
		await insertRows(env.DB, rows);
		const finished = new Date().toISOString();
		await setMeta(env.DB, { status: 'ok', last_run: finished, message: `incremental: upserted ${rows.length} changed deals` });
		return { incremental: true, changed: rows.length, since: new Date(sinceMs).toISOString() };
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
			rackbeat_id: p.rackbeat_id || null,
			updated_at: p.hs_lastmodifieddate ? String(p.hs_lastmodifieddate) : null,
		};
	});
	return { rows, companyCount: companyIds.length };
}

// ---- Rackbeat verification (amount & close date vs Rackbeat invoices) --------

const RB = 'https://app.rackbeat.com/api';
const AMOUNT_TOLERANCE = 0.5; // kr, absorbs rounding

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
async function runVerification(env, range) {
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
	const { byNumber, byOrder, invoiceCount } = await fetchAllInvoices(env, range.invFrom, range.invTo);
	console.log(`verify ${range.label}: ${deals.length} deals, ${invoiceCount} invoices in ${Date.now() - tStart}ms`);

	const issues = [];
	let ok = 0, amountMis = 0, dateMis = 0, rateMis = 0, notFound = 0, multiple = 0;
	const round4 = (x) => (x == null ? null : Math.round(x * 10000) / 10000);

	for (const d of deals) {
		const rid = d.rackbeat_id;
		let invs;
		if (rid.startsWith('IN-') || rid.startsWith('CN-')) {
			// Exact document by number (IN- = invoice, CN- = credit note).
			const inv = byNumber.get(rid.slice(3));
			invs = inv ? [inv] : [];
		} else {
			// Order: compare against its sales invoice(s); ignore linked credit notes.
			invs = (byOrder.get(rid) || []).filter((i) => !i.is_creditnote);
		}

		if (!invs.length) {
			notFound++;
			issues.push({ ...d, invoice_number: null, rb_date: null, rb_subtotal: null, hs_rate: null, rb_rate: null, rb_currency: null, amount_match: 0, date_match: 0, rate_match: 0, issue: 'not_found' });
			continue;
		}

		// Sum across invoices when an order has several (partial shipments).
		const rbSubtotal = invs.reduce((s, i) => s + (i.total_subtotal || 0), 0);
		const amount_match = Math.abs((d.amount_raw || 0) - rbSubtotal) <= AMOUNT_TOLERANCE ? 1 : 0;
		const dates = invs.map((i) => i.invoice_date);
		const date_match = dates.includes(d.close_date) ? 1 : 0;

		// Currency rate: HubSpot's effective rate (home DKK per unit of deal
		// currency) vs the invoice's currency_rate, exact to 4 decimals. Skipped
		// (treated as OK) when the deal has no amount or the invoice no rate.
		const rbCurrency = invs[0].currency || null;
		const rbRate = round4(invs[0].currency_rate);
		const hsRate = d.amount_raw ? round4(d.amount_dkk / d.amount_raw) : null;
		const currencyOk = !rbCurrency || !d.currency || rbCurrency === d.currency;
		const rate_match = hsRate == null || rbRate == null ? 1 : currencyOk && hsRate === rbRate ? 1 : 0;

		if (amount_match && date_match && rate_match) { ok++; continue; }
		if (invs.length > 1) multiple++;
		if (!amount_match) amountMis++;
		if (!date_match) dateMis++;
		if (!rate_match) rateMis++;
		const parts = [];
		if (!amount_match) parts.push('amount');
		if (!date_match) parts.push('date');
		if (!rate_match) parts.push('rate');
		const issue = invs.length > 1 ? 'multiple' : parts.join('+');
		issues.push({
			deal_id: d.deal_id, deal_name: d.deal_name, rackbeat_id: rid, owner_name: d.owner_name, company_name: d.company_name,
			close_date: d.close_date, amount_raw: d.amount_raw, currency: d.currency,
			invoice_number: invs.map((i) => i.number).join(','), rb_date: dates.join(','), rb_subtotal: rbSubtotal,
			hs_rate: hsRate, rb_rate: rbRate, rb_currency: rbCurrency,
			amount_match, date_match, rate_match, issue,
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
		.bind(finished, deals.length, ok, amountMis, dateMis, rateMis, notFound, multiple, `${range.label} · invoices indexed ${invoiceCount}`)
		.run();

	return { scope: range.label, checked: deals.length, ok, amount_mismatch: amountMis, date_mismatch: dateMis, rate_mismatch: rateMis, not_found: notFound, multiple, invoiceCount, issues: issues.length };
}

/**
 * Fix selected deals by writing Rackbeat's values into HubSpot, then syncing
 * our DB. field = 'date' | 'amount' | 'both'. Source of truth = the stored
 * verification_issues row (rb_date / rb_subtotal).
 */
async function runFix(env, dealIds, field) {
	if (!env.HUBSPOT_TOKEN) throw new Error('No HUBSPOT_TOKEN');
	const wantDate = field === 'date' || field === 'both' || field === 'all';
	const wantAmount = field === 'amount' || field === 'both' || field === 'all';
	const wantRate = field === 'rate' || field === 'all';
	const wantCurrency = field === 'currency';
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
			// Currency rate: write the invoice's rate onto the deal. Only when the
			// currency codes match (a wrong currency needs a currency change, not
			// just a rate). HubSpot recalculates amount_in_home_currency from it.
			if (wantRate && row.rb_rate != null && (!row.currency || !row.rb_currency || row.currency === row.rb_currency)) {
				props.hs_exchange_rate = String(row.rb_rate);
			}
			// Wrong currency: switch the deal to the invoice's currency and set its
			// amount + rate to the Rackbeat values (the amount number stays, it's now
			// correctly labelled). HubSpot recomputes amount_in_home_currency.
			if (wantCurrency && row.rb_currency && row.currency !== row.rb_currency) {
				props.deal_currency_code = row.rb_currency;
				if (row.rb_subtotal != null) props.amount = String(row.rb_subtotal);
				if (row.rb_rate != null) props.hs_exchange_rate = String(row.rb_rate);
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
	'country', 'market', 'customer_group', 'customer_level', 'rackbeat_id', 'updated_at',
];

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
