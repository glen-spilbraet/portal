import { error } from '@sveltejs/kit';
import { withPg } from '$lib/pg.js';

const PAGE_SIZE = 50;

const MARKETS = [
	{ key: 'da_DK', label: 'DKK' },
	{ key: 'sv_SE', label: 'SEK' },
	{ key: 'no_NO', label: 'NOK' },
	{ key: 'en_GB', label: 'EUR' },
];

export async function load({ url, platform }) {
	const market  = url.searchParams.get('market') ?? 'da_DK';
	const q       = url.searchParams.get('q') ?? '';
	const page    = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));
	const offset  = (page - 1) * PAGE_SIZE;

	if (!MARKETS.some(m => m.key === market)) error(400, 'Invalid market');

	const search = q.trim() ? `%${q.trim()}%` : '%';

	const [rows, countResult] = await withPg(platform, async (client) => {
		return Promise.all([
			client.query(
				`SELECT p.sku, pi.name, p.ean, pi.price::text AS price, p.stock
				 FROM product p
				 JOIN product_information pi ON pi.fk_product = p.id
				 WHERE pi.locale = $1
				   AND pi.published IS NOT NULL
				   AND (p.sku ILIKE $2 OR p.ean ILIKE $2 OR pi.name ILIKE $2)
				 ORDER BY p.sku ASC
				 LIMIT $3 OFFSET $4`,
				[market, search, PAGE_SIZE, offset]
			),
			client.query(
				`SELECT COUNT(*)::int AS count
				 FROM product p
				 JOIN product_information pi ON pi.fk_product = p.id
				 WHERE pi.locale = $1
				   AND pi.published IS NOT NULL
				   AND (p.sku ILIKE $2 OR p.ean ILIKE $2 OR pi.name ILIKE $2)`,
				[market, search]
			),
		]);
	});

	const total = countResult.rows[0]?.count ?? 0;

	return {
		products:   rows.rows,
		total,
		page,
		pageSize:   PAGE_SIZE,
		totalPages: Math.ceil(total / PAGE_SIZE),
		market,
		q,
		markets: MARKETS,
	};
}
