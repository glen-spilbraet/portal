import { error } from '@sveltejs/kit';
import { getSheet, getTranslations, getImages } from '$lib/db.js';
import { getBadgesForSku } from '$lib/server/awards.js';

const LANGS = ['da', 'sv', 'no', 'en'];

/** data_fields JSON → { key: value } for non-empty values. */
function fieldMap(dataFields) {
	let arr = [];
	try { arr = JSON.parse(dataFields || '[]'); } catch { arr = []; }
	/** @type {Record<string, string>} */
	const out = {};
	for (const f of arr) if (f?.key && f.value != null && `${f.value}`.trim() !== '') out[f.key] = `${f.value}`.trim();
	return out;
}

/** "Restart (Nordic+EN)" → "Restart" — edition suffixes don't belong on a story. */
const cleanName = (n) => (n ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim();

export async function load({ params, url, platform, parent }) {
	await parent(); // layout access guard (sheets section)
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');

	const sheet = await getSheet(db, params.id);
	if (!sheet) error(404, 'Sheet not found');

	const primary = sheet.primary_language ?? 'en';
	const [translations, people, content, badges] = await Promise.all([
		getTranslations(db, params.id),
		getImages(db, params.id, 'people_playing'),
		getImages(db, params.id, 'content'),
		getBadgesForSku(db, sheet.sku, new Date().toISOString().slice(0, 10)),
	]);

	// Text per language (falls back to the primary language field by field).
	const t = (l) => translations[l] ?? {};
	const pick = (l, key) => (t(l)[key] || t(primary)[key] || '').trim();
	const texts = {};
	for (const l of LANGS) {
		texts[l] = {
			name: cleanName(pick(l, 'product_name')) || sheet.sku,
			description: pick(l, 'product_description'),
			bullets: [1, 2, 3].map((i) => pick(l, `usp_${i}`)),
		};
	}
	const available = LANGS.filter((l) => Object.keys(t(l)).length > 0);
	const reqLang = url.searchParams.get('lang');
	const lang = LANGS.includes(reqLang ?? '') ? reqLang : (LANGS.includes(primary) ? primary : 'da');

	const f = fieldMap(sheet.data_fields);
	const img = (r) => ({ key: r.r2_key, cropX: r.crop_x ?? 50, cropY: r.crop_y ?? 50 });

	return {
		sheetId: params.id,
		sku: sheet.sku,
		lang,
		languages: available.length ? available : [lang],
		texts,
		attrs: { age: f.age ?? null, time: f.time ?? null, players: f.players ?? null },
		boxImageKey: sheet.box_image_key || sheet.box_flat_image_key || null, // 3D → flat front
		// People-playing photos first; content photos as a fallback pool.
		photos: [...people.map((r) => ({ ...img(r), type: 'people_playing' })), ...content.map((r) => ({ ...img(r), type: 'content' }))],
		badges,
	};
}
