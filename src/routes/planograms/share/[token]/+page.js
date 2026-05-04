// Disable SSR for the component — +page.server.js still runs on the server
// to load project data and handle 404s, but the SVG rendering happens
// entirely on the client to avoid Cloudflare Workers crashes.
export const ssr = false;
