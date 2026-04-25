import puppeteer from '@cloudflare/puppeteer';
import { verifySession } from '$lib/auth.js';
import { error } from '@sveltejs/kit';

export async function GET({ params, cookies, platform, url }) {
	const token = cookies.get('session');
	if (!verifySession(token ?? '', platform?.env?.APP_SECRET ?? 'dev-secret')) {
		error(401, 'Unauthorized');
	}

	const browser = platform?.env?.BROWSER;
	if (!browser) error(500, 'Browser rendering unavailable');

	const lang = url.searchParams.get('lang') ?? 'en';

	const instance = await puppeteer.launch(browser);
	try {
		const page = await instance.newPage();
		await page.setViewport({ width: 794, height: 1123 });

		// Forward the session cookie so the headless browser passes auth
		const sessionToken = cookies.get('session');
		if (sessionToken) {
			await page.setCookie({
				name: 'session',
				value: sessionToken,
				domain: new URL(url.origin).hostname,
				path: '/'
			});
		}

		const previewUrl = `${url.origin}/sheet/${params.id}/preview?lang=${lang}`;
		await page.goto(previewUrl, { waitUntil: 'networkidle0', timeout: 30000 });

		await page.addStyleTag({
			content: `
				* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
				.no-print { display: none !important; }
				.sheet-wrap { padding: 0 !important; margin: 0 !important; }
				.sheet { box-shadow: none !important; }
				.sheet-cta { box-shadow: none !important; }
			`
		});

		const pdf = await page.pdf({
			format: 'A4',
			printBackground: true,
			margin: { top: 0, bottom: 0, left: 0, right: 0 }
		});

		return new Response(pdf, {
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `attachment; filename="sheet-${params.id}.pdf"`
			}
		});
	} finally {
		await instance.close();
	}
}
