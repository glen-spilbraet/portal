/**
 * https://img.spilbraet.dk (workers/image-cdn) makes WebP widths of R2 images
 * on first request and stores them. Asking for them right after an upload
 * means no shop visitor ever waits for one to be made.
 */
const WIDTHS = [300, 600, 1000, 1600];

/**
 * Request every width of a freshly uploaded image, in the background.
 * Best-effort: a miss is simply made on first view instead.
 * @param {any} platform SvelteKit platform (context.waitUntil)
 * @param {string} key R2 key
 */
export function warmImageWidths(platform, key) {
	const work = Promise.allSettled(WIDTHS.map((w) =>
		fetch(`https://img.spilbraet.dk/${key}?w=${w}`, { headers: { 'User-Agent': 'spilbraet-portal/1.0' } }).then((r) => r.arrayBuffer())
	));
	if (platform?.context?.waitUntil) platform.context.waitUntil(work);
}
