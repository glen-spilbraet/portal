import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getSheet, updateSheet } from '$lib/db.js';
import { fetchRackbeatProductFull } from '$lib/rackbeat.js';

export async function POST({ params, cookies, platform }) {
	const token = cookies.get('session');
	const user = await verifySession(token ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!user) error(401, 'Unauthorized');

	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');

	const sheet = await getSheet(db, params.id);
	if (!sheet) error(404, 'Sheet not found');

	let rb;
	try {
		rb = await fetchRackbeatProductFull(sheet.sku, platform?.env?.RACKBEAT_API_KEY);
	} catch {
		rb = null;
	}
	if (!rb) error(502, 'Could not fetch product from Rackbeat');

	const su = rb.size_unit  ?? 'cm';
	const wu = rb.weight_unit ?? 'g';

	// ── Game badge values ──────────────────────────────────────────────────
	const ageVal = rb['custom:age-minimum__label'] ?? rb['custom:age-minimum'] ?? '';

	const durationRaw = rb['custom:duration'] ?? '';
	const timeVal = durationRaw ? `${durationRaw}'` : '';

	const playerMin = rb['custom:player-count-minimum'] ?? '';
	const playerMax = rb['custom:player-count-maximum'] ?? '';
	const playersVal = playerMin
		? (playerMax ? `${playerMin}-${playerMax}` : `${playerMin}+`)
		: '';

	// Merge into existing data_fields: preserve any custom fields the user added,
	// but overwrite the known Rackbeat-sourced keys.
	const existing = JSON.parse(sheet.data_fields ?? '[]');

	const rackbeatValues = {
		sku:     sheet.sku,
		ean:     rb.ean     ?? '',
		weight:  rb.weight  ? `${rb.weight} ${wu}`  : '',
		height:  rb.height  ? `${rb.height} ${su}`  : '',
		width:   rb.width   ? `${rb.width} ${su}`   : '',
		depth:   rb.depth   ? `${rb.depth} ${su}`   : '',
		age:     ageVal,
		time:    timeVal,
		players: playersVal,
	};

	// Update value on existing fields where key matches.
	// Only overwrite when Rackbeat actually has data — empty means "no data", so
	// leave whatever the user filled in intact.
	const updated = existing.map(f => {
		if (!(f.key in rackbeatValues)) return f;
		const rbVal = rackbeatValues[f.key];
		return rbVal !== '' ? { ...f, value: rbVal } : f;
	});

	// Add any Rackbeat keys that didn't exist yet, but only if Rackbeat has a value
	for (const [key, value] of Object.entries(rackbeatValues)) {
		if (value !== '' && !updated.find(f => f.key === key)) {
			updated.push({ key, label: key, value });
		}
	}

	await updateSheet(db, params.id, { data_fields: JSON.stringify(updated) });

	return json({ ok: true, data_fields: updated });
}
