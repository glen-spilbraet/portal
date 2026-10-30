import { error } from '@sveltejs/kit';
import { getMediaByShareKey, getMediaAssetLibrary } from '$lib/server/awards.js';

/**
 * Public asset library for one media (shared by its unguessable share key).
 * The [slug] segment is cosmetic (readability + "did I copy the right link");
 * the media is looked up by [key] only.
 *
 * Logo follows the same country→language rule as catalogues: Danish / Swedish /
 * Norwegian media get their own logo; everything else falls back to Danish.
 */
function logoForCountry(country) {
	const c = (country || '').toLowerCase();
	if (c === 'sweden') return '/logo-se.svg';
	if (c === 'norway') return '/logo-no.svg';
	return '/logo-da.svg'; // Denmark + every other country (EU fallback)
}

export async function load({ params, platform }) {
	const db = platform?.env?.DB;
	if (!db) error(503, 'Unavailable');

	const media = await getMediaByShareKey(db, params.key);
	if (!media) error(404, 'Asset library not found');

	const sections = await getMediaAssetLibrary(db, media.id);

	return {
		media: { name: media.name, country: media.country || null },
		logo: logoForCountry(media.country),
		sections,
	};
}
