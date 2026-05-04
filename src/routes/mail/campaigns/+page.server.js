import { error } from '@sveltejs/kit';
import { listCampaigns } from '$lib/db.js';

export async function load({ parent, platform }) {
  const { user } = await parent();
  if (!user) error(401, 'Unauthorized');
  const db = platform?.env?.DB;
  if (!db) error(500, 'Database unavailable');
  const campaigns = await listCampaigns(db);
  return { campaigns };
}
