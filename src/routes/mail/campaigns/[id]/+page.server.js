import { error } from '@sveltejs/kit';
import {
  getCampaign,
  getCampaignSheets,
  getCampaignContacts,
  listSheetsSimple,
  listContacts,
  listKeyAccounts,
  getCampaignSheetsAllTranslations,
  getGlobalLabels,
  getContactSheetHistory,
} from '$lib/db.js';

export async function load({ params, parent, platform }) {
  const { user } = await parent();
  if (!user) error(401, 'Unauthorized');
  const db = platform?.env?.DB;
  if (!db) error(500, 'Database unavailable');

  const campaign = await getCampaign(db, params.id);
  if (!campaign) error(404, 'Campaign not found');

  const [sheets, contacts, allSheets, allContacts, keyAccounts, emailSheets, globalLabels, historyPairs] = await Promise.all([
    getCampaignSheets(db, params.id),
    getCampaignContacts(db, params.id),
    listSheetsSimple(db),
    listContacts(db),
    listKeyAccounts(db),
    getCampaignSheetsAllTranslations(db, params.id),
    getGlobalLabels(db),
    getContactSheetHistory(db, params.id),
  ]);

  return { campaign, sheets, contacts, allSheets, allContacts, keyAccounts, emailSheets, globalLabels, historyPairs };
}
