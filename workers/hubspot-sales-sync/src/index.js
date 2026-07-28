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

	async fetch(request, env) {
		const auth = request.headers.get('Authorization') || '';
		const token = auth.replace(/^Bearer\s+/i, '');
		if (!env.SYNC_SECRET || token !== env.SYNC_SECRET) {
			return json({ error: 'Unauthorized' }, 401);
		}
		const url = new URL(request.url);
		try {
			if (url.searchParams.get('verifyProbe') === '1') {
				return json(await verifyProbe(env), 200);
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

// ---- Rackbeat verification probe (temporary) --------------------------------

const RB = 'https://app.rackbeat.com/api';

/**
 * TEMPORARY: dumps the raw Rackbeat invoice for a few sample deals of each
 * rackbeat_id shape (plain order / IN- / CN-), to confirm the field mapping
 * before building the verification report. Remove once confirmed.
 */
async function verifyProbe(env) {
	if (!env.RACKBEAT_API_KEY) return { error: 'No RACKBEAT_API_KEY on worker' };

	async function sample(where) {
		const r = await env.DB
			.prepare(
				`SELECT deal_name, rackbeat_id, close_date, amount_raw, amount_dkk, currency
				 FROM sales_deals WHERE ${where} AND rackbeat_id IS NOT NULL AND rackbeat_id != '' AND close_date >= '2026-01-01' LIMIT 2`
			)
			.all();
		return r.results || [];
	}
	const deals = [
		...(await sample("rackbeat_id NOT LIKE 'IN-%' AND rackbeat_id NOT LIKE 'CN-%'")),
		...(await sample("rackbeat_id LIKE 'IN-%'")),
		...(await sample("rackbeat_id LIKE 'CN-%'")),
	];

	async function rbGet(path) {
		const res = await fetch(`${RB}${path}`, {
			headers: { Authorization: `Bearer ${env.RACKBEAT_API_KEY}`, Accept: 'application/json' },
		});
		const text = await res.text();
		let body;
		try { body = JSON.parse(text); } catch { body = text.slice(0, 400); }
		return { status: res.status, body };
	}

	const out = [];
	for (const d of deals) {
		const rid = d.rackbeat_id;
		let query;
		if (rid.startsWith('CN-')) query = `/invoices?is_creditnote=true&search=${encodeURIComponent(rid.slice(3))}`;
		else if (rid.startsWith('IN-')) query = `/invoices?search=${encodeURIComponent(rid.slice(3))}`;
		else query = `/invoices?order_number=${encodeURIComponent(rid)}`;
		const rb = await rbGet(query);
		const list = Array.isArray(rb.body) ? rb.body : rb.body?.invoices ?? rb.body?.data ?? null;
		out.push({
			deal: d,
			query,
			rbStatus: rb.status,
			resultCount: Array.isArray(list) ? list.length : null,
			firstResult: Array.isArray(list) ? list[0] ?? null : rb.body,
		});
	}
	return { probe: out };
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
