/**
 * Languages a PRODUCT comes in (its components and/or rule book) — any language
 * in the world, unlike the Portal's six content languages ($lib/languages.js),
 * which are the languages we write texts in.
 *
 * Stored per sheet as a JSON list in display order (sales_sheets.product_languages):
 *   [{ code: 'da' }, { code: 'de', manual_only: true }]
 * `manual_only` = only the rule book / manual is in that language.
 *
 * Codes: the Portal's own codes for its market languages (da, sv, no, en, pl, fi),
 * ISO 639-1 for the rest, plus a few regional variants that boxes distinguish.
 * Safe to import from server code and Svelte components.
 */

import { LANGS } from '$lib/languages.js';

/** Languages inside our markets — offered as one-click picks. */
export const MARKET_LANGUAGE_CODES = LANGS;

// ISO 639-1 (Norwegian is `no`, as everywhere in the Portal — nb/nn are folded into it).
const ISO_639_1 = (
	'aa ab ae af ak am an ar as av ay az ba be bg bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu ' +
	'fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km ' +
	'kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nd ne ng nl no nr nv ny oc oj om or os ' +
	'pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt ' +
	'tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu'
).split(' ');

/** Regional variants a game box may list separately. */
const VARIANTS = ['pt-BR', 'es-419', 'zh-Hans', 'zh-Hant', 'fr-CA', 'en-US', 'en-GB'];

/** Every code that can be chosen. */
export const PRODUCT_LANGUAGE_CODES = [...ISO_639_1, ...VARIANTS];
const VALID = new Set(PRODUCT_LANGUAGE_CODES);
const CANONICAL = new Map(PRODUCT_LANGUAGE_CODES.map((c) => [c.toLowerCase(), c]));
/** Other spellings people type or paste. */
const ALIASES = /** @type {Record<string, string>} */ ({ se: 'sv', dk: 'da', nb: 'no', nn: 'no', 'pt-br': 'pt-BR', 'zh-cn': 'zh-Hans', 'zh-tw': 'zh-Hant' });

let names = null;
/** English name of a language ("German", "Brazilian Portuguese"); the code itself if unknown. @param {string} code */
export function productLanguageName(code) {
	try {
		names ??= new Intl.DisplayNames(['en'], { type: 'language' });
		const n = names.of(code === 'no' ? 'nb' : code);
		// Intl calls `nb` "Norwegian Bokmål"; for a game box it is just Norwegian.
		if (code === 'no') return 'Norwegian';
		return n && n !== code ? n : code.toUpperCase();
	} catch { return String(code).toUpperCase(); }
}

/** All languages as `{ code, name }`, sorted by name — for the search box. */
export function allProductLanguages() {
	return PRODUCT_LANGUAGE_CODES
		.map((code) => ({ code, name: productLanguageName(code) }))
		.sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

/** @param {unknown} code @returns {string | null} a valid code, or null */
export function normalizeProductLanguage(code) {
	const c = String(code ?? '').trim().toLowerCase().replace(/_/g, '-');
	const known = ALIASES[c] ?? CANONICAL.get(c) ?? null;
	return known && VALID.has(known) ? known : null;
}

/** @typedef {{ code: string, manual_only?: boolean }} ProductLanguage */

/**
 * Clean a list from the client or the database: known codes only, one entry
 * per language, `manual_only` only when true. Accepts the stored JSON string too.
 * @param {unknown} input
 * @returns {ProductLanguage[]}
 */
export function sanitizeProductLanguages(input) {
	let list = input;
	if (typeof list === 'string') { try { list = JSON.parse(list); } catch { list = []; } }
	if (!Array.isArray(list)) return [];
	/** @type {ProductLanguage[]} */
	const out = [];
	const seen = new Set();
	for (const item of list) {
		const code = normalizeProductLanguage(typeof item === 'string' ? item : item?.code);
		if (!code || seen.has(code)) continue;
		seen.add(code);
		out.push(item?.manual_only ? { code, manual_only: true } : { code });
		if (out.length >= 80) break;
	}
	return out;
}
