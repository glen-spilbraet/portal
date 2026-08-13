<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	// Grouped admin tools. Each card links to its tool. SVGs are inline
	// lucide-style icons (24×24, stroke = currentColor).
	const sections = [
		{
			title: 'Access & Users',
			blurb: 'Who can sign in, and what they can see.',
			tools: [
				{ title: 'Users', href: '/admin/users', desc: 'Manage who can sign in and their roles.', icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' },
				{ title: 'Permission Sets', href: '/admin/permissions', desc: 'Bundle section access and assign to users.', icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' }
			]
		},
		{
			title: 'Sales & CRM',
			blurb: 'HubSpot and Rackbeat data tools.',
			tools: [
				{ title: 'Targets', href: '/admin/targets', desc: 'Set quarterly sales targets (index goals).', icon: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>' },
				{ title: 'Data Verification', href: '/verify', desc: 'Compare deals and invoices.', icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>' },
				{ title: 'Publisher Mapping', href: '/admin/publishers', desc: 'Map SKU prefixes to publishers.', icon: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>' },
				{ title: 'Phone Numbers', href: '/admin/phone-numbers', desc: 'Normalize numbers by company country.', icon: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>' }
			]
		},
		{
			title: 'Content & Catalog',
			blurb: 'Reusable building blocks and localization.',
			tools: [
				{ title: 'Translations', href: '/translations', desc: 'Edit global UI labels across languages.', icon: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>' },
				{ title: 'Item Library', href: '/admin/item-library', desc: 'Reusable items for sheets and catalogues.', icon: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>' },
				{ title: 'Sheet Data', href: '/admin/sheet-data', desc: 'Manage data products used in sheets.', icon: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>' },
				{ title: 'Migrate Images', href: '/admin/migrate-images', desc: 'Bulk image migration utility.', icon: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>' },
				{ title: 'Analytics', href: '/admin/analytics', desc: 'Catalogue views and engagement.', icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>' }
			]
		}
	];
</script>

<svelte:head><title>Admin · Product Portal</title></svelte:head>

<AppNav active="admin" user={data.user} />

<main class="wrap">
	<div class="head">
		<h1>Admin</h1>
		<p class="sub">Control panel — manage access, sales data, content and insights.</p>
	</div>

	{#each sections as section}
		<section class="group">
			<div class="group-head">
				<h2>{section.title}</h2>
				<span class="group-blurb">{section.blurb}</span>
			</div>
			<div class="grid">
				{#each section.tools as t}
					<a class="tool" href={t.href}>
						<span class="tool-icon">
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								{@html t.icon}
							</svg>
						</span>
						<span class="tool-body">
							<span class="tool-title">{t.title}</span>
							<span class="tool-desc">{t.desc}</span>
						</span>
						<svg class="tool-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
					</a>
				{/each}
			</div>
		</section>
	{/each}
</main>

<style>
	.wrap { max-width: 1140px; margin: 0 auto; padding: 24px 28px 64px; }
	.head { margin-bottom: 22px; }
	.head h1 { font-size: 22px; font-weight: 800; color: #18181B; margin: 0 0 4px; letter-spacing: -0.3px; }
	.sub { font-size: 13px; color: #6b5e4e; margin: 0; }

	.group { margin-bottom: 28px; }
	.group-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; }
	.group-head h2 { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px; color: #B15A12; margin: 0; white-space: nowrap; }
	.group-blurb { font-size: 12px; color: #98876e; }
	.group-head::after { content: ''; flex: 1; height: 1px; background: var(--border); }

	.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }

	.tool {
		display: flex; align-items: center; gap: 14px;
		background: #fff; border: 1px solid var(--border); border-radius: 14px;
		padding: 15px 16px; text-decoration: none; color: inherit;
		transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
	}
	.tool:hover { border-color: #F4CE7A; box-shadow: 0 6px 20px rgba(120, 70, 0, 0.09); transform: translateY(-1px); }

	.tool-icon {
		flex-shrink: 0; width: 40px; height: 40px; border-radius: 11px;
		display: flex; align-items: center; justify-content: center;
		background: #FFF1D6; color: #B15A12;
	}
	.tool-body { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.tool-title { font-size: 14px; font-weight: 800; color: #18181B; letter-spacing: -0.1px; }
	.tool-desc { font-size: 12px; color: #7a6b57; line-height: 1.4; }
	.tool-arrow { flex-shrink: 0; color: #C0AC7C; transition: transform 0.15s, color 0.15s; }
	.tool:hover .tool-arrow { color: var(--accent); transform: translateX(2px); }

	@media (max-width: 900px) { .grid { grid-template-columns: 1fr 1fr; } }
	@media (max-width: 560px) { .grid { grid-template-columns: 1fr; } }
</style>
