/**
 * Minimal, SAFE Markdown → HTML for the long description. Supports exactly the
 * subset we allow: 3 heading sizes (#, ##, ###), bullet lists (- ), paragraphs,
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
	s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) => `<a href="${safeHref(url.replace(/&amp;/g, '&'))}" target="_blank" rel="noopener">${label}</a>`);
	s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
	return s;
}

export function mdToHtml(md) {
	if (!md || !String(md).trim()) return '';
	const blocks = String(md).replace(/\r\n/g, '\n').split(/\n{2,}/);
	const out = [];
	for (const raw of blocks) {
		const block = raw.trim();
		if (!block) continue;
		const lines = block.split('\n');
		// Bullet list: every line is a "- " item.
		if (lines.every((l) => /^\s*-\s+/.test(l))) {
			out.push('<ul>' + lines.map((l) => `<li>${inline(l.replace(/^\s*-\s+/, ''))}</li>`).join('') + '</ul>');
			continue;
		}
		// Heading: a single line starting with #, ##, ### → h2/h3/h4.
		const h = lines.length === 1 && lines[0].match(/^(#{1,3})\s+(.*)$/);
		if (h) {
			const level = h[1].length + 1; // # → h2, ## → h3, ### → h4
			out.push(`<h${level}>${inline(h[2])}</h${level}>`);
			continue;
		}
		out.push('<p>' + lines.map((l) => inline(l)).join('<br>') + '</p>');
	}
	return out.join('\n');
}
