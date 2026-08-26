import { error } from '@sveltejs/kit';
import { getCatalogueByShareToken, getCatalogueItemsWithTranslations, getGlobalLabels } from '$lib/db.js';
import { fetchSalesPrices } from '$lib/server/rackbeat.js';
import { getBadgesForSkus } from '$lib/server/awards.js';

const LANG_CURRENCY = { da: 'DKK', sv: 'SEK', no: 'NOK', en: 'EUR' };

function itemSku(i) {
	try { return JSON.parse(i.data_fields || '[]').find(f => f.key === 'sku')?.value || null; }
	catch { return null; }
}

export async function load({ params, platform }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');

	const catalogue = await getCatalogueByShareToken(db, params.token);
	if (!catalogue) error(404, 'Link not found or has been revoked');

	const [items, globalLabels] = await Promise.all([
		getCatalogueItemsWithTranslations(db, catalogue.id, catalogue.language),
		getGlobalLabels(db)
	]);

	const skus = [...new Set(
		items.filter(i => !i.type || i.type === 'sheet').map(itemSku).filter(Boolean)
	)];

	// Award / press badges per SKU (overlaid on each product box).
	const badgesBySku = await getBadgesForSkus(db, skus, new Date().toISOString().slice(0, 10));

	// Fetch list prices for all SKUs if the setting is enabled
	let itemPrices = null;
	if (catalogue.show_list_price) {
		const apiKey   = platform?.env?.RACKBEAT_API_KEY;
		const currency = LANG_CURRENCY[catalogue.language ?? 'en'] ?? 'EUR';
		const results = await Promise.all(
			skus.map(async sku => ({ sku, price: (await fetchSalesPrices(sku, apiKey))?.[currency] ?? null }))
		);
		itemPrices = Object.fromEntries(results.filter(r => r.price > 0).map(r => [r.sku, r.price]));
	}

	return {
		catalogue,
		items,
		globalLabels,
		itemPrices,
		badgesBySku,
		token: params.token,
		trackingId: params.trackingId ?? null,
	};
}
