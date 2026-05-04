import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { updateCampaign, deleteCampaign } from '$lib/db.js';

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
  if ('name' in body) {
    if (!body.name?.trim()) error(400, 'name required');
    patch.name = body.name.trim();
  }
  await updateCampaign(db, params.id, patch);
  return json({ ok: true });
}

export async function DELETE({ params, cookies, platform }) {
  await auth(cookies, platform);
  const db = platform?.env?.DB;
  if (!db) error(500, 'DB unavailable');
  await deleteCampaign(db, params.id);
  return json({ ok: true });
}
