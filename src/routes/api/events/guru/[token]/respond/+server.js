import { json, error } from '@sveltejs/kit';
import { getProposalByToken, respondProposal } from '$lib/server/gurus.js';

// Public: a guru accepts or declines a proposal via their token.
export async function POST(event) {
	const db = event.platform?.env?.DB;
	if (!db) error(500, 'Unavailable');

	const proposal = await getProposalByToken(db, event.params.token);
	if (!proposal) error(404, 'Proposal not found');

	const body = await event.request.json().catch(() => ({}));
	const status = await respondProposal(db, event.params.token, body?.status);
	return json({ ok: true, status });
}
