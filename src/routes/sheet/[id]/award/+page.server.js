import { error, fail } from '@sveltejs/kit';
import { getSheet, getTranslations, markSheetAwardsUpdated } from '$lib/db.js';
import { getBadgesForSku, listAllInstances } from '$lib/server/awards.js';

const LANGS = ['en', 'da', 'sv', 'no'];

/** Press/award instances where this SKU is the main product OR an additional one. */
function pressForSku(all, sku) {
	const want = (sku ?? '').toLowerCase().trim();
	if (!want) return [];
	return all
		.filter((i) =>
			(i.sku ?? '').toLowerCase() === want ||
			(i.additional_products ?? []).some((p) => (p.sku ?? '').toLowerCase() === want)
		)
		.map((i) => ({
			media: i.media_name,
			review_scale: i.review_scale ?? null,
			award_category: i.award_category ?? null,
			is_nominated: !!i.is_nominated,
			is_winner: !!i.is_winner,
			instance_date: i.instance_date ?? null,
			disclosure_date: i.disclosure_date ?? null,
			statements: (i.statements ?? []).map((s) => ({ statement: s.statement ?? null, score: s.score ?? null })),
		}));
}

export async function load({ params, url, platform, parent }) {
	await parent(); // runs the layout access guard (sheets section)
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');

	const sheet = await getSheet(db, params.id);
	if (!sheet) error(404, 'Sheet not found');

	const primaryLanguage = sheet.primary_language ?? 'en';
	const reqLang = url.searchParams.get('lang');
	const lang = LANGS.includes(reqLang ?? '') ? reqLang : primaryLanguage;

	const [translations, badges, allInstances] = await Promise.all([
		getTranslations(db, params.id),
		getBadgesForSku(db, sheet.sku, new Date().toISOString().slice(0, 10)),
		listAllInstances(db),
	]);

	const name =
		translations[lang]?.product_name ||
		translations[primaryLanguage]?.product_name ||
		sheet.sku;

	const press = pressForSku(allInstances, sheet.sku)
		.sort((a, b) => (b.instance_date ?? '').localeCompare(a.instance_date ?? ''));

	return {
		sheetId: params.id,
		sku: sheet.sku,
		name,
		lang,
		boxImageKey: sheet.box_image_key ?? null,
		badges,
		press,
		awardsUpdatedAt: sheet.awards_updated_at ?? null,
	};
}

export const actions = {
	markUpdated: async ({ params, platform }) => {
		const db = platform?.env?.DB;
		if (!db) return fail(500, { error: 'DB unavailable' });
		await markSheetAwardsUpdated(db, params.id);
		return { marked: true };
	},
};
