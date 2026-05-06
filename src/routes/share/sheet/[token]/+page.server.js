import { error } from '@sveltejs/kit';
import { getSheetByShareToken, getTranslations, getImages, getGlobalLabels, getCtaVersionTranslations } from '$lib/db.js';
import { fetchSalesPrices } from '$lib/server/rackbeat.js';

const LANGUAGES = [
	{ code: 'en', label: 'English' },
	{ code: 'da', label: 'Dansk' },
	{ code: 'sv', label: 'Svenska' },
	{ code: 'no', label: 'Norsk' }
];

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

	if (sheet.cta_version_id) {
		const ctaT = await getCtaVersionTranslations(db, sheet.cta_version_id);
		globalLabels['cta'] = ctaT;
	} else {
		delete globalLabels['cta'];
	}

	const primaryLanguage = sheet.primary_language ?? 'en';
	const lang = url.searchParams.get('lang') ?? primaryLanguage;

	// Only expose languages that have at least a product name translated
	const availableLanguages = LANGUAGES.filter(l =>
		allTranslations[l.code]?.product_name?.trim()
	);
	// Always include primary language
	if (!availableLanguages.find(l => l.code === primaryLanguage)) {
		availableLanguages.unshift(LANGUAGES.find(l => l.code === primaryLanguage) ?? LANGUAGES[0]);
	}

	return {
		sheet,
		translations: allTranslations[lang] ?? {},
		baseTranslations: allTranslations[primaryLanguage] ?? {},
		images,
		language: lang,
		primaryLanguage,
		languages: availableLanguages,
		globalLabels,
		salesPrices,
		token: params.token,
	};
}
