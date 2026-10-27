/**
 * Minimal, SAFE Markdown → HTML for the long description. Supports exactly the
 * subset we allow: 3 heading sizes (#, ##, ###), bullet (- * •) and numbered
 * (1.) lists, paragraphs,
 * links [text](url), and **bold** / *italic*. Input is HTML-escaped first, so no
 * pasted markup/styles survive — only the tags we generate are emitted.
 */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const safeHref = (u) => {
	const t = String(u).trim();
	return /^(https?:\/\/|mailto:|\/)/i.test(t) ? t : '#';
};

function inline(text) {
	let s = esc(text);
	// Links [text](url) — url already escaped; validate scheme.
	// A product shortcode `sku:LPFI403` (or `SKU=LPFI403`) renders as a product
	// link the webshop resolves to that product's page.
	s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) => {
		const target = url.replace(/&amp;/g, '&').trim();
		const sku = target.match(/^sku[:=]([A-Za-z0-9._-]+)$/i)?.[1];
		if (sku) return `<a class="md-product" data-sku="${esc(sku)}" href="#" title="Product ${esc(sku)}">${label}</a>`;
		return `<a href="${safeHref(target)}" target="_blank" rel="noopener">${label}</a>`;
	});
	s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
	return s;
}

/**
 * Read line by line, so a heading or a list may sit right above or below
 * other text without a blank line in between (as people naturally write):
 *   # / ## / ###      heading (→ h2 / h3 / h4)
 *   - item, * item, • item   bullet list;  1. item / 1) item   numbered list
 *   other lines       paragraph; single line breaks are kept, a blank line
 *                     starts a new paragraph
 */
export function mdToHtml(md) {
	if (!md || !String(md).trim()) return '';
	const out = [];
	let para = [];
	let list = null; // { tag: 'ul' | 'ol', items: [] }
	const flushPara = () => {
		if (para.length) out.push('<p>' + para.map(inline).join('<br>') + '</p>');
		para = [];
	};
	const flushList = () => {
		if (list) out.push(`<${list.tag}>` + list.items.map((i) => `<li>${inline(i)}</li>`).join('') + `</${list.tag}>`);
		list = null;
	};
	for (const raw of String(md).replace(/\r\n?/g, '\n').split('\n')) {
		const line = raw.trim();
		if (!line) { flushPara(); flushList(); continue; }
		const h = line.match(/^(#{1,3})\s+(.+)$/);
		if (h) {
			flushPara(); flushList();
			const level = h[1].length + 1; // # → h2, ## → h3, ### → h4
			out.push(`<h${level}>${inline(h[2])}</h${level}>`);
			continue;
		}
		const bullet = line.match(/^[-*•]\s+(.+)$/);
		const numbered = !bullet && line.match(/^\d{1,3}[.)]\s+(.+)$/);
		if (bullet || numbered) {
			flushPara();
			const tag = bullet ? 'ul' : 'ol';
			if (list && list.tag !== tag) flushList();
			list ??= { tag, items: [] };
			list.items.push((bullet || numbered)[1]);
			continue;
		}
		flushList();
		para.push(line);
	}
	flushPara();
	flushList();
	return out.join('\n');
}
