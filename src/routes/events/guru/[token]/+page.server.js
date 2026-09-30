import { error } from '@sveltejs/kit';
import { getProposalByToken } from '$lib/server/gurus.js';

export async function load({ params, platform }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const proposal = await getProposalByToken(db, params.token);
	if (!proposal) error(404, 'This invitation link is not valid.');

	return { proposal, token: params.token };
}
