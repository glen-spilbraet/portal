/**
 * Result cache for Stats views (Cloudflare Cache API).
 *
 * Why it's safe: sales data only changes when the nightly sync runs, so a view's
 * output is stable until then. We cache the computed payload keyed by a VERSION
 * (sync `last_run` + today's date) and a SCOPE (everything else that changes the
 * numbers: the viewer's data scope, filters, period, drill-down ids). A new sync
 * or a new day changes the version → old entries are never matched again (and
 * expire via max-age), so there's no manual invalidation to get wrong.
 *
 * It is read-only (never writes to D1), and fails safe: any miss, disabled flag,
 * or Cache API hiccup just runs `build()` live — exactly today's behaviour.
 *
 * Controls:
 *   - `?nocache=1`         — bypass for this request (compare live vs cached).
 *   - env STATS_CACHE=off  — global kill switch (instant revert to live).
 * Both set an `x-stats-cache` response header (hit | miss | bypass | disabled)
 * so cache behaviour is visible in the browser's Network tab.
 */

// Backstop expiry. The daily refresh is driven by `version`; this only bounds how
// long a mid-day change (e.g. an admin editing a publisher mapping) can be stale.
const TTL_SECONDS = 1800; // 30 min
const KEY_HOST = 'https://stats-cache.internal';

async function hashKey(obj) {
	const bytes = new TextEncoder().encode(JSON.stringify(obj));
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {object} opts
 * @param {App.Platform|undefined} opts.platform
 * @param {URL} opts.url
 * @param {(h: Record<string,string>) => void} [opts.setHeaders]
 * @param {string} opts.ns       logical view name, e.g. 'forecast'
 * @param {string} opts.version  busts the cache: `${last_run}|${todayISO}`
 * @param {object} opts.scope    everything else that changes the output
 * @param {() => Promise<object>} build  computes the payload on a miss
 * @returns {Promise<object>} the payload (cached or freshly built)
 */
export async function withCache({ platform, url, setHeaders, ns, version, scope }, build) {
	const bypass = url.searchParams.has('nocache') || platform?.env?.STATS_CACHE === 'off';
	const cache = !bypass && globalThis.caches ? globalThis.caches.default : null;

	if (!cache) {
		const data = await build();
		setHeaders?.({ 'x-stats-cache': bypass ? 'bypass' : 'disabled' });
		return data;
	}

	const req = new Request(`${KEY_HOST}/${ns}/${await hashKey({ version, scope })}`);
	try {
		const hit = await cache.match(req);
		if (hit) {
			setHeaders?.({ 'x-stats-cache': 'hit' });
			return await hit.json();
		}
	} catch { /* fall through to live build */ }

	const data = await build();
	try {
		await cache.put(
			req,
			new Response(JSON.stringify(data), {
				headers: { 'content-type': 'application/json', 'cache-control': `max-age=${TTL_SECONDS}` },
			})
		);
	} catch { /* caching is best-effort */ }
	setHeaders?.({ 'x-stats-cache': 'miss' });
	return data;
}
