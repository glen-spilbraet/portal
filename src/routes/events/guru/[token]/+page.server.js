import { error } from '@sveltejs/kit';
import { getProposalByToken, listOpenings } from '$lib/server/gurus.js';
import { tenderLang } from '$lib/guruTender.js';

export async function load({ params, platform, depends }) {
	depends('guru:tender');
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const proposal = await getProposalByToken(db, params.token);
	if (!proposal) error(404, 'This invitation link is not valid.');

	const openings = (await listOpenings(db, proposal.event_id))
		.map((o) => ({ id: o.id, label: o.label, slots: o.slots, filled: o.filled }));

	return { proposal, openings, lang: tenderLang(proposal.venue_country), token: params.token };
}
