/**
 * Browser-side crashes (a component that throws, a failed client load, an
 * unhandled promise) → POST /api/errors → Admin → Error Log (source "client").
 * Throttled so a render loop can't spam; never throws itself.
 */
let sent = 0;
const seen = new Set();

/** @param {{ message: string, stack?: string, status?: number, route?: string | null }} e */
function report(e) {
	try {
		const key = `${e.message}|${location.pathname}`;
		if (sent >= 20 || seen.has(key)) return;
		seen.add(key); sent++;
		const body = JSON.stringify({ ...e, path: location.pathname + location.search });
		if (!navigator.sendBeacon?.('/api/errors', new Blob([body], { type: 'application/json' }))) {
			fetch('/api/errors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
		}
	} catch { /* ignore */ }
}

/** @param {unknown} err */
const describe = (err) => err instanceof Error
	? { message: err.message || err.name, stack: err.stack ?? '' }
	: { message: String(err), stack: '' };

if (typeof window !== 'undefined') {
	window.addEventListener('error', (ev) => {
		// Ignore failed <img>/<script> loads (no error object) and cross-origin "Script error."
		if (!ev.error) return;
		report({ ...describe(ev.error), status: 0 });
	});
	window.addEventListener('unhandledrejection', (ev) => report({ ...describe(ev.reason), status: 0 }));
}

/** @type {import('@sveltejs/kit').HandleClientError} */
export function handleError({ error, event, status, message }) {
	if (status !== 404) report({ ...describe(error), status, route: event.route?.id ?? null });
	return { message };
}
