/**
 * Forecast Stats queries (SALES_DB / portal-db).
 *
 * Forecast deals live in `forecast_deals` (isolated from sales_deals) and their
 * line items in `deal_line_items` where deal_kind = 'forecast'. Accuracy is
 * measured at SKU level in units: for each forecast line with a forecasted
 * quantity > 0, we compare it against the actual units of that same SKU bought
 * by the customer (closed line items) inside the forecast window.
 *
 * Forecasts without a start+end date are skipped — nothing can be measured.
 * The forecast quantity is read from quantity_log_start (value frozen on the
 * forecast start date), falling back to quantity_log_create then live quantity.
 */

const FC_QTY = 'COALESCE(li.quantity_log_start, li.quantity_log_create, li.quantity)';

/** Distinct forecast owners for the filter dropdown. */
export async function getForecastOwners(db) {
	const rows = await db
		.prepare(
			`SELECT owner_email AS email, MAX(owner_name) AS name
			 FROM forecast_deals WHERE owner_email IS NOT NULL AND owner_email != ''
			 GROUP BY owner_email ORDER BY name`
		)
		.all();
	return rows.results ?? [];
}

/** Distinct forecast-window years (by start date), newest first. */
export async function getForecastYears(db) {
	const rows = await db
		.prepare(
			`SELECT DISTINCT substr(forecast_start_date, 1, 4) AS y
			 FROM forecast_deals WHERE forecast_start_date IS NOT NULL AND forecast_start_date != ''
			 ORDER BY y DESC`
		)
		.all();
	return (rows.results ?? []).map((r) => r.y).filter(Boolean);
}

/** Build the optional owner + year filter clause (by forecast start-date year). */
function filterClause(ownerEmail, years) {
	const parts = [];
	const binds = [];
	if (ownerEmail) { parts.push('AND f.owner_email = ?'); binds.push(ownerEmail); }
	if (years?.length) { parts.push(`AND substr(f.forecast_start_date, 1, 4) IN (${years.map(() => '?').join(',')})`); binds.push(...years); }
	return { clause: parts.join(' '), binds };
}

/** Count of forecasts we skip because they have no start/end window. */
export async function getSkippedCount(db, ownerEmail) {
	const clause = ownerEmail ? 'AND owner_email = ?' : '';
	const binds = ownerEmail ? [ownerEmail] : [];
	const row = await db
		.prepare(
			`SELECT COUNT(*) AS n FROM forecast_deals
			 WHERE (forecast_start_date IS NULL OR forecast_end_date IS NULL) ${clause}`
		)
		.bind(...binds)
		.first();
	return row?.n ?? 0;
}

/**
 * Ended forecasts. Each forecast line's actual is the units of that SKU the
 * customer bought within that forecast's window. Returned rolled up three ways
 * (customers / owners / products), each with expandable drill-down children.
 */
export async function getCompletedAccuracy(db, today, ownerEmail, years) {
	const f = filterClause(ownerEmail, years);
	const rows = (await db
		.prepare(
			`SELECT f.company_id AS cid, f.company_name AS company,
			        f.owner_name AS owner, f.owner_email AS owner_email,
			        li.sku, li.name,
			        ${FC_QTY} AS forecast_qty,
			        (SELECT COALESCE(SUM(c.quantity), 0) FROM deal_line_items c
			           WHERE c.deal_kind = 'closed' AND c.company_id = f.company_id AND c.sku = li.sku
			             AND c.close_date >= f.forecast_start_date AND c.close_date <= f.forecast_end_date) AS actual_qty
			 FROM forecast_deals f
			 JOIN deal_line_items li ON li.deal_id = f.deal_id AND li.deal_kind = 'forecast'
			 WHERE f.forecast_start_date IS NOT NULL AND f.forecast_end_date IS NOT NULL
			   AND f.forecast_end_date < ?
			   AND ${FC_QTY} > 0
			   ${f.clause}`
		)
		.bind(today, ...f.binds)
		.all()).results ?? [];

	return {
		customers: rollup(rows,
			(r) => r.cid ?? r.company, (r) => r.company || '(No company)',
			(r) => ({ owner: r.owner || '—' }),
			(r) => r.sku, (r) => r.name || r.sku),
		owners: rollup(rows,
			(r) => r.owner_email ?? r.owner, (r) => r.owner || '—',
			() => ({}),
			(r) => r.cid ?? r.company, (r) => r.company || '(No company)'),
		products: rollup(rows,
			(r) => r.sku, (r) => r.name || r.sku,
			(r) => ({ sku: r.sku }),
			(r) => r.cid ?? r.company, (r) => r.company || '(No company)')
	};
}

/**
 * Group forecast lines by a dimension, summing forecast/actual units, and build
 * per-child sub-rows (also summed) for the drill-down.
 */
function rollup(rows, keyOf, labelOf, metaOf, childKeyOf, childLabelOf) {
	const map = new Map();
	for (const r of rows) {
		const k = keyOf(r);
		let g = map.get(k);
		if (!g) { g = { key: k, label: labelOf(r), forecastUnits: 0, actualUnits: 0, _kids: new Map(), ...metaOf(r) }; map.set(k, g); }
		g.forecastUnits += r.forecast_qty || 0;
		g.actualUnits += r.actual_qty || 0;
		const ck = childKeyOf(r);
		let c = g._kids.get(ck);
		if (!c) { c = { key: ck, label: childLabelOf(r), forecast: 0, actual: 0 }; g._kids.set(ck, c); }
		c.forecast += r.forecast_qty || 0;
		c.actual += r.actual_qty || 0;
	}
	return [...map.values()].map((g) => {
		g.attainment = g.forecastUnits > 0 ? g.actualUnits / g.forecastUnits : null;
		g.bias = biasTag(g.attainment);
		g.children = [...g._kids.values()]
			.map((c) => ({ ...c, attainment: c.forecast > 0 ? c.actual / c.forecast : null }))
			.sort((a, b) => b.forecast - a.forecast);
		g.childCount = g.children.length;
		delete g._kids;
		return g;
	}).sort((a, b) => b.forecastUnits - a.forecastUnits);
}

/**
 * Ongoing forecasts (today inside the window), rolled up per customer. Actual is
 * units bought so far (window start → today).
 */
export async function getOngoingProgress(db, today, ownerEmail, years) {
	const f = filterClause(ownerEmail, years);
	const rows = await db
		.prepare(
			`SELECT f.company_id AS cid, f.company_name AS company,
			        f.owner_name AS owner, f.owner_email AS owner_email,
			        f.forecast_start_date AS start, f.forecast_end_date AS end,
			        li.sku, li.name,
			        ${FC_QTY} AS forecast_qty,
			        (SELECT COALESCE(SUM(c.quantity), 0) FROM deal_line_items c
			           WHERE c.deal_kind = 'closed' AND c.company_id = f.company_id AND c.sku = li.sku
			             AND c.close_date >= f.forecast_start_date AND c.close_date <= ?) AS actual_qty
			 FROM forecast_deals f
			 JOIN deal_line_items li ON li.deal_id = f.deal_id AND li.deal_kind = 'forecast'
			 WHERE f.forecast_start_date IS NOT NULL AND f.forecast_end_date IS NOT NULL
			   AND f.forecast_start_date <= ? AND f.forecast_end_date >= ?
			   AND ${FC_QTY} > 0
			   ${f.clause}`
		)
		.bind(today, today, today, ...f.binds)
		.all();
	const custs = aggregateByCustomer(rows.results ?? [], true);
	// Attach time-elapsed pace for the ongoing view.
	const t = Date.parse(today + 'T00:00:00Z');
	for (const c of custs) {
		const s = Date.parse(c.start + 'T00:00:00Z');
		const e = Date.parse(c.end + 'T00:00:00Z');
		c.timeElapsed = e > s ? Math.min(1, Math.max(0, (t - s) / (e - s))) : 1;
		c.onTrack = c.attainment >= c.timeElapsed;
	}
	return custs;
}

/** Roll SKU-level rows up per customer, keeping per-SKU detail for drill-down. */
function aggregateByCustomer(rows, keepWindow = false) {
	const map = new Map();
	for (const r of rows) {
		const key = r.cid ?? r.company;
		let c = map.get(key);
		if (!c) {
			c = {
				cid: r.cid, company: r.company || '(No company)', owner: r.owner || '—', ownerEmail: r.owner_email,
				forecastUnits: 0, actualUnits: 0, skus: []
			};
			if (keepWindow) { c.start = r.start; c.end = r.end; }
			map.set(key, c);
		}
		const fq = r.forecast_qty || 0;
		const aq = r.actual_qty || 0;
		c.forecastUnits += fq;
		c.actualUnits += aq;
		c.skus.push({ sku: r.sku, name: r.name || r.sku, forecast: fq, actual: aq });
	}
	const out = [...map.values()].map((c) => {
		c.attainment = c.forecastUnits > 0 ? c.actualUnits / c.forecastUnits : null;
		c.skus.sort((a, b) => b.forecast - a.forecast);
		c.bias = biasTag(c.attainment);
		return c;
	});
	out.sort((a, b) => (b.forecastUnits) - (a.forecastUnits));
	return out;
}

/** Classify forecast bias from attainment (actual ÷ forecast, in units). */
function biasTag(att) {
	if (att === null) return 'none';
	if (att > 1.3) return 'low';   // bought much more than forecast → forecasts too low
	if (att < 0.7) return 'high';  // bought much less than forecast → forecasts too high
	return 'ok';
}

// --- Half-year breakdown ---------------------------------------------------

function halfKey(dateStr) {
	const y = dateStr.slice(0, 4);
	const m = Number(dateStr.slice(5, 7));
	return `${y}-H${m <= 6 ? 1 : 2}`;
}
function halfBounds(key) {
	const [yStr, hStr] = key.split('-H');
	const y = Number(yStr);
	return hStr === '1'
		? { start: `${y}-01-01`, endExcl: `${y}-07-01` }
		: { start: `${y}-07-01`, endExcl: `${y + 1}-01-01` };
}
function halfLabel(key) {
	const [y, h] = key.split('-H');
	return (h === '1' ? '1st half ' : '2nd half ') + y;
}
function addDaysStr(dateStr, n) {
	const d = new Date(dateStr + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}
function daysBetween(aStr, bStr) {
	return Math.round((Date.parse(bStr + 'T00:00:00Z') - Date.parse(aStr + 'T00:00:00Z')) / 86400000);
}
function halvesInRange(startStr, endStr) {
	const keys = [];
	let k = halfKey(startStr);
	const rangeEndExcl = addDaysStr(endStr, 1);
	while (true) {
		keys.push(k);
		const { endExcl } = halfBounds(k);
		if (endExcl >= rangeEndExcl) break;
		k = halfKey(endExcl);
	}
	return keys;
}

/**
 * Split a forecast quantity across the half-year periods its [start, end]
 * window overlaps, proportionally by day count (a deal spanning two halves
 * contributes to both, weighted by how many of its days fall in each).
 */
function allocateForecast(qty, startStr, endStr) {
	const rangeEndExcl = addDaysStr(endStr, 1);
	const totalDays = daysBetween(startStr, rangeEndExcl);
	if (totalDays <= 0) return {};
	const out = {};
	for (const k of halvesInRange(startStr, endStr)) {
		const { start, endExcl } = halfBounds(k);
		const ovStart = start > startStr ? start : startStr;
		const ovEndExcl = endExcl < rangeEndExcl ? endExcl : rangeEndExcl;
		const days = daysBetween(ovStart, ovEndExcl);
		if (days > 0) out[k] = qty * (days / totalDays);
	}
	return out;
}

/**
 * Completed forecasts, rolled up by half-year period (SKU-level units, same
 * population as `getCompletedAccuracy`). A forecast's quantity is divided
 * across the halves its window spans by day overlap; actual units are
 * attributed to the half each matching closed purchase's own close_date falls
 * in (both windows already scoped to the forecast's start/end, as elsewhere).
 * Only periods with any forecast quantity are returned, oldest first.
 */
export async function getCompletedHalfYearBreakdown(db, today, ownerEmail, years) {
	const f = filterClause(ownerEmail, years);
	const lines = (await db
		.prepare(
			`SELECT f.company_id AS cid, li.sku,
			        f.forecast_start_date AS fstart, f.forecast_end_date AS fend,
			        ${FC_QTY} AS forecast_qty
			 FROM forecast_deals f
			 JOIN deal_line_items li ON li.deal_id = f.deal_id AND li.deal_kind = 'forecast'
			 WHERE f.forecast_start_date IS NOT NULL AND f.forecast_end_date IS NOT NULL
			   AND f.forecast_end_date < ?
			   AND ${FC_QTY} > 0
			   ${f.clause}`
		)
		.bind(today, ...f.binds)
		.all()).results ?? [];

	if (!lines.length) return [];

	const cids = [...new Set(lines.map((r) => r.cid).filter(Boolean))];
	const minStart = lines.reduce((m, r) => (r.fstart < m ? r.fstart : m), lines[0].fstart);
	const maxEnd = lines.reduce((m, r) => (r.fend > m ? r.fend : m), lines[0].fend);

	const closed = cids.length
		? (await db
				.prepare(
					`SELECT company_id AS cid, sku, close_date, quantity
					 FROM deal_line_items
					 WHERE deal_kind = 'closed' AND company_id IN (${cids.map(() => '?').join(',')})
					   AND close_date >= ? AND close_date <= ?`
				)
				.bind(...cids, minStart, maxEnd)
				.all()).results ?? []
		: [];

	const closedByKey = new Map();
	for (const r of closed) {
		const key = r.cid + ' ' + r.sku;
		let arr = closedByKey.get(key);
		if (!arr) { arr = []; closedByKey.set(key, arr); }
		arr.push(r);
	}

	const periods = new Map(); // key -> { forecast, actual }
	function bucket(key) {
		let p = periods.get(key);
		if (!p) { p = { forecast: 0, actual: 0 }; periods.set(key, p); }
		return p;
	}
	for (const line of lines) {
		const split = allocateForecast(line.forecast_qty, line.fstart, line.fend);
		for (const [k, v] of Object.entries(split)) bucket(k).forecast += v;

		const matches = closedByKey.get(line.cid + ' ' + line.sku) ?? [];
		for (const c of matches) {
			if (c.close_date < line.fstart || c.close_date > line.fend) continue;
			bucket(halfKey(c.close_date)).actual += c.quantity || 0;
		}
	}

	return [...periods.entries()]
		.filter(([, v]) => v.forecast > 0)
		.map(([key, v]) => {
			const attainment = v.actual / v.forecast;
			return { key, label: halfLabel(key), forecastUnits: v.forecast, actualUnits: v.actual, attainment, bias: biasTag(attainment) };
		})
		.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
