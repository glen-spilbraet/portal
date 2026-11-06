// Warehouse dashboard (under Stats). Access is enforced by the root layout
// (`warehouse` permission). This load serves ONLY the Operational tab; the
// "Slow movers / Dead stock" tab is fetched lazily from ./dead-stock when opened.
import { buildPresets, loadOperational } from '$lib/server/warehouse.js';

export async function load({ url, platform }) {
	const presets = buildPresets();
	const def = presets.find((p) => p.key === '30d');
	const from = url.searchParams.get('from') || def.from;
	const to = url.searchParams.get('to') || def.to;
	const selected = presets.find((p) => p.from === from && p.to === to)?.key ?? 'custom';

	// Warehouse data lives in SALES_DB — always the prod portal-db, shared by every environment.
	const env = platform?.env;
	if (!env?.SALES_DB) return { from, to, presets, selected, ready: false, reason: 'no-db' };

	try {
		const data = await loadOperational(env, from, to);
		return { from, to, presets, selected, ready: true, ...data };
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		return { from, to, presets, selected, ready: false, reason: /no such table/i.test(message) ? 'no-table' : 'error', message };
	}
}
