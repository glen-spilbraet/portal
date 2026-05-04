import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { updateContact, deleteContact } from '$lib/db.js';

async function auth(cookies, platform) {
  const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
  if (!email) error(401, 'Unauthorized');
  return email;
}

export async function PATCH({ params, request, cookies, platform }) {
  await auth(cookies, platform);
  const db = platform?.env?.DB;
  if (!db) error(500, 'DB unavailable');
  const body = await request.json();
  const patch = {};
  if ('first_name' in body) patch.first_name = body.first_name;
  if ('email' in body) patch.email = body.email;
  if ('key_account_id' in body) patch.key_account_id = body.key_account_id;
  if (!Object.keys(patch).length) error(400, 'Nothing to update');
  await updateContact(db, params.id, patch);
  return json({ ok: true });
}

export async function DELETE({ params, cookies, platform }) {
  await auth(cookies, platform);
  const db = platform?.env?.DB;
  if (!db) error(500, 'DB unavailable');
  await deleteContact(db, params.id);
  return json({ ok: true });
}
