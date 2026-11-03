/**
 * lagersystem-sync
 *
 * Mirrors our Lagersystem (warehouse) orders into the portal `wms_orders` /
 * `wms_order_lines` tables, for the Orders → Warehouse dashboard
 * (Inbound vs Handled over time).
 *
 * READ-ONLY against Lagersystem. The only writes are to our own D1 tables.
 *
 * Strategy (the per-status lists are the source of truth):
 *   - FINISHED  -> paged newest-first, incrementally: stop once we reach orders
 *                  older than the cutoff (last synced done_date, with overlap;
 *                  BACKFILL_DAYS on a cold start). Gives the handled history.
 *   - active    -> RECEIVED / PROCESSING / PICKED / PACKED / PARKED / CONFLICTED
 *                  fetched in full each run (small) -> the live inbound queue.
 *
 * Triggers:
 *   - hourly cron
 *   - HTTP GET/POST with `Authorization: Bearer <SYNC_SECRET>`:
 *       (default)      incremental run (same as cron)
 *       ?full=1        ignore stored cutoff, backfill BACKFILL_DAYS of FINISHED
 *       ?days=N        backfill N days of FINISHED this run
 *       ?backfill=1    resumable historical backfill of FINISHED, bounded per
 *                      request (FINISHED is newest-first with no server-side
 *                      date filter, so we page by index):
 *                        &page=N   start page (default 1)
 *                        &pages=M  pages to process this call (default 30, max 60)
 *                        &until=YYYY-MM-DD  stop once done_date < this (default
 *                                           BACKFILL_DAYS back)
 *                      Returns compact JSON; `"next":N` means call again with
 *                      page=N, absent means finished. Does NOT touch the cron's
 *                      incremental cursor or the active queues.
 */

const BASE = 'https://spilbraetdk.lagersystem.dk';
const PAGESIZE = 50;
const ACTIVE_STATUSES = ['RECEIVED', 'PROCESSING', 'PICKED', 'PACKED', 'PARKED', 'CONFLICTED'];
const OVERLAP_DAYS = 3; // re-pull a few days past the last cutoff to catch late edits

export default {
	async scheduled(event, env, ctx) {
		ctx.waitUntil(run(env, {}).catch((e) => console.error('scheduled sync failed', e)));
	},

	async fetch(request, env) {
		const auth = request.headers.get('Authorization') || '';
		const token = auth.replace(/^Bearer\s+/i, '');
		if (!env.SYNC_SECRET || token !== env.SYNC_SECRET) {
			return json({ error: 'Unauthorized' }, 401);
		}
		if (!env.LAGERSYSTEM_API_KEY) return json({ error: 'LAGERSYSTEM_API_KEY not set' }, 500);
		const url = new URL(request.url);

		// Resumable historical backfill (bounded per request).
		if (url.searchParams.get('backfill') === '1') {
			const startPage = Math.max(1, Number(url.searchParams.get('page')) || 1);
			const pages = Math.min(60, Math.max(1, Number(url.searchParams.get('pages')) || 30));
			const until = url.searchParams.get('until') || daysAgoYmd(Number(env.BACKFILL_DAYS) || 540);
			try {
				return json(await backfillPages(env, startPage, pages, until), 200, true);
			} catch (e) {
				return json({ ok: false, error: e instanceof Error ? e.message : String(e), next: startPage }, 500, true);
			}
		}

		const opts = {};
		if (url.searchParams.get('full') === '1') opts.full = true;
		if (url.searchParams.get('stock') === '1') opts.stock = true; // force a stock snapshot
		const days = Number(url.searchParams.get('days'));
		if (Number.isFinite(days) && days > 0) opts.days = days;
		try {
			const out = await run(env, opts);
			return json({ ok: true, ...out });
		} catch (e) {
			return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
		}
	},
};

/** Shift today's UTC date by -n days, as YYYY-MM-DD. */
function daysAgoYmd(n) {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() - n);
	return d.toISOString().slice(0, 10);
}
/** Shift a YYYY-MM-DD string by n days. */
function shiftYmd(s, n) {
	const d = new Date(s + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

async function lagerGet(env, path) {
	const res = await fetch(BASE + path, {
		headers: { 'X-APIKEY': env.LAGERSYSTEM_API_KEY, Accept: 'application/json' },
	});
	const text = await res.text();
	let body;
	try { body = JSON.parse(text); } catch { body = null; }
	return { status: res.status, body };
}

async function lagerPost(env, path, payload) {
	const res = await fetch(BASE + path, {
		method: 'POST',
		headers: { 'X-APIKEY': env.LAGERSYSTEM_API_KEY, Accept: 'application/json', 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	});
	const text = await res.text();
	let body;
	try { body = JSON.parse(text); } catch { body = null; }
	return { status: res.status, body };
}

/**
 * Fetch one page of a status list. Returns { orders, page, maxPages, failed }.
 * Lagersystem signals "no orders in this status" as HTTP 200 with
 * { code: 204, error: true, ... } — treated as empty, not a failure. Anything
 * else unexpected sets `failed` so callers don't treat a glitch as "empty".
 */
async function fetchStatusPage(env, status, page) {
	const { status: http, body } = await lagerGet(env, `/api/order/list/status/${status}?page=${page}&pagesize=${PAGESIZE}`);
	if (body && body.error && Number(body.code) === 204) return { orders: [], page, maxPages: 0, failed: false };
	if (!body || body.error || http >= 400) return { orders: [], page, maxPages: 0, failed: true };
	const res = body.res || {};
	const data = Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : [];
	return { orders: data, page: res.page ?? page, maxPages: res.maxPages ?? 1, failed: false };
}

function toInt(v) {
	const n = Math.round(Number(v));
	return Number.isFinite(n) ? n : 0;
}

/** Shape a raw Lagersystem order into our row + its line rows. */
function mapOrder(o) {
	const ex = o.extra || {};
	const lines = (Array.isArray(o.lines) ? o.lines : []).map((l) => ({
		line_id: l.lineID != null ? String(l.lineID) : null,
		item_number: l.itemNumber || null,
		title: l.title || null,
		amount: toInt(l.amount),
		amount_delivered: toInt(l.amountDelivered),
	}));
	const unit_count = lines.reduce((s, l) => s + (l.amount_delivered || l.amount || 0), 0);
	return {
		order: {
			order_id: String(o.orderID),
			order_number: ex['order number'] != null ? toInt(ex['order number']) : null,
			sub_site: o.subSite != null ? toInt(o.subSite) : null,
			currency: o.currency || null,
			status: o.status || null,
			received_date: o.receivedDate || null,
			done_date: o.doneDate || null,
			delivery_date: o.deliveryDate || null,
			country: o.address?.country != null ? String(o.address.country) : null,
			customer_group_id: ex['customer group id'] != null ? toInt(ex['customer group id']) : null,
			customer_group_name: ex['customer group name'] || null,
			total_no_tax: Number(o.totalNoTax) || 0,
			line_count: lines.length,
			unit_count,
		},
		lines,
	};
}

const ORDER_COLS = [
	'order_id', 'order_number', 'sub_site', 'currency', 'status', 'received_date',
	'done_date', 'delivery_date', 'country', 'customer_group_id', 'customer_group_name',
	'total_no_tax', 'line_count', 'unit_count',
];

/** Upsert a batch of mapped orders (+ their lines) into D1. */
async function writeOrders(env, mapped) {
	const stmts = [];
	const upsertSql = `INSERT INTO wms_orders (${ORDER_COLS.join(', ')}, synced_at)
		VALUES (${ORDER_COLS.map(() => '?').join(', ')}, datetime('now'))
		ON CONFLICT(order_id) DO UPDATE SET
			${ORDER_COLS.slice(1).map((c) => `${c}=excluded.${c}`).join(', ')},
			synced_at=datetime('now')`;
	for (const { order, lines } of mapped) {
		stmts.push(env.DB.prepare(upsertSql).bind(...ORDER_COLS.map((c) => order[c] ?? null)));
		stmts.push(env.DB.prepare('DELETE FROM wms_order_lines WHERE order_id = ?').bind(order.order_id));
		for (const l of lines) {
			stmts.push(env.DB.prepare(
				'INSERT INTO wms_order_lines (order_id, line_id, item_number, title, amount, amount_delivered) VALUES (?, ?, ?, ?, ?, ?)'
			).bind(order.order_id, l.line_id, l.item_number, l.title, l.amount, l.amount_delivered));
		}
	}
	for (let i = 0; i < stmts.length; i += 50) {
		await env.DB.batch(stmts.slice(i, i + 50));
	}
}

/**
 * Process a bounded range of FINISHED pages (newest-first) into D1 and report
 * where to resume. Stops early once a page's oldest done_date drops below
 * `until`, or when the last page is reached.
 */
async function backfillPages(env, startPage, pages, until) {
	const first = await fetchStatusPage(env, 'FINISHED', startPage);
	const maxPages = first.maxPages || 1;
	const endPage = Math.min(maxPages, startPage + pages - 1);
	let seen = 0, oldest = null, reachedCutoff = false, lastPage = startPage;

	for (let page = startPage; page <= endPage; page++) {
		const p = page === startPage ? first : await fetchStatusPage(env, 'FINISHED', page);
		lastPage = page;
		if (!p.orders.length) break;
		const mapped = p.orders.map(mapOrder);
		await writeOrders(env, mapped);
		seen += mapped.length;
		const pageOldest = mapped.reduce((min, m) => {
			const d = m.order.done_date || '';
			return !min || (d && d < min) ? d : min;
		}, null);
		if (pageOldest && (!oldest || pageOldest < oldest)) oldest = pageOldest;
		if (pageOldest && pageOldest < until) { reachedCutoff = true; break; }
	}

	const done = reachedCutoff || lastPage >= maxPages;
	const out = { ok: true, from_page: startPage, to_page: lastPage, max_pages: maxPages, seen, oldest_done: oldest, until };
	if (!done) out.next = lastPage + 1;
	return out;
}

async function run(env, opts) {
	if (!env.LAGERSYSTEM_API_KEY) throw new Error('LAGERSYSTEM_API_KEY not set');
	const started = new Date().toISOString();
	let seen = 0;
	let newestDone = null;

	// --- FINISHED (handled history), incremental newest-first ---
	const meta = await env.DB.prepare('SELECT last_done_max FROM wms_sync_meta WHERE id = 1').first().catch(() => null);
	const backfillDays = opts.days || Number(env.BACKFILL_DAYS) || 540;
	let cutoff;
	if (opts.full || !meta?.last_done_max) {
		cutoff = daysAgoYmd(backfillDays);
	} else {
		cutoff = shiftYmd(meta.last_done_max, -OVERLAP_DAYS);
	}

	const first = await fetchStatusPage(env, 'FINISHED', 1);
	const maxPages = first.maxPages || 1;
	for (let page = 1; page <= maxPages; page++) {
		const p = page === 1 ? first : await fetchStatusPage(env, 'FINISHED', page);
		if (!p.orders.length) break;
		const mapped = p.orders.map(mapOrder);
		await writeOrders(env, mapped);
		seen += mapped.length;
		for (const m of mapped) {
			const d = m.order.done_date;
			if (d && (!newestDone || d > newestDone)) newestDone = d;
		}
		// Oldest order on this page (list is newest-first). Stop once we're past the cutoff.
		const oldest = mapped.reduce((min, m) => {
			const d = m.order.done_date || '';
			return !min || (d && d < min) ? d : min;
		}, null);
		if (oldest && oldest < cutoff) break;
	}

	// --- Active queues (inbound / in-progress), full each run ---
	// Note the DB clock first: every active order we see gets synced_at bumped,
	// so anything still open with an older synced_at has left the queues.
	const activeStart = (await env.DB.prepare("SELECT datetime('now') AS t").first()).t;
	let activeOk = true;
	for (const status of ACTIVE_STATUSES) {
		const head = await fetchStatusPage(env, status, 1);
		if (head.failed) { activeOk = false; continue; }
		const pages = head.maxPages || 1;
		for (let page = 1; page <= pages; page++) {
			const p = page === 1 ? head : await fetchStatusPage(env, status, page);
			if (p.failed) { activeOk = false; break; }
			if (!p.orders.length) break;
			const mapped = p.orders.map(mapOrder);
			await writeOrders(env, mapped);
			seen += mapped.length;
		}
	}

	// Orders that dropped out of the active queues: look up what happened
	// (handled vs cancelled/deleted). Skipped if any active fetch failed, so a
	// glitch can't mark live orders as gone.
	const vanished = activeOk ? await resolveVanished(env, activeStart) : { skipped: true };

	// Stock snapshot (slow & dead stock), refreshed when older than 3 h.
	let stock = null;
	try { stock = await syncStockIfStale(env, opts.stock === true); }
	catch (e) { stock = { error: e instanceof Error ? e.message : String(e) }; }

	const lastDoneMax = newestDone || meta?.last_done_max || null;
	await env.DB.prepare(
		`INSERT INTO wms_sync_meta (id, last_run, last_done_max, orders_seen, status, message)
		 VALUES (1, ?, ?, ?, 'ok', ?)
		 ON CONFLICT(id) DO UPDATE SET last_run=excluded.last_run, last_done_max=excluded.last_done_max,
		   orders_seen=excluded.orders_seen, status='ok', message=excluded.message`
	).bind(started, lastDoneMax, seen, `cutoff ${cutoff}`).run();

	return { seen, cutoff, last_done_max: lastDoneMax, vanished, stock };
}

/**
 * Open orders (no done/gone date) not seen in this run's active queues. Look
 * each up via POST /api/order/search and record the outcome: SENT/FINISHED →
 * done_date today (the FINISHED scan later overwrites with the real date);
 * cancelled/rejected/etc → gone_date; not found → deleted (gone). Bounded per
 * run; the rest are picked up next hour.
 */
async function resolveVanished(env, activeStart) {
	const rows = (await env.DB.prepare(
		`SELECT order_id FROM wms_orders
		 WHERE done_date IS NULL AND gone_date IS NULL AND synced_at < ? LIMIT 60`
	).bind(activeStart).all()).results ?? [];
	const today = new Date().toISOString().slice(0, 10);
	const out = { checked: rows.length, done: 0, gone: 0, still_active: 0, unknown: 0 };
	for (const { order_id } of rows) {
		const { body } = await lagerPost(env, '/api/order/search', { order_id: Number(order_id), page: 1, limit: 1 });
		const list = Array.isArray(body?.data) ? body.data : Array.isArray(body?.res?.data) ? body.res.data : null;
		const hit = list?.find((o) => String(o.id ?? o.orderID) === String(order_id)) ?? null;
		const st = hit?.status ? String(hit.status).toUpperCase() : null;
		if (st && ACTIVE_STATUSES.includes(st)) {
			await env.DB.prepare(`UPDATE wms_orders SET status = ?, synced_at = datetime('now') WHERE order_id = ?`).bind(st, order_id).run();
			out.still_active++;
		} else if (st === 'FINISHED' || st === 'SENT') {
			await env.DB.prepare(`UPDATE wms_orders SET status = ?, done_date = COALESCE(done_date, ?), synced_at = datetime('now') WHERE order_id = ?`).bind(st, today, order_id).run();
			out.done++;
		} else if (st) {
			await env.DB.prepare(`UPDATE wms_orders SET status = ?, gone_date = ?, synced_at = datetime('now') WHERE order_id = ?`).bind(st, today, order_id).run();
			out.gone++;
		} else if ((list && list.length === 0) || (body?.error && Number(body.code) === 204)) {
			await env.DB.prepare(`UPDATE wms_orders SET status = 'DELETED', gone_date = ?, synced_at = datetime('now') WHERE order_id = ?`).bind(today, order_id).run();
			out.gone++;
		} else {
			out.unknown++; // lookup failed — leave it for the next run
		}
	}
	return out;
}

/** Snapshot every product's stock (+ category, supplier, colli, min level) into wms_stock. */
async function syncStockIfStale(env, force) {
	if (!force) {
		const last = await env.DB.prepare(`SELECT MAX(updated_at) AS t FROM wms_stock`).first().catch(() => null);
		if (last?.t && Date.now() - Date.parse(last.t.replace(' ', 'T') + 'Z') < 3 * 3600 * 1000) return { skipped: 'fresh' };
	}
	const stockStart = (await env.DB.prepare("SELECT datetime('now') AS t").first()).t;

	// Stock + title + category: POST /api/products, zero-indexed pages of ≤1000.
	const items = new Map();
	for (let page = 0; page < 50; page++) {
		const { body } = await lagerPost(env, '/api/products', { pagesize: 1000, page });
		const rows = Array.isArray(body?.res) ? body.res : [];
		for (const r of rows) {
			if (!r.itemnumber) continue;
			items.set(String(r.itemnumber), { title: r.title || null, category: r.category || null, stock: toInt(r.stock), vendor: null, colli: null, min: null });
		}
		if (rows.length < 1000) break;
	}
	if (items.size < 50) return { error: `only ${items.size} products returned — snapshot not saved` };

	// Supplier / colli / min stock: GET /api/product/list (1-indexed, paged).
	for (let page = 1; page <= 100; page++) {
		const { body } = await lagerGet(env, `/api/product/list?page=${page}&pagesize=500`);
		const res = body?.res;
		const data = Array.isArray(res?.data) ? res.data : [];
		for (const r of data) {
			const e = items.get(String(r.itemNumber));
			if (!e) continue;
			e.vendor = r.vendor || null;
			e.colli = toInt(r.colliSize) || null;
			e.min = toInt(r.minStockLevel) || null;
		}
		if (!data.length || page >= Number(res?.maxPages ?? page)) break;
	}

	const sql = `INSERT INTO wms_stock (item_number, title, category, vendor, colli_size, min_stock_level, stock, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
		ON CONFLICT(item_number) DO UPDATE SET title=excluded.title, category=excluded.category, vendor=excluded.vendor,
		  colli_size=excluded.colli_size, min_stock_level=excluded.min_stock_level, stock=excluded.stock, updated_at=excluded.updated_at`;
	const stmts = [];
	for (const [sku, e] of items) stmts.push(env.DB.prepare(sql).bind(sku, e.title, e.category, e.vendor, e.colli, e.min, e.stock));
	for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
	// Drop SKUs that no longer exist in Lagersystem.
	await env.DB.prepare(`DELETE FROM wms_stock WHERE updated_at < ?`).bind(stockStart).run();
	return { products: items.size };
}

function json(obj, status = 200, compact = false) {
	return new Response(JSON.stringify(obj, null, compact ? 0 : 2), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}
