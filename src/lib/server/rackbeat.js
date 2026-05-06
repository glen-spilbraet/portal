const RACKBEAT_BASE = 'https://app.rackbeat.com/api';

/**
 * Fetch all currency sales prices for a SKU from Rackbeat.
 * Returns a map of { DKK: number, SEK: number, ... } or null on failure.
 * @param {string} sku
 * @param {string | undefined} apiKey
 * @returns {Promise<Record<string, number> | null>}
 */
export async function fetchSalesPrices(sku, apiKey) {
	if (!apiKey || !sku) return null;
	try {
		const res = await fetch(
			`${RACKBEAT_BASE}/products/${encodeURIComponent(sku)}/prices`,
			{ headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } }
		);
		if (!res.ok) return null;
		const data = await res.json();
		const prices = {};
		for (const entry of data?.currency_prices ?? []) {
			if (entry.currency && entry.sales_price != null) {
				prices[entry.currency] = entry.sales_price;
			}
		}
		return Object.keys(prices).length ? prices : null;
	} catch {
		return null;
	}
}
