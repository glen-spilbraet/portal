/**
 * The Portal's ONE definition of content languages and webshop markets.
 *
 * Every place that offers, stores, checks or exports per-language content
 * (product texts, labels, categories, brand pages, e-mails, PDFs, the shop
 * feed, MCP, …) imports from here. To add a language or a market, add it here;
 * do not write a new list anywhere else.
 *
 * Safe to import from both server code and Svelte components (no secrets, no
 * server-only imports).
 *
 * Codes:
 *   - Language codes are what is STORED and sent to the shop: da, sv, no, en,
 *     pl, fi. Swedish is `sv` in data but shown as "SE" in the Portal (`short`).
 *   - Market codes are the webshop markets: DK, SE, NO, INT, PL, FI.
 */

/**
 * @typedef {{
 *   code: string,      // stored code
 *   short: string,     // label on tabs / pills
 *   label: string,     // the language's own name
 *   english: string,   // English name (for Portal UI text)
 *   locale: string,    // number / date formatting
 *   logo: string,      // brand logo for customer-facing output
 * }} Language
 */

/** @type {Language[]} */
export const LANGUAGES = [
	{ code: 'da', short: 'DA', label: 'Dansk',   english: 'Danish',    locale: 'da-DK', logo: '/logo-da.svg' },
	{ code: 'sv', short: 'SE', label: 'Svenska', english: 'Swedish',   locale: 'sv-SE', logo: '/logo-se.svg' },
	{ code: 'no', short: 'NO', label: 'Norsk',   english: 'Norwegian', locale: 'nb-NO', logo: '/logo-no.svg' },
	{ code: 'en', short: 'EN', label: 'English', english: 'English',   locale: 'en-GB', logo: '/logo-da.svg' },
	// Poland and Finland use the Danish brand logo until they get their own —
	// change it here and every output follows.
	{ code: 'pl', short: 'PL', label: 'Polski',  english: 'Polish',    locale: 'pl-PL', logo: '/logo-da.svg' },
	{ code: 'fi', short: 'FI', label: 'Suomi',   english: 'Finnish',   locale: 'fi-FI', logo: '/logo-da.svg' },
];

/** Language codes, in display order. */
export const LANGS = LANGUAGES.map((l) => l.code);

/** Used when a language is missing or unknown. */
export const DEFAULT_LANG = 'en';

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

/** Codes people and older data use for the same language. */
const ALIASES = /** @type {Record<string, string>} */ ({ se: 'sv', nb: 'no', nn: 'no', dk: 'da', uk: 'en', gb: 'en' });

/**
 * Turn any spelling of a language code (SE, sv-SE, nb, " DA ") into a stored
 * code, or null if it is not one of the Portal's languages.
 * @param {unknown} code
 * @returns {string | null}
 */
export function normalizeLang(code) {
	const c = String(code ?? '').trim().toLowerCase().split(/[-_]/)[0];
	const known = ALIASES[c] ?? c;
	return BY_CODE.has(known) ? known : null;
}

/** @param {unknown} code */
export const isLang = (code) => typeof code === 'string' && BY_CODE.has(code);

/** The language's details (falls back to English for an unknown code). @param {unknown} code @returns {Language} */
export function langInfo(code) {
	return BY_CODE.get(/** @type {string} */ (code)) ?? /** @type {Language} */ (BY_CODE.get(DEFAULT_LANG));
}

/** @param {unknown} code */ export const langLabel = (code) => BY_CODE.get(/** @type {string} */ (code))?.label ?? String(code ?? '').toUpperCase();
/** @param {unknown} code */ export const langShort = (code) => BY_CODE.get(/** @type {string} */ (code))?.short ?? String(code ?? '').toUpperCase();
/** @param {unknown} code */ export const langLocale = (code) => langInfo(code).locale;
/** @param {unknown} code */ export const logoFor = (code) => langInfo(code).logo;

/** `{ da: 'Dansk', … }` for select boxes and label maps. */
export const LANG_LABELS = Object.fromEntries(LANGUAGES.map((l) => [l.code, l.label]));
/** `{ da: 'DA', sv: 'SE', … }` */
export const LANG_SHORT = Object.fromEntries(LANGUAGES.map((l) => [l.code, l.short]));

/**
 * The first non-empty value for a list of languages to try, e.g.
 * `pickLang(names, [lang, primary])`. After the given languages it tries
 * English and then every other language, so something is shown whenever any
 * language has a value.
 * @template T
 * @param {Record<string, T> | null | undefined} byLang
 * @param {(string | null | undefined)[]} [prefer]
 * @returns {T | undefined}
 */
export function pickLang(byLang, prefer = []) {
	if (!byLang) return undefined;
	for (const l of [...prefer, DEFAULT_LANG, ...LANGS]) {
		if (!l) continue;
		const v = byLang[l];
		if (v != null && String(v).trim() !== '') return v;
	}
	return undefined;
}

// ── Webshop markets ─────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   code: string,     // stored code
 *   label: string,    // English name
 *   lang: string,     // language its product texts must be written in
 *   currency: string, // currency its prices are in (the price itself lives in Rackbeat, per currency)
 * }} Market
 */

/** @type {Market[]} */
export const MARKET_LIST = [
	{ code: 'DK',  label: 'Denmark',       lang: 'da', currency: 'DKK' },
	{ code: 'SE',  label: 'Sweden',        lang: 'sv', currency: 'SEK' },
	{ code: 'NO',  label: 'Norway',        lang: 'no', currency: 'NOK' },
	{ code: 'INT', label: 'International', lang: 'en', currency: 'EUR' },
	{ code: 'PL',  label: 'Poland',        lang: 'pl', currency: 'PLN' },
	{ code: 'FI',  label: 'Finland',       lang: 'fi', currency: 'EUR' },
];

/** Market codes, in display order. */
export const MARKETS = MARKET_LIST.map((m) => m.code);
/** Webshop market → the language its texts are written in. */
export const MARKET_LANG = Object.fromEntries(MARKET_LIST.map((m) => [m.code, m.lang]));
/** Language → its webshop market. */
export const LANG_MARKET = Object.fromEntries(MARKET_LIST.map((m) => [m.lang, m.code]));
/** Market → the currency its prices are in. */
export const MARKET_CURRENCY = Object.fromEntries(MARKET_LIST.map((m) => [m.code, m.currency]));

/**
 * The price currency for something written in a language (a sales sheet, a
 * catalogue): the currency of that language's market. Currency belongs to the
 * MARKET — Finland and International share EUR without sharing a language.
 * A product without a price in that currency shows no price; nothing is ever
 * converted from another currency.
 * @param {unknown} code language code
 * @returns {string}
 */
export const langCurrency = (code) => MARKET_CURRENCY[LANG_MARKET[/** @type {string} */ (code)]] ?? MARKET_CURRENCY[LANG_MARKET[DEFAULT_LANG]];

/** `{ DK: 'Denmark', … }` */
export const MARKET_LABEL = Object.fromEntries(MARKET_LIST.map((m) => [m.code, m.label]));

const MARKET_SET = new Set(MARKETS);

/** @param {unknown} code */
export const isMarket = (code) => typeof code === 'string' && MARKET_SET.has(code);

/**
 * Keep only known market codes (upper-cased, de-duplicated, in display order).
 * @param {unknown} arr
 * @returns {string[]}
 */
export function sanitizeMarkets(arr) {
	const seen = new Set((Array.isArray(arr) ? arr : []).map((m) => String(m).trim().toUpperCase()));
	return MARKETS.filter((m) => seen.has(m));
}

// ── Product names in list rows ──────────────────────────────────────────────

/**
 * A product's display name from a list row carrying `name_<lang>` columns
 * (see NAME_COLUMNS_SQL in db.js). The name is one shared value copied to
 * every language, so this simply returns the first one present.
 * @param {Record<string, any> | null | undefined} row
 * @param {(string | null | undefined)[]} [prefer]
 * @returns {string}
 */
export function sheetName(row, prefer = []) {
	if (!row) return '';
	for (const l of [...prefer, DEFAULT_LANG, ...LANGS]) {
		const v = l ? row[`name_${l}`] : null;
		if (v) return v;
	}
	return '';
}

/** Every `name_<lang>` value on a list row (for searching). @param {Record<string, any> | null | undefined} row @returns {string[]} */
export const sheetNames = (row) => (row ? LANGS.map((l) => row[`name_${l}`]).filter(Boolean) : []);
