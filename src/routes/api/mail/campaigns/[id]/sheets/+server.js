import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { addCampaignSheet, removeCampaignSheet, reorderCampaignSheets } from '$lib/db.js';

async function auth(cookies, platform) {
  const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
  if (!email) error(401, 'Unauthorized');
  return email;
}

export async function POST({ params, request, cookies, platform }) {
  await auth(cookies, platform);
  const db = platform?.env?.DB;
  if (!db) error(500, 'DB unavailable');
  const { sheet_id } = await request.json();
  if (!sheet_id) error(400, 'sheet_id required');
  await addCampaignSheet(db, params.id, sheet_id);
  return json({ ok: true });
}

export async function PUT({ params, request, cookies, platform }) {
  await auth(cookies, platform);
  const db = platform?.env?.DB;
  if (!db) error(500, 'DB unavailable');
  const { ordered_sheet_ids } = await request.json();
  if (!Array.isArray(ordered_sheet_ids)) error(400, 'ordered_sheet_ids required');
  await reorderCampaignSheets(db, params.id, ordered_sheet_ids);
  return json({ ok: true });
}

export async function DELETE({ params, request, cookies, platform }) {
  await auth(cookies, platform);
  const db = platform?.env?.DB;
  if (!db) error(500, 'DB unavailable');
  const { sheet_id } = await request.json();
  if (!sheet_id) error(400, 'sheet_id required');
  await removeCampaignSheet(db, params.id, sheet_id);
  return json({ ok: true });
}
