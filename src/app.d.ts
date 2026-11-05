// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Error {
			message: string;
			/** Short id of the error_log row, shown on the error page. */
			ref?: string;
		}
		interface Platform {
			env: {
				DB: import('@cloudflare/workers-types').D1Database;
				SALES_DB: import('@cloudflare/workers-types').D1Database;
				IMAGES: import('@cloudflare/workers-types').R2Bucket;
				PHOTOS: import('@cloudflare/workers-types').R2Bucket;
				APP_PASSWORD: string;
				APP_SECRET: string;
				RACKBEAT_API_KEY?: string;
				HUBSPOT_TOKEN?: string;
				/** Bearer key the B2B shop uses for GET /api/shop/products. */
				SHOP_FEED_KEY?: string;
			};
		}
	}
}

export {};
