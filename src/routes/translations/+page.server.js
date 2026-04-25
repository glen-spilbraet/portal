import { fail } from '@sveltejs/kit';
import { getGlobalLabels, upsertGlobalLabel, listCtaVersions } from '$lib/db.js';

export async function load({ platform }) {
	const db = platform?.env?.DB;
	if (!db) return { globalLabels: {}, ctaVersions: [] };
	const [globalLabels, ctaVersions] = await Promise.all([getGlobalLabels(db), listCtaVersions(db)]);
	return { globalLabels, ctaVersions };
}

export const actions = {
	saveLabel: async ({ request, platform }) => {
		const db = platform?.env?.DB;
		if (!db) return fail(500, { error: 'DB unavailable' });
		const data = await request.formData();
		const key = data.get('key')?.toString();
		const lang = data.get('lang')?.toString();
		const label = data.get('label')?.toString() ?? '';
		if (!key || !lang) return fail(400, { error: 'Missing key or lang' });
		await upsertGlobalLabel(db, key, lang, label);
		return { success: true };
	}
};
