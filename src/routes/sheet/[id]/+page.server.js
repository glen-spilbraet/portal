import { error } from '@sveltejs/kit';
import { getSheet, getTranslations, getImages, getVideos, getArticles, getGlobalLabels, listCtaVersions, getCtaVersionTranslations } from '$lib/db.js';
import { fetchSalesPrices } from '$lib/server/rackbeat.js';
import { getBadgesForSku } from '$lib/server/awards.js';
import { listTaxonomy, productCategoryIds, CATEGORY_LANGS } from '$lib/server/categories.js';
import { MARKETS, resolvePublisherForSku, getPublisherMarkets, getProductWebshop } from '$lib/server/webshopMarkets.js';

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

	const apiKey = platform?.env?.RACKBEAT_API_KEY;
	const [allTranslations, images, contentImages, rawVideos, rawArticles, globalLabels, ctaVersions, salesPrices] = await Promise.all([
		getTranslations(db, params.id),
		getImages(db, params.id),                 // people-playing grid
		getImages(db, params.id, 'content'),      // webshop content images
		getVideos(db, params.id),
		getArticles(db, params.id),
		getGlobalLabels(db),
		listCtaVersions(db),
		fetchSalesPrices(sheet.sku, apiKey),
	]);
	// markets: stored JSON string | null (null = all). Parse for the client.
	const parseMkts = (v) => { if (v == null) return null; try { return JSON.parse(v); } catch { return null; } };
	const videos = rawVideos.map((v) => ({ ...v, markets: parseMkts(v.markets) }));
	const articles = rawArticles.map((a) => ({ ...a, markets: parseMkts(a.markets) }));
	const awardBadges = await getBadgesForSku(db, sheet.sku, new Date().toISOString().slice(0, 10));

	// Category tagging (SALES_DB — shared prod taxonomy, read by the shop feed)
	const salesDb = platform?.env?.SALES_DB;
	const [categoryGroups, categorySelected] = salesDb
		? await Promise.all([listTaxonomy(salesDb), productCategoryIds(salesDb, sheet.sku)])
		: [[], []];

	// Webshop market licensing (SALES_DB): resolve publisher → its licensed
	// markets, plus this product's publish state.
	const publisherName = salesDb ? await resolvePublisherForSku(salesDb, sheet.sku) : null;
	const [allowedMarkets, productWebshop] = salesDb
		? await Promise.all([getPublisherMarkets(salesDb, publisherName), getProductWebshop(salesDb, sheet.sku)])
		: [[], { publishedMarkets: null, overrideLicense: false }];

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
		contentImages,
		videos,
		articles,
		language: lang,
		primaryLanguage,
		languages: LANGUAGES,
		globalLabels,
		ctaVersions,
		salesPrices,
		awardBadges,
		categoryGroups,
		categorySelected,
		categoryLangs: CATEGORY_LANGS,
		webshopMarkets: MARKETS,
		webshopPublisher: publisherName,
		webshopAllowed: allowedMarkets,
		webshopPublished: productWebshop.publishedMarkets,
		webshopOverride: productWebshop.overrideLicense,
	};
}
