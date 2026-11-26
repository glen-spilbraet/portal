/**
 * Guru tender — shared texts for the guru-facing page and e-mail.
 * Language follows the venue's country: Denmark → da, Sweden → sv,
 * Norway → no, anything else → en. Safe for server + client.
 */

/** @param {string|null|undefined} country venue country (English name; legacy codes tolerated) */
export function tenderLang(country) {
	const c = String(country ?? '').trim().toLowerCase();
	if (['denmark', 'danmark', 'dk'].includes(c)) return 'da';
	if (['sweden', 'sverige', 'se'].includes(c)) return 'sv';
	if (['norway', 'norge', 'no'].includes(c)) return 'no';
	return 'en';
}

export const TENDER_LOCALE = { da: 'da-DK', sv: 'sv-SE', no: 'nb-NO', en: 'en-GB' };
export const TENDER_LANG_NAME = { da: 'Danish', sv: 'Swedish', no: 'Norwegian', en: 'English' };

/** @type {Record<string, Record<string, string>>} */
export const T = {
	da: {
		tag: 'Game Guru-forespørgsel',
		hi: 'Hej {name} 👋',
		lead: 'Vi søger Game Gurus til dette event. Først til mølle — vælg en ledig plads herunder.',
		leadSingle: 'Vil du være Game Guru til dette event?',
		general: 'Game Guru',
		spotsLeft: '{n} af {total} ledige',
		full: 'Optaget',
		take: 'Tag pladsen',
		booked: 'Du er booket som guru{label} — tak! 🎉 Vi kontakter dig med detaljer.',
		bookedSingle: 'Du er med — tak! 🎉 Vi kontakter dig med detaljer.',
		cancel: 'Jeg kan alligevel ikke',
		cancelConfirm: 'Vil du melde fra? Din plads bliver ledig for andre.',
		decline: 'Jeg kan ikke denne gang',
		declined: 'Tak fordi du gav besked — måske næste gang.',
		changed: 'Har du ombestemt dig? Tag en ledig plads herunder.',
		allFull: 'Alle pladser er besat — tak for din interesse!',
		gone: 'Øv — den plads blev lige taget. Vælg en anden.',
		yesSingle: 'Ja, jeg vil være guru',
		noSingle: 'Jeg kan ikke',
		error: 'Noget gik galt — prøv igen.',
		subject: 'Gurus søges: {title}',
		mailIntro: 'Vi søger Game Gurus til {title}. Det er først til mølle — se de ledige pladser og tag en med ét klik.',
		mailOpenings: 'Ledige pladser',
		mailSpots: '{n} plads(er)',
		mailCta: 'Se og tag en plads',
		mailOutro: 'Kan du ikke? Så kan du melde fra via samme link.',
	},
	sv: {
		tag: 'Game Guru-förfrågan',
		hi: 'Hej {name} 👋',
		lead: 'Vi söker Game Gurus till det här eventet. Först till kvarn — välj en ledig plats nedan.',
		leadSingle: 'Vill du vara Game Guru på det här eventet?',
		general: 'Game Guru',
		spotsLeft: '{n} av {total} lediga',
		full: 'Fullt',
		take: 'Ta platsen',
		booked: 'Du är bokad som guru{label} — tack! 🎉 Vi hör av oss med detaljer.',
		bookedSingle: 'Du är med — tack! 🎉 Vi hör av oss med detaljer.',
		cancel: 'Jag kan inte ändå',
		cancelConfirm: 'Vill du avboka? Din plats blir ledig för andra.',
		decline: 'Jag kan inte den här gången',
		declined: 'Tack för att du hörde av dig — kanske nästa gång.',
		changed: 'Har du ändrat dig? Ta en ledig plats nedan.',
		allFull: 'Alla platser är tagna — tack för ditt intresse!',
		gone: 'Tyvärr — den platsen togs precis. Välj en annan.',
		yesSingle: 'Ja, jag vill vara guru',
		noSingle: 'Jag kan inte',
		error: 'Något gick fel — försök igen.',
		subject: 'Gurus sökes: {title}',
		mailIntro: 'Vi söker Game Gurus till {title}. Först till kvarn — se de lediga platserna och ta en med ett klick.',
		mailOpenings: 'Lediga platser',
		mailSpots: '{n} plats(er)',
		mailCta: 'Se och ta en plats',
		mailOutro: 'Kan du inte? Då kan du tacka nej via samma länk.',
	},
	no: {
		tag: 'Game Guru-forespørsel',
		hi: 'Hei {name} 👋',
		lead: 'Vi søker Game Gurus til dette eventet. Førstemann til mølla — velg en ledig plass nedenfor.',
		leadSingle: 'Vil du være Game Guru på dette eventet?',
		general: 'Game Guru',
		spotsLeft: '{n} av {total} ledige',
		full: 'Opptatt',
		take: 'Ta plassen',
		booked: 'Du er booket som guru{label} — takk! 🎉 Vi tar kontakt med detaljer.',
		bookedSingle: 'Du er med — takk! 🎉 Vi tar kontakt med detaljer.',
		cancel: 'Jeg kan likevel ikke',
		cancelConfirm: 'Vil du melde deg av? Plassen din blir ledig for andre.',
		decline: 'Jeg kan ikke denne gangen',
		declined: 'Takk for beskjed — kanskje neste gang.',
		changed: 'Har du ombestemt deg? Ta en ledig plass nedenfor.',
		allFull: 'Alle plasser er tatt — takk for interessen!',
		gone: 'Beklager — den plassen ble akkurat tatt. Velg en annen.',
		yesSingle: 'Ja, jeg vil være guru',
		noSingle: 'Jeg kan ikke',
		error: 'Noe gikk galt — prøv igjen.',
		subject: 'Gurus søkes: {title}',
		mailIntro: 'Vi søker Game Gurus til {title}. Førstemann til mølla — se de ledige plassene og ta en med ett klikk.',
		mailOpenings: 'Ledige plasser',
		mailSpots: '{n} plass(er)',
		mailCta: 'Se og ta en plass',
		mailOutro: 'Kan du ikke? Da kan du melde fra via samme lenke.',
	},
	en: {
		tag: 'Game Guru request',
		hi: 'Hi {name} 👋',
		lead: 'We’re looking for Game Gurus for this event. First come, first served — pick an open spot below.',
		leadSingle: 'Would you like to be a Game Guru for this event?',
		general: 'Game Guru',
		spotsLeft: '{n} of {total} open',
		full: 'Taken',
		take: 'Take this spot',
		booked: 'You’re booked as a guru{label} — thanks! 🎉 We’ll be in touch with details.',
		bookedSingle: 'You’re in — thanks! 🎉 We’ll be in touch with details.',
		cancel: 'I can’t make it after all',
		cancelConfirm: 'Cancel your spot? It will open up for others.',
		decline: 'I can’t make it this time',
		declined: 'Thanks for letting us know — maybe next time.',
		changed: 'Changed your mind? Take an open spot below.',
		allFull: 'All spots are taken — thanks for your interest!',
		gone: 'Sorry — that spot was just taken. Please pick another.',
		yesSingle: 'Yes, I’ll be a guru',
		noSingle: 'Can’t make it',
		error: 'Something went wrong — please try again.',
		subject: 'Gurus wanted: {title}',
		mailIntro: 'We’re looking for Game Gurus for {title}. First come, first served — see the open spots and take one with a single click.',
		mailOpenings: 'Open spots',
		mailSpots: '{n} spot(s)',
		mailCta: 'See and take a spot',
		mailOutro: 'Can’t make it? You can decline via the same link.',
	},
};

/** Translate with {placeholders}. */
export function tt(lang, key, vars = {}) {
	const s = (T[lang] ?? T.en)[key] ?? T.en[key] ?? key;
	return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

/** "20 Nov 2026" / "20–22 Nov 2026" style range in the tender language. */
export function tenderWhen(lang, e) {
	const loc = TENDER_LOCALE[lang] ?? 'en-GB';
	const fmt = (d, opts) => { try { return new Date(d + 'T00:00:00').toLocaleDateString(loc, opts); } catch { return d; } };
	if (!e.event_date) return '';
	const full = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
	let out = fmt(e.event_date, full);
	if (e.end_date && e.end_date !== e.event_date) out += ' – ' + fmt(e.end_date, full);
	const t = [e.start_time, e.end_time].filter(Boolean).join('–');
	return t ? `${out} · ${t}` : out;
}
