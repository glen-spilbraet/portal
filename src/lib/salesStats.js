/**
 * Sales Stats queries against the SALES_DB (sales_deals mirror).
 *
 * All amounts are `amount_dkk` (HubSpot's hs_projected_amount, already in DKK).
 * Deals are organised by `close_date` (YYYY-MM-DD).
 */

const MARKETS = ['Denmark', 'Sweden', 'Norway', 'International'];

/**
 * Revenue + deal count per market for a half-open date window [startIncl, endExcl).
 * Optionally scoped to a single company owner (null = all owners / admin view).
 *
 * @param {App.Platform['env']['SALES_DB']} db
 * @param {string} startIncl  YYYY-MM-DD (inclusive)
 * @param {string} endExcl    YYYY-MM-DD (exclusive)
 * @param {string|null} ownerEmail
 */
export async function getMarketTotals(db, startIncl, endExcl, ownerEmail = null) {
	const where = ['close_date >= ?', 'close_date < ?'];
	const binds = [startIncl, endExcl];
	if (ownerEmail) {
		where.push('owner_email = ?');
		binds.push(ownerEmail);
	}
	const rows = await db
		.prepare(
			`SELECT market, COUNT(*) AS deals, COALESCE(SUM(amount_dkk), 0) AS dkk
			 FROM sales_deals
			 WHERE ${where.join(' AND ')}
			 GROUP BY market`
		)
		.bind(...binds)
		.all();

	// Seed every market to zero so missing rows still render.
	const byMarket = {};
	for (const m of MARKETS) byMarket[m] = { dkk: 0, deals: 0 };
	let total = { dkk: 0, deals: 0 };
	for (const r of rows.results ?? []) {
		const m = MARKETS.includes(r.market) ? r.market : 'International';
		byMarket[m].dkk += r.dkk;
		byMarket[m].deals += r.deals;
		total.dkk += r.dkk;
		total.deals += r.deals;
	}
	return { total, byMarket };
}

/** Latest sync metadata (for a "data as of …" line). */
export async function getSyncMeta(db) {
	return db.prepare('SELECT last_run, status, deal_count FROM sales_sync_meta WHERE id = 1').first();
}

export { MARKETS };
