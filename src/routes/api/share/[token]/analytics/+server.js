import { json, error } from '@sveltejs/kit';
import { getCatalogueByShareToken } from '$lib/db.js';

/** @param {string} ua */
function detectDevice(ua) {
	if (!ua) return 'Unknown';
	if (/iPhone/.test(ua)) return 'iPhone';
	if (/iPad/.test(ua)) return 'iPad';
	if (/Android/.test(ua) && /Mobile/.test(ua)) return 'Android';
	if (/Android/.test(ua)) return 'Android Tablet';
	if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
	if (/Windows NT/.test(ua)) return 'Windows';
	if (/Linux/.test(ua)) return 'Linux';
	return 'Unknown';
}

export async function POST({ params, request, platform }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');

	const catalogue = await getCatalogueByShareToken(db, params.token);
	if (!catalogue) error(404, 'Not found');

	const body = await request.json().catch(() => null);
	if (!body) error(400, 'Invalid JSON');

	// ── Create session ─────────────────────────────────────────────────────────
	if (body.type === 'session') {
		const ua = request.headers.get('user-agent') ?? '';
		const deviceType = detectDevice(ua);

		// Cloudflare geo data (available on CF Pages/Workers, null in local dev)
		const cf = /** @type {any} */ (platform)?.cf;
		const city = cf?.city ?? null;
		const country = cf?.country ?? null;

		const id = crypto.randomUUID();
		await db
			.prepare(
				'INSERT INTO catalogue_analytics_sessions (id, catalogue_id, device_type, city, country) VALUES (?, ?, ?, ?, ?)'
			)
			.bind(id, catalogue.id, deviceType, city, country)
			.run();

		return json({ session_id: id });
	}

	// ── Log event ──────────────────────────────────────────────────────────────
	if (body.type === 'event') {
		const { session_id, event_type, page } = body;
		if (!session_id || !event_type) error(400, 'Missing fields');

		const VALID_EVENTS = ['view_page', 'download_photos', 'download_excel', 'download_pdf', 'view_end'];
		if (!VALID_EVENTS.includes(event_type)) error(400, 'Unknown event type');

		const id = crypto.randomUUID();
		await db
			.prepare(
				'INSERT INTO catalogue_analytics_events (id, session_id, event_type, page) VALUES (?, ?, ?, ?)'
			)
			.bind(id, session_id, event_type, page ?? null)
			.run();

		return json({ ok: true });
	}

	error(400, 'Unknown type');
}
