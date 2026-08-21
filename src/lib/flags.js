/**
 * Small inline SVG country flags (viewBox 20×14, no intrinsic size — size via
 * CSS). Cleaner and consistent across OSes (Windows doesn't render emoji flags).
 * flagSvg(country) takes free-text country (English + Danish variants) → SVG
 * string, or '' when unknown.
 */
const F = {
	DK: '<svg viewBox="0 0 20 14"><rect width="20" height="14" fill="#C8102E"/><rect x="6" width="3" height="14" fill="#fff"/><rect y="5.5" width="20" height="3" fill="#fff"/></svg>',
	SE: '<svg viewBox="0 0 20 14"><rect width="20" height="14" fill="#006AA7"/><rect x="6" width="3" height="14" fill="#FECC00"/><rect y="5.5" width="20" height="3" fill="#FECC00"/></svg>',
	NO: '<svg viewBox="0 0 20 14"><rect width="20" height="14" fill="#BA0C2F"/><rect x="5" width="5" height="14" fill="#fff"/><rect y="4.5" width="20" height="5" fill="#fff"/><rect x="6" width="3" height="14" fill="#00205B"/><rect y="5.5" width="20" height="3" fill="#00205B"/></svg>',
	FI: '<svg viewBox="0 0 20 14"><rect width="20" height="14" fill="#fff"/><rect x="6" width="3" height="14" fill="#003580"/><rect y="5.5" width="20" height="3" fill="#003580"/></svg>',
	IS: '<svg viewBox="0 0 20 14"><rect width="20" height="14" fill="#02529C"/><rect x="5" width="5" height="14" fill="#fff"/><rect y="4.5" width="20" height="5" fill="#fff"/><rect x="6" width="3" height="14" fill="#DC1E35"/><rect y="5.5" width="20" height="3" fill="#DC1E35"/></svg>',
	FO: '<svg viewBox="0 0 20 14"><rect width="20" height="14" fill="#fff"/><rect x="5" width="5" height="14" fill="#0065BD"/><rect y="4.5" width="20" height="5" fill="#0065BD"/><rect x="6" width="3" height="14" fill="#ED2939"/><rect y="5.5" width="20" height="3" fill="#ED2939"/></svg>',
	DE: '<svg viewBox="0 0 20 14"><rect width="20" height="14" fill="#FFCE00"/><rect width="20" height="9.34" fill="#DD0000"/><rect width="20" height="4.67" fill="#000"/></svg>',
	NL: '<svg viewBox="0 0 20 14"><rect width="20" height="14" fill="#21468B"/><rect width="20" height="9.34" fill="#fff"/><rect width="20" height="4.67" fill="#AE1C28"/></svg>',
	BE: '<svg viewBox="0 0 20 14"><rect width="20" height="14" fill="#ED2939"/><rect width="13.34" height="14" fill="#FAE042"/><rect width="6.67" height="14" fill="#000"/></svg>',
	FR: '<svg viewBox="0 0 20 14"><rect width="20" height="14" fill="#EF4135"/><rect width="13.34" height="14" fill="#fff"/><rect width="6.67" height="14" fill="#0055A4"/></svg>',
	GB: '<svg viewBox="0 0 20 14"><rect width="20" height="14" fill="#012169"/><path d="M0 0L20 14M20 0L0 14" stroke="#fff" stroke-width="2.8"/><path d="M0 0L20 14M20 0L0 14" stroke="#C8102E" stroke-width="1.2"/><rect x="7.5" width="5" height="14" fill="#fff"/><rect y="4.5" width="20" height="5" fill="#fff"/><rect x="8.5" width="3" height="14" fill="#C8102E"/><rect y="5.5" width="20" height="3" fill="#C8102E"/></svg>',
	IE: '<svg viewBox="0 0 20 14"><rect width="20" height="14" fill="#FF883E"/><rect width="13.34" height="14" fill="#fff"/><rect width="6.67" height="14" fill="#169B62"/></svg>',
	IT: '<svg viewBox="0 0 20 14"><rect width="20" height="14" fill="#CD212A"/><rect width="13.34" height="14" fill="#fff"/><rect width="6.67" height="14" fill="#008C45"/></svg>',
	ES: '<svg viewBox="0 0 20 14"><rect width="20" height="14" fill="#AA151B"/><rect y="3.5" width="20" height="7" fill="#F1BF00"/></svg>',
	PT: '<svg viewBox="0 0 20 14"><rect width="20" height="14" fill="#FF0000"/><rect width="8" height="14" fill="#006600"/><circle cx="8" cy="7" r="1.9" fill="#FFD700"/></svg>',
	PL: '<svg viewBox="0 0 20 14"><rect width="20" height="14" fill="#DC143C"/><rect width="20" height="7" fill="#fff"/></svg>',
	AT: '<svg viewBox="0 0 20 14"><rect width="20" height="14" fill="#ED2939"/><rect y="4.67" width="20" height="4.67" fill="#fff"/></svg>',
	CH: '<svg viewBox="0 0 20 14"><rect width="20" height="14" fill="#DA291C"/><rect x="8.5" y="3" width="3" height="8" fill="#fff"/><rect x="6" y="5.5" width="8" height="3" fill="#fff"/></svg>',
	US: '<svg viewBox="0 0 20 14"><rect width="20" height="14" fill="#B22234"/><g fill="#fff"><rect y="2" width="20" height="1.08"/><rect y="4.15" width="20" height="1.08"/><rect y="6.3" width="20" height="1.08"/><rect y="8.45" width="20" height="1.08"/><rect y="10.6" width="20" height="1.08"/></g><rect width="9" height="7.54" fill="#3C3B6E"/></svg>'
};

const NAME2CODE = {
	denmark: 'DK', danmark: 'DK', sweden: 'SE', sverige: 'SE', norway: 'NO', norge: 'NO',
	finland: 'FI', suomi: 'FI', iceland: 'IS', island: 'IS', 'faroe islands': 'FO', færøerne: 'FO',
	germany: 'DE', tyskland: 'DE', netherlands: 'NL', holland: 'NL', nederland: 'NL',
	belgium: 'BE', belgien: 'BE', france: 'FR', frankrig: 'FR',
	'united kingdom': 'GB', uk: 'GB', 'great britain': 'GB', england: 'GB', storbritannien: 'GB',
	ireland: 'IE', irland: 'IE', austria: 'AT', østrig: 'AT', switzerland: 'CH', schweiz: 'CH',
	italy: 'IT', italien: 'IT', spain: 'ES', spanien: 'ES', portugal: 'PT',
	poland: 'PL', polen: 'PL', usa: 'US', 'united states': 'US'
};

export function flagCode(country) {
	return country ? (NAME2CODE[country.trim().toLowerCase()] ?? null) : null;
}
export function flagSvg(country) {
	const code = flagCode(country);
	return code ? F[code] : '';
}
