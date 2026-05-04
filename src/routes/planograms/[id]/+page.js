// This is a complex interactive SVG editor — disable SSR to avoid
// Cloudflare Workers crashing during server-side rendering of the component.
// The editor always loads its data client-side via onMount anyway.
export const ssr = false;
