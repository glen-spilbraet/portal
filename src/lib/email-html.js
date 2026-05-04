/**
 * Generates a full inline-styled HTML email string for a mail campaign.
 *
 * @param {object} opts
 * @param {string} opts.header       - Email heading (h1)
 * @param {string} opts.intro        - Intro paragraph text
 * @param {string} opts.sheetLinkText - CTA link text ("View sales sheet →")
 * @param {Array}  opts.sheets       - Array of sheet objects (see below)
 * @param {string} opts.origin       - Absolute base URL for images (e.g. "https://portal.example.com")
 *
 * Each sheet object:
 *   { sku, box_image_key, share_token, data_fields (JSON string), product_name, product_description, usps: string[] }
 */

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseDataFields(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    const SKIP = ['stock_date', 'colli', 'age', 'time', 'players'];
    return arr.filter(f => f.value?.trim() && !SKIP.includes(f.key));
  } catch { return []; }
}

function renderDataFields(fields) {
  if (!fields.length) return '';
  // Pair fields into rows of 2
  const pairs = [];
  for (let i = 0; i < fields.length; i += 2) {
    pairs.push([fields[i], fields[i + 1] ?? null]);
  }
  const rows = pairs.map((pair, pi) => {
    const isLastPair = pi === pairs.length - 1;
    const borderBottom = isLastPair ? 'none' : '1px solid #F0EDE7';
    const [a, b] = pair;
    return `
      <tr>
        <td style="padding:5px 12px;font-family:${FONT};font-size:11.5px;color:#71717A;font-weight:500;border-bottom:${borderBottom};border-right:1px solid #F0EDE7;width:50%;box-sizing:border-box;">
          ${esc(a.label)}<span style="float:right;color:#18181B;font-weight:700;">${esc(a.value)}</span>
        </td>
        <td style="padding:5px 12px;font-family:${FONT};font-size:11.5px;color:#71717A;font-weight:500;border-bottom:${borderBottom};width:50%;box-sizing:border-box;">
          ${b ? `${esc(b.label)}<span style="float:right;color:#18181B;font-weight:700;">${esc(b.value)}</span>` : '&nbsp;'}
        </td>
      </tr>`;
  }).join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin-top:14px;border:1px solid #F0EDE7;border-radius:8px;overflow:hidden;border-collapse:collapse;">
      ${rows}
    </table>`;
}

function renderSheet(sheet, origin, sheetLinkText, isFirst) {
  const { sku, box_image_key, share_token, data_fields, product_name, product_description, usps } = sheet;

  const divider = isFirst ? '' : `
    <tr><td colspan="1" style="padding:0 32px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="height:1px;background-color:#F4F0E8;"></td></tr>
      </table>
    </td></tr>`;

  const imgCell = box_image_key
    ? `<img src="${origin}/api/img/${esc(box_image_key)}" width="110" height="110" alt="${esc(product_name)}"
        style="display:block;width:110px;height:110px;border-radius:10px;border:1px solid #ECEAE6;object-fit:contain;background-color:#FAFAF8;padding:4px;box-sizing:border-box;" />`
    : `<table role="presentation" cellpadding="0" cellspacing="0">
        <tr><td width="110" height="110" style="background-color:#F4F4F5;border-radius:10px;border:1px solid #E4E4E7;text-align:center;vertical-align:middle;color:#D4D4D8;font-size:24px;">&#9744;</td></tr>
      </table>`;

  const descHtml = product_description
    ? `<p style="font-family:${FONT};font-size:13px;color:#52525B;line-height:1.55;margin:4px 0 6px;">${esc(product_description)}</p>`
    : '';

  const uspsHtml = usps.length
    ? usps.map(usp => `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:3px;">
          <tr>
            <td style="font-family:${FONT};font-size:13px;color:#F57832;font-weight:700;width:18px;vertical-align:top;padding-top:1px;">&#10003;</td>
            <td style="font-family:${FONT};font-size:12px;color:#374151;line-height:1.45;">${esc(usp)}</td>
          </tr>
        </table>`).join('')
    : '';

  const linkHtml = share_token
    ? `<a href="${origin}/share/sheet/${esc(share_token)}" style="display:inline-block;margin-top:10px;font-family:${FONT};font-size:12px;font-weight:700;color:#F57832;text-decoration:none;">${esc(sheetLinkText)}</a>`
    : '';

  const fields = parseDataFields(data_fields);
  const dataHtml = renderDataFields(fields);

  return `
    ${divider}
    <tr>
      <td style="padding:20px 32px ${fields.length ? '16px' : '20px'};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="126" valign="top" style="padding-right:0;">
              ${imgCell}
            </td>
            <td valign="top" style="padding-left:16px;">
              <div style="font-family:${FONT};font-size:10px;font-weight:700;color:#F57832;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:4px;">${esc(sku)}</div>
              <div style="font-family:${FONT};font-size:16px;font-weight:800;color:#18181B;letter-spacing:-0.3px;line-height:1.25;margin-bottom:5px;">${esc(product_name)}</div>
              ${descHtml}
              ${uspsHtml}
              ${linkHtml}
            </td>
          </tr>
        </table>
        ${dataHtml}
      </td>
    </tr>`;
}

function getLogoUrl(origin, lang) {
  const file = lang === 'sv' ? 'logo-se.svg' : lang === 'no' ? 'logo-no.svg' : 'logo-da.svg';
  return `${origin}/${file}`;
}

export function generateEmailHtml({ header, intro, sheetLinkText, sheets, origin, lang = 'en' }) {
  const year = new Date().getFullYear();
  const logoUrl = getLogoUrl(origin, lang);
  const sheetsHtml = sheets
    .map((s, i) => renderSheet(s, origin, sheetLinkText, i === 0))
    .join('');

  return `<!DOCTYPE html>
<html lang="${esc(lang)}" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>${esc(header)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    @media only screen and (max-width:620px) {
      .email-container { width:100%!important; }
      .ep-img { width:80px!important; height:80px!important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#FFE6A5;-webkit-font-smoothing:antialiased;mso-line-height-rule:exactly;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFE6A5;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <!-- Logo -->
        <img src="${logoUrl}" alt="Logo" width="160"
          style="display:block;margin:0 auto 24px;width:160px;max-width:160px;height:auto;" />

        <!-- Email container -->
        <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0"
          style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;">

          <!-- Top gradient bar (solid fallback for Outlook) -->
          <tr>
            <td height="6" style="background-color:#F57832;background-image:linear-gradient(90deg,#F57832 0%,#F5A632 100%);height:6px;line-height:6px;font-size:1px;">&nbsp;</td>
          </tr>

          <!-- Intro section -->
          <tr>
            <td style="padding:32px 32px 24px;border-bottom:1px solid #F4F0E8;">
              <h1 style="font-family:${FONT};font-size:24px;font-weight:800;color:#18181B;margin:0 0 12px;letter-spacing:-0.5px;line-height:1.25;">${esc(header)}</h1>
              <p style="font-family:${FONT};font-size:14px;color:#52525B;line-height:1.65;margin:0;">${esc(intro)}</p>
            </td>
          </tr>

          <!-- Products -->
          ${sheetsHtml || `
          <tr>
            <td style="padding:40px 32px;text-align:center;font-family:${FONT};font-size:13px;color:#A1A1AA;">
              No products included in this campaign.
            </td>
          </tr>`}

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:#FAFAF8;border-top:1px solid #F4F0E8;text-align:center;">
              <p style="font-family:${FONT};font-size:11px;color:#A1A1AA;line-height:1.6;margin:0;">You received this because you are a valued partner.</p>
              <p style="font-family:${FONT};font-size:11px;color:#A1A1AA;line-height:1.6;margin:4px 0 0;">© ${year} — Sent via Portal</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
