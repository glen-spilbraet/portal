/**
 * Q4 Orders — colli assessment of Rackbeat draft orders.
 *
 * Reads every open draft (an order with is_booked = false) from Rackbeat, pulls
 * its line items and the colli (carton) size of each product, and works out two
 * things per line:
 *
 *   1. COLLI DISCOUNT — a line whose quantity is an exact multiple of the
 *      product's colli ("full colli") qualifies for a 7 % discount, UNLESS the
 *      line already has a higher discount (then it is left alone).
 *   2. NOT IN COLLI — a line whose quantity is not a full colli is offered a
 *      choice: round the quantity UP to the next colli, or DOWN to the previous
 *      colli ("remove" when rounding down reaches 0). Once rounded to a full
 *      colli it also becomes eligible for the colli discount.
 *
 * Nothing is written to Rackbeat here except by applyChanges(), which only runs
 * when the user explicitly transfers their chosen adjustments.
 */

const RACKBEAT_BASE = 'https://app.rackbeat.com/api';

export const COLLI_DISCOUNT = 7; // percent

const RB_MAX_RETRIES = 6;
const RB_BASE_DELAY_MS = 500;
const RB_MAX_DELAY_MS = 5000;
const PAGE_LIMIT = 100;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch from Rackbeat with retry/backoff on 429 + 5xx (mirrors the pattern in
 * $lib/rackbeat.js so a transient throttle never looks like a hard failure).
 * @param {string} apiKey
 * @param {string} path  e.g. '/orders?is_booked=false'
 * @param {string} [method]
 * @param {object} [body]
 */
async function rbFetch(apiKey, path, method = 'GET', body) {
	const headers = {
		Authorization: `Bearer ${apiKey}`,
		Accept: 'application/json',
		...(body ? { 'Content-Type': 'application/json' } : {})
	};
	const init = { method, headers, body: body ? JSON.stringify(body) : undefined };
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(`${RACKBEAT_BASE}${path}`, init);
		const transient = res.status === 429 || res.status >= 500;
		if (!transient || attempt === RB_MAX_RETRIES) return res;
		const retryAfter = Number(res.headers.get('Retry-After'));
		const delay = Number.isFinite(retryAfter) && retryAfter > 0
			? Math.min(retryAfter * 1000, RB_MAX_DELAY_MS)
			: Math.min(RB_BASE_DELAY_MS * 2 ** attempt, RB_MAX_DELAY_MS);
		await sleep(delay + Math.random() * 200);
	}
}

/**
 * Fetch every open draft order (is_booked = false, not archived), following
 * pagination. Page 1 reveals the page count; the rest are fetched in parallel.
 * @param {string} apiKey
 * @returns {Promise<any[]>}
 */
async function fetchDrafts(apiKey) {
	const page1 = await rbFetch(apiKey, `/orders?is_booked=false&is_archived=false&limit=${PAGE_LIMIT}&page=1`);
	if (!page1.ok && page1.status !== 206) {
		let detail = '';
		try { detail = (await page1.text()).slice(0, 200); } catch { /* ignore */ }
		throw new Error(`Rackbeat draft list failed (${page1.status}) ${detail}`);
	}
	const body = await page1.json();
	const first = Array.isArray(body) ? body : (body.orders ?? body.data ?? []);
	const totalPages = Number(body.pages) || 1;

	const rest = [];
	for (let p = 2; p <= totalPages; p++) rest.push(p);
	const extra = await Promise.all(rest.map(async (p) => {
		const res = await rbFetch(apiKey, `/orders?is_booked=false&is_archived=false&limit=${PAGE_LIMIT}&page=${p}`);
		if (!res.ok && res.status !== 206) return [];
		const b = await res.json();
		return Array.isArray(b) ? b : (b.orders ?? b.data ?? []);
	}));

	const seen = new Set();
	const out = [];
	for (const o of [first, ...extra].flat()) {
		const key = o.number ?? JSON.stringify(o);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(o);
	}
	return out;
}

/**
 * Fetch the line items of a single order. The deprecated inline `lines` on the
 * list endpoint is no longer returned, so each draft's lines come from the
 * dedicated endpoint.
 * @param {string} apiKey
 * @param {string|number} number
 * @returns {Promise<any[]>}
 */
async function fetchOrderLines(apiKey, number) {
	const res = await rbFetch(apiKey, `/orders/${encodeURIComponent(String(number))}/lines`);
	if (!res.ok && res.status !== 206) return [];
	const b = await res.json();
	return Array.isArray(b) ? b : (b.lines ?? b.data ?? []);
}

/** Pull the SKU / item number off a line, however Rackbeat shaped it. */
function lineSku(line) {
	return String(line?.item?.number ?? line?.item_number ?? line?.item_id ?? '').trim();
}

/**
 * Fetch colli (carton) size + name for a set of SKUs. Deduped; one request per
 * distinct SKU, in parallel. Returns a map keyed by SKU.
 * @param {string} apiKey
 * @param {string[]} skus
 * @returns {Promise<Map<string, {colli: number|null, name: string}>>}
 */
async function fetchColliMap(apiKey, skus) {
	const unique = [...new Set(skus.filter(Boolean))];
	const map = new Map();
	const CHUNK = 20; // keep concurrency reasonable against Rackbeat
	for (let i = 0; i < unique.length; i += CHUNK) {
		const batch = unique.slice(i, i + CHUNK);
		await Promise.all(batch.map(async (sku) => {
			try {
				const res = await rbFetch(apiKey, `/products/${encodeURIComponent(sku)}`);
				if (!res.ok) { map.set(sku, { colli: null, name: '' }); return; }
				const data = await res.json();
				const item = data.product ?? data.item ?? data;
				const raw = item.colli ?? item.colli_size ?? item.min_sales ?? null;
				const colli = Number(raw);
				map.set(sku, {
					colli: Number.isFinite(colli) && colli > 0 ? colli : null,
					name: item.name ?? ''
				});
			} catch {
				map.set(sku, { colli: null, name: '' });
			}
		}));
	}
	return map;
}

/**
 * Classify one line against its colli size.
 * @param {number} qty
 * @param {number|null} colli
 * @param {number} discount  existing discount %
 * @returns {{status: string, colli: number|null, down: number, up: number, targetDiscount: number}}
 */
export function assessLine(qty, colli, discount) {
	const existing = Number.isFinite(discount) ? discount : 0;

	// No usable colli: can't assess. Colli of 1 is meaningless for "full colli".
	if (!colli || colli <= 1) {
		return { status: 'no_colli', colli: colli ?? null, down: qty, up: qty, targetDiscount: existing };
	}

	const inColli = qty > 0 && qty % colli === 0;
	if (inColli) {
		// Full colli → 7 %, unless it already has a higher discount.
		if (existing >= COLLI_DISCOUNT) {
			return { status: 'ok_discounted', colli, down: qty, up: qty, targetDiscount: existing };
		}
		return { status: 'colli_discount', colli, down: qty, up: qty, targetDiscount: COLLI_DISCOUNT };
	}

	// Not in colli → offer round up / round down.
	const down = Math.floor(qty / colli) * colli;
	const up = Math.ceil(qty / colli) * colli;
	return { status: 'not_colli', colli, down, up, targetDiscount: Math.max(existing, COLLI_DISCOUNT) };
}

/**
 * Build the full assessment for every open draft.
 * @param {string} apiKey
 * @returns {Promise<{drafts: any[], generatedAt: string}>}
 */
export async function buildAssessment(apiKey) {
	const drafts = await fetchDrafts(apiKey);

	// Fetch all drafts' lines in parallel.
	const linesByNumber = new Map();
	const CHUNK = 20;
	for (let i = 0; i < drafts.length; i += CHUNK) {
		const batch = drafts.slice(i, i + CHUNK);
		await Promise.all(batch.map(async (d) => {
			linesByNumber.set(d.number, await fetchOrderLines(apiKey, d.number));
		}));
	}

	// Collect every SKU across every draft, then fetch colli once per SKU.
	const allSkus = [];
	for (const lines of linesByNumber.values()) for (const l of lines) allSkus.push(lineSku(l));
	const colliMap = await fetchColliMap(apiKey, allSkus);

	const out = [];
	for (const d of drafts) {
		const rawLines = linesByNumber.get(d.number) ?? [];
		const lines = [];
		for (const l of rawLines) {
			const sku = lineSku(l);
			if (!sku) continue; // skip text / non-product lines
			const qty = Number(l.quantity) || 0;
			const discount = Number(l.discount_percentage) || 0;
			const info = colliMap.get(sku) ?? { colli: null, name: '' };
			const a = assessLine(qty, info.colli, discount);
			lines.push({
				lineId: l.id ?? null,
				sku,
				name: info.name || l.item?.name || l.name || sku,
				quantity: qty,
				linePrice: l.line_price ?? null,
				discount,
				colli: info.colli,
				status: a.status,
				down: a.down,
				up: a.up,
				targetDiscount: a.targetDiscount
			});
		}
		// Only show drafts that actually have product lines.
		if (!lines.length) continue;
		out.push({
			number: d.number,
			customerName: d.customer?.name ?? d.customer_name ?? '',
			customerNumber: d.customer?.number ?? d.customer_id ?? null,
			currency: d.currency ?? '',
			heading: d.heading ?? '',
			orderDate: d.order_date ?? d.created_at ?? null,
			lines
		});
	}

	// Drafts with actionable lines first, then by number.
	const actionable = (dr) => dr.lines.some((l) => l.status === 'colli_discount' || l.status === 'not_colli');
	out.sort((a, b) => (actionable(b) ? 1 : 0) - (actionable(a) ? 1 : 0) || Number(b.number) - Number(a.number));

	return { drafts: out, generatedAt: new Date().toISOString() };
}

/**
 * Apply chosen adjustments to drafts. For each draft we re-read its CURRENT
 * lines, apply the per-line deltas (matched by Rackbeat line id), then PUT the
 * complete line set back — preserving every untouched line's price and name so
 * a full-replacement update never silently resets anything.
 *
 * @param {string} apiKey
 * @param {Array<{number: string|number, lines: Array<{lineId: number, quantity?: number, discount_percentage?: number, remove?: boolean}>}>} changes
 * @returns {Promise<Array<{number: string|number, status: 'updated'|'failed'|'skipped', changed: number, error?: string}>>}
 */
export async function applyChanges(apiKey, changes) {
	const results = [];
	for (const change of changes) {
		const { number } = change;
		const deltas = new Map();
		for (const d of change.lines ?? []) {
			if (d.lineId != null) deltas.set(Number(d.lineId), d);
		}
		if (!deltas.size) { results.push({ number, status: 'skipped', changed: 0 }); continue; }

		try {
			const current = await fetchOrderLines(apiKey, number);
			const rbLines = [];
			let changed = 0;
			for (const l of current) {
				const sku = lineSku(l);
				const delta = l.id != null ? deltas.get(Number(l.id)) : undefined;

				if (delta?.remove) { changed++; continue; } // drop this line

				// Non-product lines (no SKU): preserve verbatim where possible.
				const base = {
					quantity: Number(l.quantity) || 0,
					discount_percentage: Number(l.discount_percentage) || 0
				};
				if (sku) base.item_id = sku;
				if (l.line_price != null) base.line_price = l.line_price;
				const nm = l.name ?? l.item?.name;
				if (nm) base.name = nm;

				if (delta) {
					if (delta.quantity != null) base.quantity = Number(delta.quantity);
					if (delta.discount_percentage != null) base.discount_percentage = Number(delta.discount_percentage);
					changed++;
				}
				rbLines.push(base);
			}

			if (!changed) { results.push({ number, status: 'skipped', changed: 0 }); continue; }

			const res = await rbFetch(apiKey, `/orders/${encodeURIComponent(String(number))}`, 'PUT', { lines: rbLines });
			if (!res.ok) {
				let detail = '';
				try { detail = (await res.text()).slice(0, 300); } catch { /* ignore */ }
				results.push({ number, status: 'failed', changed: 0, error: `Rackbeat ${res.status}: ${detail}` });
				continue;
			}
			results.push({ number, status: 'updated', changed });
		} catch (err) {
			results.push({ number, status: 'failed', changed: 0, error: err instanceof Error ? err.message : String(err) });
		}
	}
	return results;
}
