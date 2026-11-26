import { json, error } from '@sveltejs/kit';
import { getProposalByToken, respondProposal, listOpenings } from '$lib/server/gurus.js';

// Public: a guru takes an opening (first come first served), or declines, via their token.
// Body: { status: 'accepted' | 'declined', opening_id?: string }
export async function POST(event) {
	const db = event.platform?.env?.DB;
	if (!db) error(500, 'Unavailable');

	const proposal = await getProposalByToken(db, event.params.token);
	if (!proposal) error(404, 'Proposal not found');
	if (proposal.event_status === 'cancelled' || proposal.event_status === 'done') error(410, 'This event is closed');

	const body = await event.request.json().catch(() => ({}));
	const openings = await listOpenings(db, proposal.event_id);
	if (body?.status === 'accepted' && openings.length && !body?.opening_id) return json({ message: 'Pick a spot' }, { status: 400 });

	const out = await respondProposal(db, event.params.token, body?.status, openings.length ? body?.opening_id : null);
	const fresh = await listOpenings(db, proposal.event_id);
	if (out.status === 'full') return json({ ...out, openings: publicOpenings(fresh) }, { status: 409 });
	return json({ ok: true, ...out, openings: publicOpenings(fresh) });
}

/** Only what the guru page needs (no names of other gurus). */
const publicOpenings = (rows) => rows.map((o) => ({ id: o.id, label: o.label, slots: o.slots, filled: o.filled }));
