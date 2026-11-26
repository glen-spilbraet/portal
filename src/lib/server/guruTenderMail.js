/**
 * Guru tender e-mail — one personal e-mail per guru with their own link.
 * Language follows the venue country (see $lib/guruTender.js). Sent via Resend.
 */
import { tt, tenderLang, tenderWhen } from '$lib/guruTender.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/**
 * @param {{ event: any, venue: any, openings: any[], guru: { name: string }, url: string }} p
 */
export function buildTenderMail({ event, venue, openings, guru, url }) {
	const lang = tenderLang(venue?.country);
	const title = event.title || 'Event';
	const when = tenderWhen(lang, event);
	const place = [venue?.name, [venue?.zip, venue?.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
	const open = openings.filter((o) => o.slots - o.filled > 0);
	const rows = open.map((o) =>
		`<tr><td style="padding:6px 0;font-weight:600;color:#18181B">${esc(o.label || tt(lang, 'general'))}</td>` +
		`<td style="padding:6px 0;text-align:right;color:#71717A">${esc(tt(lang, 'mailSpots', { n: o.slots - o.filled }))}</td></tr>`
	).join('');
	const html = `<!doctype html><html><body style="margin:0;background:#FFF6DF;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2A2417">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<div style="background:#ffffff;border-radius:18px;padding:28px 26px">
<p style="margin:0 0 6px;font-size:20px;font-weight:800">${esc(tt(lang, 'hi', { name: guru.name.split(' ')[0] }))}</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.5;color:#4A4130">${esc(tt(lang, 'mailIntro', { title }))}</p>
<div style="background:#FAFAFA;border-radius:12px;padding:14px 16px;margin-bottom:18px">
<div style="font-size:16px;font-weight:700;margin-bottom:4px">${esc(title)}</div>
${when ? `<div style="font-size:14px;color:#52525B">📅 ${esc(when)}</div>` : ''}
${place ? `<div style="font-size:14px;color:#52525B">📍 ${esc(place)}</div>` : ''}
</div>
${rows ? `<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#A1A1AA;margin-bottom:4px">${esc(tt(lang, 'mailOpenings'))}</div>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">${rows}</table>` : ''}
<a href="${esc(url)}" style="display:block;text-align:center;background:#F57832;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 18px;border-radius:12px">${esc(tt(lang, 'mailCta'))}</a>
<p style="margin:16px 0 0;font-size:13px;color:#71717A">${esc(tt(lang, 'mailOutro'))}</p>
</div>
<p style="text-align:center;color:#8A7B58;font-size:12px;margin-top:20px">Spilbræt</p>
</div></body></html>`;
	const text = [
		tt(lang, 'hi', { name: guru.name.split(' ')[0] }), '', tt(lang, 'mailIntro', { title }), '',
		title, when, place, '',
		...(open.length ? [tt(lang, 'mailOpenings') + ':', ...open.map((o) => `- ${o.label || tt(lang, 'general')}: ${tt(lang, 'mailSpots', { n: o.slots - o.filled })}`), ''] : []),
		`${tt(lang, 'mailCta')}: ${url}`, '', tt(lang, 'mailOutro'),
	].filter((l) => l !== undefined).join('\n');
	return { lang, subject: tt(lang, 'subject', { title }), html, text };
}

/** Send a list of prepared e-mails via Resend's batch endpoint (≤100 per call). */
export async function sendResendBatch(emails, apiKey) {
	for (let i = 0; i < emails.length; i += 100) {
		const chunk = emails.slice(i, i + 100);
		const res = await fetch('https://api.resend.com/emails/batch', {
			method: 'POST',
			headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
			body: JSON.stringify(chunk),
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			throw new Error(err.message ?? `Resend error ${res.status}`);
		}
	}
}
