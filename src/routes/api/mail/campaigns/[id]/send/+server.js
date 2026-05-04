import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import {
  getCampaign,
  getCampaignContacts,
  getCampaignSheetsAllTranslations,
  getGlobalLabels,
  getAllowedUser,
  logCampaignSend,
} from '$lib/db.js';
import { generateEmailHtml } from '$lib/email-html.js';

async function auth(cookies, platform) {
  const email = await verifySession(
    cookies.get('session') ?? '',
    platform?.env?.APP_SECRET ?? 'dev-secret'
  );
  if (!email) error(401, 'Unauthorized');
  return email;
}

function glGet(labels, key, lang) {
  return labels[key]?.[lang] ?? labels[key]?.['en'] ?? '';
}

const FALLBACKS = {
  mail_subject:    'New products in our selection',
  mail_header:     'New products coming soon',
  mail_intro:      'We are adding products to our selection. Get a preview of what\'s coming and feel free to reach out if you\'re interested.',
  mail_sheet_link: 'View sales sheet →',
};

function getLabel(labels, key, lang) {
  return glGet(labels, key, lang) || FALLBACKS[key] || '';
}

function buildSheetsForLang(emailSheets, lang) {
  return emailSheets.map(sheet => {
    const t = sheet.tr[lang] ?? sheet.tr['en'] ?? {};
    const usps = [];
    for (let i = 1; i <= sheet.usp_count; i++) {
      const v = t[`usp_${i}`];
      if (v) usps.push(v);
    }
    return {
      sku: sheet.sku,
      box_image_key: sheet.box_image_key,
      share_token: sheet.share_token,
      data_fields: sheet.data_fields,
      product_name: t.product_name || sheet.sku,
      product_description: t.product_description || '',
      usps,
    };
  });
}

/** Build email payload objects for Resend, grouped by language. */
function buildEmailPayloads({ contacts, emailSheets, globalLabels, from, origin, scheduledAt }) {
  const langs = ['en', 'da', 'sv', 'no'];

  // Pre-build HTML + subject per language (avoid redundant work)
  const byLang = {};
  for (const lang of langs) {
    const sheets = buildSheetsForLang(emailSheets, lang);
    byLang[lang] = {
      subject: getLabel(globalLabels, 'mail_subject', lang),
      html: generateEmailHtml({
        header: getLabel(globalLabels, 'mail_header', lang),
        intro: getLabel(globalLabels, 'mail_intro', lang),
        sheetLinkText: getLabel(globalLabels, 'mail_sheet_link', lang),
        sheets,
        origin,
        lang,
      }),
    };
  }

  return contacts.map(c => {
    const lang = c.key_account_language || 'en';
    const { subject, html } = byLang[lang] ?? byLang['en'];
    const payload = { from, to: [c.email], subject, html };
    if (scheduledAt) payload.scheduled_at = scheduledAt;
    return payload;
  });
}

/** Send emails via Resend (batches of up to 100). */
async function sendViaResend(emails, apiKey) {
  const BATCH_SIZE = 100;
  const results = [];

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const chunk = emails.slice(i, i + BATCH_SIZE);
    const endpoint = chunk.length === 1
      ? 'https://api.resend.com/emails'
      : 'https://api.resend.com/emails/batch';
    const body = chunk.length === 1 ? chunk[0] : chunk;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? `Resend error ${res.status}`);
    }

    results.push(await res.json());
  }

  return results;
}

export async function POST({ params, request, cookies, platform, url }) {
  const userEmail = await auth(cookies, platform);

  const db = platform?.env?.DB;
  if (!db) error(500, 'DB unavailable');

  const RESEND_API_KEY = platform?.env?.RESEND_API_KEY;
  const RESEND_FROM    = platform?.env?.RESEND_FROM;
  if (!RESEND_API_KEY) error(500, 'RESEND_API_KEY not configured');
  if (!RESEND_FROM)    error(500, 'RESEND_FROM not configured');

  // Use the logged-in user's personal send_from address if set;
  // otherwise default to their login email (with first name as display name);
  // final fallback is the shared RESEND_FROM env var.
  const senderUser = await getAllowedUser(db, userEmail);
  const defaultFrom = senderUser?.first_name
    ? `${senderUser.first_name} <${userEmail}>`
    : userEmail;
  const from = senderUser?.send_from || defaultFrom || RESEND_FROM;

  const campaign = await getCampaign(db, params.id);
  if (!campaign) error(404, 'Campaign not found');

  const body = await request.json();
  const { type, test_recipients, test_lang, scheduled_at_utc } = body;

  if (!['test', 'now', 'scheduled'].includes(type)) {
    error(400, 'type must be "test", "now", or "scheduled"');
  }

  const origin = url.origin;

  if (type === 'test') {
    // ── Test send ────────────────────────────────────────────────────────────
    if (!Array.isArray(test_recipients) || test_recipients.length === 0) {
      error(400, 'test_recipients required');
    }
    const lang = test_lang || 'en';

    const [emailSheets, globalLabels] = await Promise.all([
      getCampaignSheetsAllTranslations(db, params.id),
      getGlobalLabels(db),
    ]);

    const sheets = buildSheetsForLang(emailSheets, lang);
    const html = generateEmailHtml({
      header: getLabel(globalLabels, 'mail_header', lang),
      intro: getLabel(globalLabels, 'mail_intro', lang),
      sheetLinkText: getLabel(globalLabels, 'mail_sheet_link', lang),
      sheets,
      origin,
      lang,
    });

    const subject = `[TEST] ${getLabel(globalLabels, 'mail_subject', lang)}`;

    await sendViaResend([{
      from,
      to: test_recipients,
      subject,
      html,
    }], RESEND_API_KEY);

    return json({ ok: true, sent: test_recipients.length });

  } else {
    // ── Now or Scheduled send ─────────────────────────────────────────────────
    const [contacts, emailSheets, globalLabels] = await Promise.all([
      getCampaignContacts(db, params.id),
      getCampaignSheetsAllTranslations(db, params.id),
      getGlobalLabels(db),
    ]);

    if (contacts.length === 0) error(400, 'No contacts added to this campaign');
    if (emailSheets.length === 0) error(400, 'No sheets added to this campaign');

    if (type === 'scheduled' && !scheduled_at_utc) {
      error(400, 'scheduled_at_utc required for scheduled sends');
    }

    const emails = buildEmailPayloads({
      contacts,
      emailSheets,
      globalLabels,
      from,
      origin,
      scheduledAt: type === 'scheduled' ? scheduled_at_utc : undefined,
    });

    await sendViaResend(emails, RESEND_API_KEY);

    // Log the send so the contact history columns can reflect it
    await logCampaignSend(db, params.id, contacts.map(c => c.contact_id));

    return json({ ok: true, sent: emails.length });
  }
}
