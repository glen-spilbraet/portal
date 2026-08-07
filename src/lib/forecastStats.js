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
 * Ended forecasts, rolled up per customer. Each forecast line's actual is the
 * units of that SKU the customer bought within that forecast's window.
 */
export async function getCompletedAccuracy(db, today, ownerEmail) {
	const ownerClause = ownerEmail ? 'AND f.owner_email = ?' : '';
	const binds = ownerEmail ? [today, ownerEmail] : [today];
	const rows = await db
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
			   ${ownerClause}`
		)
		.bind(...binds)
		.all();
	return aggregateByCustomer(rows.results ?? []);
}

/**
 * Ongoing forecasts (today inside the window), rolled up per customer. Actual is
 * units bought so far (window start → today).
 */
export async function getOngoingProgress(db, today, ownerEmail) {
	const ownerClause = ownerEmail ? 'AND f.owner_email = ?' : '';
	const binds = ownerEmail ? [today, today, today, ownerEmail] : [today, today, today];
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
			   ${ownerClause}`
		)
		.bind(...binds)
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
