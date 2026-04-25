import puppeteer from '@cloudflare/puppeteer';
import { error } from '@sveltejs/kit';
import { getCatalogueByShareToken } from '$lib/db.js';

export async function GET({ params, platform, url }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');

	const catalogue = await getCatalogueByShareToken(db, params.token);
	if (!catalogue) error(404, 'Share link not found');

	const browser = platform?.env?.BROWSER;
	if (!browser) error(500, 'Browser rendering unavailable');

	let instance;
	try {
		instance = await puppeteer.launch(browser);
	} catch (e) {
		error(500, `Failed to launch browser: ${e?.message ?? e}`);
	}

	try {
		const page = await instance.newPage();
		await page.setViewport({ width: 794, height: 1123 });

		// Share route is public — no cookie needed
		const shareUrl = `${url.origin}/share/${params.token}`;
		await page.goto(shareUrl, { waitUntil: 'networkidle0', timeout: 30000 });

		await page.addStyleTag({
			content: `
				* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
				.no-print { display: none !important; }
				.pages-wrap { padding: 0 !important; gap: 0 !important; }
				.a4-page { box-shadow: none !important; }
			`
		});

		const pdf = await page.pdf({
			format: 'A4',
			printBackground: true,
			margin: { top: 0, bottom: 0, left: 0, right: 0 }
		});

		const filename = `${catalogue.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`;
		return new Response(pdf, {
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `attachment; filename="${filename}"`
			}
		});
	} catch (e) {
		if (e?.status) throw e;
		error(500, `PDF generation failed: ${e?.message ?? e}`);
	} finally {
		await instance.close();
	}
}
