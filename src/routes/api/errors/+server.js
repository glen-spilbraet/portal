import { logError } from '$lib/server/errorLog.js';
import { verifySession } from '$lib/auth.js';

/**
 * Receives client-side crash reports from hooks.client.js. Same-origin only;
 * fields are clipped in logError. Always answers 204.
 */
export async function POST({ request, platform, cookies, url }) {
	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin) return new Response(null, { status: 204 });
	const b = await request.json().catch(() => null);
	if (!b || typeof b.message !== 'string' || !b.message.trim()) return new Response(null, { status: 204 });
	const user = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret').catch(() => null);
	logError(platform, {
		source: 'client',
		status: Number(b.status) || 0,
		method: 'GET',
		path: typeof b.path === 'string' ? b.path : null,
		route: typeof b.route === 'string' ? b.route : null,
		message: b.message,
		stack: typeof b.stack === 'string' ? b.stack : '',
		user,
		ua: request.headers.get('user-agent'),
	});
	return new Response(null, { status: 204 });
}
