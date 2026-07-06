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
	const market = url.searchParams.get('market') ?? 'da_DK';
	const q      = url.searchParams.get('q') ?? '';
	const page   = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));
	const offset = (page - 1) * PAGE_SIZE;

	if (!MARKETS.some(m => m.key === market)) error(400, 'Invalid market');

	const search = q.trim() ? `%${q.trim()}%` : '%';

	let result;
	try {
		result = await withPg(platform, async (sql) => {
			const [rows, countRows] = await Promise.all([
				sql`
					SELECT p.sku, pi.name, p.ean, pi.price::text AS price, p.stock
					FROM product p
					JOIN product_information pi ON pi.fk_product = p.id
					WHERE pi.locale    = ${market}
					  AND pi.published IS NOT NULL
					  AND (p.sku ILIKE ${search} OR p.ean ILIKE ${search} OR pi.name ILIKE ${search})
					ORDER BY p.sku ASC
					LIMIT  ${PAGE_SIZE}
					OFFSET ${offset}
				`,
				sql`
					SELECT COUNT(*)::int AS count
					FROM product p
					JOIN product_information pi ON pi.fk_product = p.id
					WHERE pi.locale    = ${market}
					  AND pi.published IS NOT NULL
					  AND (p.sku ILIKE ${search} OR p.ean ILIKE ${search} OR pi.name ILIKE ${search})
				`,
			]);
			return { rows, total: countRows[0]?.count ?? 0 };
		});
	} catch (e) {
		error(500, `DB error: ${e?.message ?? String(e)}`);
	}

	return {
		products:   result.rows,
		total:      result.total,
		page,
		pageSize:   PAGE_SIZE,
		totalPages: Math.ceil(result.total / PAGE_SIZE),
		market,
		q,
		markets: MARKETS,
	};
}
