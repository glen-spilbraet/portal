import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { listKeyAccounts, createKeyAccount } from '$lib/db.js';

async function auth(cookies, platform) {
  const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
  if (!email) error(401, 'Unauthorized');
  return email;
}

export async function GET({ cookies, platform }) {
  await auth(cookies, platform);
  const db = platform?.env?.DB;
  if (!db) error(500, 'DB unavailable');
  return json(await listKeyAccounts(db));
}

export async function POST({ request, cookies, platform }) {
  await auth(cookies, platform);
  const db = platform?.env?.DB;
  if (!db) error(500, 'DB unavailable');
  const { name } = await request.json();
  if (!name?.trim()) error(400, 'name required');
  const id = crypto.randomUUID();
  await createKeyAccount(db, id, name.trim());
  return json({ id, name: name.trim() });
}
