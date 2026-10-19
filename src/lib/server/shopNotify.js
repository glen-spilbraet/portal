/**
 * Tell the B2B shops about a webshop publishing change the moment it is saved,
 * so visibility updates at once (the shop's full Portal sync is the safety net).
 * The data lives on SALES_DB, shared by both Portal environments, so every
 * Portal notifies both shops.
 */
const SHOP_WEBHOOKS = [
	'https://shop-9c9.pages.dev/api/portal/webhook',
	'https://dev.shop-9c9.pages.dev/api/portal/webhook'
];

/**
 * @param {any} platform SvelteKit platform (env.SHOP_FEED_KEY, context.waitUntil)
 * @param {Record<string, unknown>} change e.g. { type: 'publisher_markets', publisher, markets }
 */
export async function notifyShops(platform, change) {
	const key = platform?.env?.SHOP_FEED_KEY;
	if (!key) return;
	const send = Promise.allSettled(SHOP_WEBHOOKS.map(async (url) => {
		const res = await fetch(url, {
			method: 'POST',
			headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'spilbraet-portal/1.0' },
			body: JSON.stringify(change),
			signal: AbortSignal.timeout(8000)
		});
		if (!res.ok) console.warn(`shop notify ${url}: ${res.status}`);
	}));
	// Don't hold up the save; finish in the background when the runtime allows it.
	if (platform?.context?.waitUntil) platform.context.waitUntil(send);
	else await send;
}
