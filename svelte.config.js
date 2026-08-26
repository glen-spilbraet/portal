import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter(),
		// The OAuth token endpoint (/oauth/token) must accept cross-origin
		// application/x-www-form-urlencoded posts from MCP clients (Claude), which
		// SvelteKit's origin-based CSRF check would otherwise block. Disabling it is
		// safe here: the session cookie is SameSite=Lax, so a cross-site POST never
		// carries it and lands unauthenticated — that (not checkOrigin) is the real
		// CSRF defense for the app's form actions.
		csrf: { checkOrigin: false }
	}
};

export default config;
