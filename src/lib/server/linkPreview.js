/**
 * Fetch a URL and extract a visual "link card" from its Open Graph / meta tags
 * (og:image, og:title, og:description, og:site_name, favicon). Best-effort — on
 * any failure returns at least the URL so the card can still render a plain link.
 * No DOM in Workers, so meta tags are matched with regex over capped HTML.
 */
const decode = (s) => (s == null ? s : String(s)
	.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
	.replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim());

export async function fetchLinkPreview(rawUrl) {
	let url;
	try { url = new URL(String(rawUrl).trim()); } catch { return null; }
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

	const base = { url: url.href, title: null, description: null, siteName: url.hostname.replace(/^www\./, ''), image: null, favicon: null };
	let html = '';
	try {
		const res = await fetch(url.href, {
			headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SpilbraetPortal/1.0; link-preview)', Accept: 'text/html,application/xhtml+xml,*/*' },
			redirect: 'follow',
			signal: AbortSignal.timeout(9000)
		});
		if (res.ok) html = (await res.text()).slice(0, 600000);
	} catch { /* keep base */ }
	if (!html) { base.favicon = abs('/favicon.ico', url); return base; }

	const meta = (key) => {
		// match a <meta …> tag that carries property/name=key, then pull its content
		const re = new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'i');
		const tag = html.match(re)?.[0];
		return tag ? decode(tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1] ?? null) : null;
	};
	base.title = meta('og:title') || decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]) || base.siteName;
	base.description = meta('og:description') || meta('description') || null;
	base.siteName = meta('og:site_name') || base.siteName;
	base.image = meta('og:image') || meta('og:image:url') || meta('og:image:secure_url') || meta('twitter:image') || null;

	const iconTag = html.match(/<link[^>]+rel\s*=\s*["'][^"']*icon[^"']*["'][^>]*>/i)?.[0];
	const iconHref = iconTag ? iconTag.match(/href\s*=\s*["']([^"']*)["']/i)?.[1] : null;
	base.favicon = abs(iconHref, url) || abs('/favicon.ico', url);
	base.image = base.image ? abs(base.image, url) : null;
	return base;
}

function abs(href, url) {
	if (!href) return null;
	try { return new URL(href, url.href).href; } catch { return null; }
}
