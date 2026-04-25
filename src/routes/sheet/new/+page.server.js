import { fail, redirect } from '@sveltejs/kit';
import { createSheet, setTranslation, updateSheet } from '$lib/db.js';
import { fetchRackbeatProduct } from '$lib/rackbeat.js';

export const actions = {
	default: async ({ request, platform }) => {
		const db = platform?.env?.DB;
		if (!db) return fail(500, { error: 'DB unavailable' });

		const data = await request.formData();
		const sku = data.get('sku')?.toString().trim();
		const primaryLanguage = data.get('primary_language')?.toString() ?? 'en';
		if (!sku) return fail(400, { error: 'SKU is required' });

		const id = crypto.randomUUID();
		await createSheet(db, id, sku, primaryLanguage);

		// Pre-fill from Rackbeat if available (into primary language only)
		const rackbeat = await fetchRackbeatProduct(sku, platform?.env?.RACKBEAT_API_KEY);
		if (rackbeat) {
			await setTranslation(db, id, primaryLanguage, 'product_name', rackbeat.name);

			const fields = [
				{ key: 'sku', label: 'SKU', value: sku },
				{ key: 'ean', label: 'EAN', value: rackbeat.ean ?? '' },
				{ key: 'stock_date', label: 'Est. stock date', value: '' }
			];
			const su = rackbeat.sizeUnit ?? 'cm';
			const wu = rackbeat.weightUnit ?? 'g';
			if (rackbeat.height) fields.push({ key: 'height', label: 'Height', value: `${rackbeat.height} ${su}` });
			if (rackbeat.width)  fields.push({ key: 'width',  label: 'Width',  value: `${rackbeat.width} ${su}` });
			if (rackbeat.depth)  fields.push({ key: 'depth',  label: 'Depth',  value: `${rackbeat.depth} ${su}` });
			if (rackbeat.weight) fields.push({ key: 'weight', label: 'Weight', value: `${rackbeat.weight} ${wu}` });

			await updateSheet(db, id, { data_fields: JSON.stringify(fields) });
		}

		redirect(303, `/sheet/${id}?lang=${primaryLanguage}`);
	}
};
