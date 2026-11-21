import { error } from '@sveltejs/kit';
import { getSheetByShareToken, getTranslations, getImages, getGlobalLabels, getCtaVersionTranslations } from '$lib/db.js';
import { fetchSalesPrices } from '$lib/server/rackbeat.js';
import { getBadgesForSku } from '$lib/server/awards.js';
import { LANGUAGES, normalizeLang } from '$lib/languages.js';


export async function load({ params, url, platform }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');

	const sheet = await getSheetByShareToken(db, params.token);
	if (!sheet) error(404, 'This link is invalid or has been removed');

	const apiKey = platform?.env?.RACKBEAT_API_KEY;
	const [allTranslations, images, globalLabels, salesPrices] = await Promise.all([
		getTranslations(db, sheet.id),
		getImages(db, sheet.id),
		getGlobalLabels(db),
		fetchSalesPrices(sheet.sku, apiKey),
	]);
	const awardBadges = await getBadgesForSku(db, sheet.sku, new Date().toISOString().slice(0, 10));

	if (sheet.cta_version_id) {
		const ctaT = await getCtaVersionTranslations(db, sheet.cta_version_id);
		globalLabels['cta'] = ctaT;
	} else {
		delete globalLabels['cta'];
	}

	const primaryLanguage = sheet.primary_language ?? 'en';
	const lang = normalizeLang(url.searchParams.get('lang')) ?? primaryLanguage;

	// Only expose languages the sheet has real text in (the product name alone
	// does not count — it is one shared value copied to every language)
	const availableLanguages = LANGUAGES.filter(l =>
		Object.entries(allTranslations[l.code] ?? {}).some(([k, v]) => k !== 'product_name' && String(v ?? '').trim())
	);
	// Always include primary language
	if (!availableLanguages.find(l => l.code === primaryLanguage)) {
		availableLanguages.unshift(LANGUAGES.find(l => l.code === primaryLanguage) ?? LANGUAGES[0]);
	}

	// Public page: internal fields (who created it, stock figures) stay internal.
	const { created_by, rb_available, rb_stock, rb_in_order, rb_purchased, rb_changed_at, featured_at, awards_updated_at, ...publicSheet } = sheet;

	return {
		sheet: publicSheet,
		translations: allTranslations[lang] ?? {},
		baseTranslations: allTranslations[primaryLanguage] ?? {},
		images,
		language: lang,
		primaryLanguage,
		languages: availableLanguages,
		globalLabels,
		salesPrices,
		awardBadges,
		token: params.token,
	};
}
