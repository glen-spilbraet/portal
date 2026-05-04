import { error } from '@sveltejs/kit';
import { listContacts, listKeyAccounts } from '$lib/db.js';

export async function load({ parent, platform }) {
  const { user } = await parent();
  if (!user) error(401, 'Unauthorized');

  const db = platform?.env?.DB;
  if (!db) error(500, 'Database unavailable');

  const [contacts, keyAccounts] = await Promise.all([
    listContacts(db),
    listKeyAccounts(db),
  ]);

  return { contacts, keyAccounts };
}
