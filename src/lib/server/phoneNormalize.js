import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Phone-number normalization for HubSpot contacts.
 *
 * A contact's country comes from its primary associated company (free-text
 * `country` property in HubSpot). We map that to an ISO 3166-1 region code and
 * let libphonenumber add/keep the dialling code and format the number as
 * international ("+45 20 12 34 56"). Numbers that already carry an explicit
 * country code keep it; only the formatting is normalized.
 */

// Free-text company country (English + common Danish/German variants) → ISO region.
const COUNTRY_TO_REGION = {
	denmark: 'DK', danmark: 'DK',
	sweden: 'SE', sverige: 'SE',
	norway: 'NO', norge: 'NO',
	finland: 'FI', suomi: 'FI',
	iceland: 'IS', island: 'IS',
	'faroe islands': 'FO', færøerne: 'FO', faroerne: 'FO',
	germany: 'DE', tyskland: 'DE', deutschland: 'DE',
	netherlands: 'NL', holland: 'NL', nederland: 'NL',
	belgium: 'BE', belgien: 'BE', 'belgië': 'BE',
	france: 'FR', frankrig: 'FR',
	england: 'GB', 'united kingdom': 'GB', uk: 'GB', 'great britain': 'GB', storbritannien: 'GB',
	ireland: 'IE', irland: 'IE',
	austria: 'AT', østrig: 'AT',
	switzerland: 'CH', schweiz: 'CH',
	italy: 'IT', italien: 'IT',
	spain: 'ES', spanien: 'ES',
	portugal: 'PT',
	greece: 'GR', grækenland: 'GR',
	bulgaria: 'BG', bulgarien: 'BG',
	croatia: 'HR', kroatien: 'HR',
	'czech republic': 'CZ', czechia: 'CZ', tjekkiet: 'CZ',
	hungary: 'HU', ungarn: 'HU',
	latvia: 'LV', letland: 'LV',
	lithuania: 'LT', litauen: 'LT',
	estonia: 'EE', estland: 'EE',
	poland: 'PL', polen: 'PL',
	romania: 'RO', rumænien: 'RO',
	slovakia: 'SK', slovakiet: 'SK',
	slovenia: 'SI', slovenien: 'SI',
	macedonia: 'MK', 'north macedonia': 'MK', nordmakedonien: 'MK',
	serbia: 'RS', serbien: 'RS',
	luxembourg: 'LU', luxembourg2: 'LU',
	usa: 'US', 'united states': 'US',
	canada: 'CA'
};

/** Map a free-text company country to an ISO region code, or null if unknown. */
export function regionFromCountry(country) {
	const c = (country ?? '').trim().toLowerCase();
	if (!c) return null;
	return COUNTRY_TO_REGION[c] ?? null;
}

/**
 * Normalize one phone value given the contact's region.
 * @returns {{status:'empty'|'no_region'|'invalid'|'ok'|'change', value?:string}}
 *   empty     – nothing to do (blank)
 *   no_region – company country missing/unmapped → skip & report
 *   invalid   – can't be parsed to a valid number → skip & report
 *   ok        – already normalized (no write)
 *   change    – `value` is the new normalized number
 */
export function normalizePhone(raw, region) {
	const val = (raw ?? '').trim();
	if (!val) return { status: 'empty' };
	if (!region) return { status: 'no_region' };
	const parsed = parsePhoneNumberFromString(val, region);
	if (!parsed || !parsed.isValid()) return { status: 'invalid' };
	const formatted = parsed.formatInternational();
	return formatted === val ? { status: 'ok' } : { status: 'change', value: formatted };
}
