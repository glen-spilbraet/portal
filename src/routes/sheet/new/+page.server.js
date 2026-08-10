import { fail, redirect } from '@sveltejs/kit';
import { createSheet, setTranslation, updateSheet } from '$lib/db.js';
import { fetchRackbeatProductFull } from '$lib/rackbeat.js';
import { verifySession } from '$lib/auth.js';

export const actions = {
	default: async ({ request, cookies, platform }) => {
		const db = platform?.env?.DB;
		if (!db) return fail(500, { error: 'DB unavailable' });

		const token = cookies.get('session');
		const createdBy = await verifySession(token ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');

		const data = await request.formData();
		const sku = data.get('sku')?.toString().trim();
		const primaryLanguage = data.get('primary_language')?.toString() ?? 'en';
		if (!sku) return fail(400, { error: 'SKU is required' });

		const id = crypto.randomUUID();
		await createSheet(db, id, sku, primaryLanguage, createdBy);

		// Pre-fill from Rackbeat if available (into primary language only)
		let rb;
		try {
			rb = await fetchRackbeatProductFull(sku, platform?.env?.RACKBEAT_API_KEY);
		} catch {
			rb = null;
		}
		if (rb) {
			await setTranslation(db, id, primaryLanguage, 'product_name', rb.name ?? '');

			const su = rb.size_unit ?? 'cm';
			const wu = rb.weight_unit ?? 'g';

			// ── Game badge values ─────────────────────────────────────────────
			// AGE: label from custom field "age-minimum" (dropdown)
			const ageVal = rb['custom:age-minimum__label'] ?? rb['custom:age-minimum'] ?? '';

			// TIME: text value from "duration", append ' (minutes) suffix
			const durationRaw = rb['custom:duration'] ?? '';
			const timeVal = durationRaw ? `${durationRaw}'` : '';

			// PLAYERS: "player-count-minimum" [–] "player-count-maximum"
			const playerMin = rb['custom:player-count-minimum'] ?? '';
			const playerMax = rb['custom:player-count-maximum'] ?? '';
			const playersVal = playerMin
				? (playerMax ? `${playerMin}-${playerMax}` : `${playerMin}+`)
				: '';

			const fields = [
				{ key: 'sku',     label: 'SKU',     value: sku },
				{ key: 'ean',     label: 'EAN',     value: rb.ean ?? '' },
				{ key: 'weight',  label: 'Weight',  value: rb.weight  ? `${rb.weight} ${wu}`  : '' },
				{ key: 'height',  label: 'Height',  value: rb.height  ? `${rb.height} ${su}`  : '' },
				{ key: 'width',   label: 'Width',   value: rb.width   ? `${rb.width} ${su}`   : '' },
				{ key: 'depth',   label: 'Depth',   value: rb.depth   ? `${rb.depth} ${su}`   : '' },
				{ key: 'age',     label: 'age',     value: ageVal },
				{ key: 'time',    label: 'time',    value: timeVal },
				{ key: 'players', label: 'players', value: playersVal },
			];

			await updateSheet(db, id, { data_fields: JSON.stringify(fields) });
		}

		redirect(303, `/sheet/${id}?lang=${primaryLanguage}`);
	}
};
