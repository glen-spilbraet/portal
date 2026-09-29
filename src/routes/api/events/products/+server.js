import { json } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { searchSheets } from '$lib/db.js';

// SKU search for the event product picker.
export async function GET(event) {
	const { db } = await requireEvents(event);
	const q = (event.url.searchParams.get('q') ?? '').trim();
	if (q.length < 2) return json([]);
	const rows = await searchSheets(db, q);
	return json((rows ?? []).slice(0, 10).map((r) => ({
		sku: r.sku,
		name: r.name_en || r.name_da || r.name_sv || r.name_no || r.sku
	})));
}
