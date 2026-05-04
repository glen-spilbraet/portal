import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { listContacts, createContact } from '$lib/db.js';

async function auth(cookies, platform) {
  const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
  if (!email) error(401, 'Unauthorized');
  return email;
}

export async function GET({ cookies, platform }) {
  await auth(cookies, platform);
  const db = platform?.env?.DB;
  if (!db) error(500, 'DB unavailable');
  return json(await listContacts(db));
}

export async function POST({ request, cookies, platform }) {
  await auth(cookies, platform);
  const db = platform?.env?.DB;
  if (!db) error(500, 'DB unavailable');
  const { first_name, email: contactEmail, key_account_id } = await request.json();
  if (!first_name?.trim()) error(400, 'first_name required');
  if (!contactEmail?.trim()) error(400, 'email required');
  const id = crypto.randomUUID();
  await createContact(db, id, key_account_id || null, first_name.trim(), contactEmail.trim());
  return json({ id, first_name: first_name.trim(), email: contactEmail.trim(), key_account_id: key_account_id || null });
}
