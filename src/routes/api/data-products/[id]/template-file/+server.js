import { error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getDataProduct } from '$lib/db.js';

export async function GET({ params, cookies, platform }) {
	const token = cookies.get('session');
	if (!verifySession(token ?? '', platform?.env?.APP_SECRET ?? 'dev-secret')) error(401, 'Unauthorized');

	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');
	const r2 = platform?.env?.IMAGES;
	if (!r2) error(500, 'Storage unavailable');

	const product = await getDataProduct(db, params.id);
	if (!product) error(404, 'Not found');
	if (!product.template_key) error(404, 'No template uploaded');

	const obj = await r2.get(product.template_key);
	if (!obj) error(404, 'Template file not found');

	return new Response(obj.body, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': 'attachment; filename="template.xlsx"'
		}
	});
}
