import puppeteer from '@cloudflare/puppeteer';
import { verifySession } from '$lib/auth.js';
import { error } from '@sveltejs/kit';

export async function GET({ params, cookies, platform, url }) {
	const token = cookies.get('session');
	if (!verifySession(token ?? '', platform?.env?.APP_SECRET ?? 'dev-secret')) {
		error(401, 'Unauthorized');
	}

	const browser = platform?.env?.BROWSER;
	if (!browser) {
		error(500, 'Browser binding not available — ensure Browser Rendering is enabled on your Cloudflare Workers Paid plan.');
	}

	let instance;
	try {
		instance = await puppeteer.launch(browser);
	} catch (e) {
		error(500, `Failed to launch browser: ${e?.message ?? e}`);
	}

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

		const previewUrl = `${url.origin}/catalogues/${params.id}/preview`;
		await page.goto(previewUrl, { waitUntil: 'networkidle0', timeout: 30000 });

		// Verify we didn't land on the login page
		const pageTitle = await page.title();
		if (pageTitle.toLowerCase().includes('sign in') || pageTitle.toLowerCase().includes('login')) {
			error(500, 'Authentication failed — headless browser could not access preview page.');
		}

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

		return new Response(pdf, {
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `attachment; filename="catalogue-${params.id}.pdf"`
			}
		});
	} catch (e) {
		// Re-throw SvelteKit errors as-is
		if (e?.status) throw e;
		error(500, `PDF generation failed: ${e?.message ?? e}`);
	} finally {
		await instance.close();
	}
}
