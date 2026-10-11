import { redirect } from '@sveltejs/kit';

// Mail defaults to Campaigns.
export function load() {
	redirect(307, '/mail/campaigns');
}
