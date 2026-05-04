import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { addCampaignContacts, addCampaignContactsByAccount, removeCampaignContact } from '$lib/db.js';

async function auth(cookies, platform) {
  const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
  if (!email) error(401, 'Unauthorized');
  return email;
}

export async function POST({ params, request, cookies, platform }) {
  await auth(cookies, platform);
  const db = platform?.env?.DB;
  if (!db) error(500, 'DB unavailable');
  const body = await request.json();
  if (body.key_account_id) {
    await addCampaignContactsByAccount(db, params.id, body.key_account_id);
  } else if (body.contact_id) {
    await addCampaignContacts(db, params.id, [body.contact_id]);
  } else {
    error(400, 'contact_id or key_account_id required');
  }
  return json({ ok: true });
}

export async function DELETE({ params, request, cookies, platform }) {
  await auth(cookies, platform);
  const db = platform?.env?.DB;
  if (!db) error(500, 'DB unavailable');
  const { contact_id } = await request.json();
  if (!contact_id) error(400, 'contact_id required');
  await removeCampaignContact(db, params.id, contact_id);
  return json({ ok: true });
}
