import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';
import { rawDb } from '$lib/server/errorLog.js';
import { setPerf, DEFAULT_THRESHOLD_MS } from '$lib/server/perfLog.js';

/**
 * POST /api/admin/performance
 *   { action: 'on', hours, threshold_ms } — start logging for `hours` (1–72)
 *   { action: 'off' }                     — stop now
 *   { action: 'clear' }                   — delete all logged requests
 */
export async function POST({ request, cookies, platform }) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = rawDb(platform?.env?.DB);
	const user = db ? await getAllowedUser(db, email) : null;
	if (!user || user.role !== 'admin') error(403, 'Admins only');
	const body = await request.json().catch(() => ({}));
	if (body.action === 'on') {
		const hours = Math.min(72, Math.max(1, Number(body.hours) || 24));
		const t = Number(body.threshold_ms);
		const threshold = Number.isFinite(t) && t >= 0 && t <= 60000 ? Math.round(t) : DEFAULT_THRESHOLD_MS;
		return json({ ok: true, ...(await setPerf(db, hours, threshold)) });
	}
	if (body.action === 'off') {
		const t = Number(body.threshold_ms);
		return json({ ok: true, ...(await setPerf(db, 0, Number.isFinite(t) && t >= 0 ? t : DEFAULT_THRESHOLD_MS)) });
	}
	if (body.action === 'clear') {
		await db.prepare('DELETE FROM perf_request').run();
		return json({ ok: true });
	}
	error(400, 'Unknown action');
}
