import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getCampaignSheetsAllTranslations } from '$lib/db.js';

async function auth(cookies, platform) {
  const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
  if (!email) error(401, 'Unauthorized');
  return email;
}

export async function GET({ params, cookies, platform }) {
  await auth(cookies, platform);
  const db = platform?.env?.DB;
  if (!db) error(500, 'DB unavailable');
  return json(await getCampaignSheetsAllTranslations(db, params.id));
}
