import { error } from '@sveltejs/kit';
import { getSheet, getTranslations, getImages, getGlobalLabels, listCtaVersions, getCtaVersionTranslations } from '$lib/db.js';

const LANGUAGES = [
	{ code: 'en', label: 'English' },
	{ code: 'da', label: 'Dansk' },
	{ code: 'sv', label: 'Svenska' },
	{ code: 'no', label: 'Norsk' }
];

export async function load({ params, url, platform }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');

	const sheet = await getSheet(db, params.id);
	if (!sheet) error(404, 'Sheet not found');

	const [allTranslations, images, globalLabels, ctaVersions] = await Promise.all([
		getTranslations(db, params.id),
		getImages(db, params.id),
		getGlobalLabels(db),
		listCtaVersions(db)
	]);

	// Inject selected CTA version's translations into globalLabels
	if (sheet.cta_version_id) {
		const ctaT = await getCtaVersionTranslations(db, sheet.cta_version_id);
		globalLabels['cta'] = ctaT;
	} else {
		delete globalLabels['cta'];
	}

	const primaryLanguage = sheet.primary_language ?? 'en';
	const lang = url.searchParams.get('lang') ?? primaryLanguage;

	return {
		sheet,
		allTranslations,
		translations: allTranslations[lang] ?? {},
		baseTranslations: allTranslations[primaryLanguage] ?? {},
		images,
		language: lang,
		primaryLanguage,
		languages: LANGUAGES,
		globalLabels,
		ctaVersions
	};
}
