import { json, error } from '@sveltejs/kit';
import { requireShopKey } from '$lib/server/shopFeedAuth.js';

/**
 * GET /api/shop/reps — Portal users' profiles for the B2B shop's "Din
 * sælger" widget, matched there by email with Rackbeat's "Vores reference".
 * Bearer SHOP_FEED_KEY. Read-only.
 */
export async function GET({ request, platform, url }) {
	const env = platform?.env;
	requireShopKey(request, env);
	if (!env?.DB) error(500, 'Database unavailable');
	const rows = /** @type {any[]} */ ((await env.DB.prepare(
		'SELECT email, name, first_name, job_title, phone, photo_key FROM allowed_users ORDER BY email'
	).all()).results ?? []);
	return json({
		reps: rows.map((r) => ({
			email: String(r.email).toLowerCase(),
			name: r.name || r.first_name || null,
			title: r.job_title || null,
			phone: r.phone || null,
			photo: r.photo_key ? `${url.origin}/api/img/${r.photo_key}` : null
		}))
	}, { headers: { 'Cache-Control': 'no-store' } });
}
