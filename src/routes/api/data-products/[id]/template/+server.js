import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getDataProduct, updateDataProduct } from '$lib/db.js';

export async function POST({ params, request, cookies, platform }) {
	const token = cookies.get('session');
	if (!verifySession(token ?? '', platform?.env?.APP_SECRET ?? 'dev-secret')) error(401, 'Unauthorized');

	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');
	const r2 = platform?.env?.IMAGES;
	if (!r2) error(500, 'Storage unavailable');

	const product = await getDataProduct(db, params.id);
	if (!product) error(404, 'Not found');

	const body = await request.json();
	const { headers, fileBase64 } = body;

	if (!Array.isArray(headers) || headers.length === 0) error(400, 'No headers provided');

	if (fileBase64) {
		// Upload mode: store template file in R2 and reset mappings
		const key = `data-templates/${params.id}/template.xlsx`;
		const fileBuffer = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0));
		await r2.put(key, fileBuffer, { httpMetadata: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });

		await updateDataProduct(db, params.id, {
			template_key: key,
			template_headers: JSON.stringify(headers),
			mappings: '{}'
		});
	} else {
		// Custom mode: save headers only, clear any uploaded template reference
		await updateDataProduct(db, params.id, {
			template_key: null,
			template_headers: JSON.stringify(headers)
		});
	}

	return json({ ok: true, headers });
}
