import { error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser, getUserPermissions } from '$lib/db.js';
import { withPg } from '$lib/pg.js';

const MARKETS = {
	da_DK: 'DKK',
	sv_SE: 'SEK',
	no_NO: 'NOK',
	en_GB: 'EUR',
};

export async function GET({ url, cookies, platform }) {
	const token  = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	const email  = await verifySession(token ?? '', secret);
	if (!email) error(401, 'Unauthorized');

	const db   = platform?.env?.DB;
	const user = db ? await getAllowedUser(db, email) : null;
	if (!user) error(401, 'Unauthorized');

	const perms = db ? await getUserPermissions(db, user) : { price_lists: true };
	if (!perms.price_lists) error(403, 'No access to price lists');

	const market = url.searchParams.get('market') ?? 'da_DK';
	const q      = url.searchParams.get('q') ?? '';

	if (!MARKETS[market]) error(400, 'Invalid market');

	const search = q.trim() ? `%${q.trim()}%` : '%';
	const currency = MARKETS[market];

	const rows = await withPg(platform, (sql) =>
		sql`
			SELECT p.sku, pi.name, p.ean, pi.price::text AS price, p.stock
			FROM product p
			JOIN product_information pi ON pi.fk_product = p.id
			WHERE pi.locale    = ${market}
			  AND pi.published IS NOT NULL
			  AND (p.sku ILIKE ${search} OR p.ean ILIKE ${search} OR pi.name ILIKE ${search})
			ORDER BY p.sku ASC
		`
	);

	const lines = [
		['SKU', 'Name', 'EAN', `Price (${currency})`, 'Stock'].join(','),
		...rows.map(r => [
			csvCell(r.sku),
			csvCell(r.name),
			csvCell(r.ean),
			csvCell(r.price),
			csvCell(String(r.stock ?? '')),
		].join(',')),
	];

	const filename = `price-list-${currency.toLowerCase()}.csv`;
	return new Response(lines.join('\r\n'), {
		headers: {
			'Content-Type':        'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`,
		},
	});
}

function csvCell(val) {
	if (val == null) return '';
	const s = String(val);
	if (s.includes(',') || s.includes('"') || s.includes('\n')) {
		return `"${s.replace(/"/g, '""')}"`;
	}
	return s;
}
