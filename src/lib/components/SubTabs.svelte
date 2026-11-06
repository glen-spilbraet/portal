<script>
	/**
	 * Page header strip for pages split into sub-pages: page title + tabs on one
	 * full-width bar, placed directly under the date bar (above all content).
	 * Only use it on pages that actually have sub-pages.
	 *
	 * tabs: [{ key, label, icon?, href? }]
	 *   icon — inner SVG markup for a 24×24 stroke icon (see ICONS below), or a
	 *          key of ICONS.
	 *   href — makes the tab a link (separate routes); otherwise it's a button
	 *          that calls onselect(key) (in-page tabs).
	 */
	let { title, tabs = [], active, onselect = undefined } = $props();

	const ICONS = {
		chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 4 3 5-7"/>',
		box_off: '<path d="M21 8l-9-5-3.2 1.8M5.3 5.9 3 8v8l9 5 4.5-2.5M12 12v9M3 8l9 4M21 8v6"/><path d="M3 3l18 18"/>',
		truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
		list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
	};
	const iconSvg = (icon) => {
		const paths = ICONS[icon] ?? icon;
		return paths ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>` : '';
	};
</script>

<div class="subtabs">
	<div class="subtabs-inner">
		<h1 class="st-title">{title}</h1>
		<div class="st-tabs" role="tablist" aria-label="{title} views">
			{#each tabs as t (t.key)}
				{#if t.href}
					<a class="st-tab" class:on={active === t.key} href={t.href} role="tab" aria-selected={active === t.key}>
						{@html iconSvg(t.icon)}<span>{t.label}</span>
					</a>
				{:else}
					<button type="button" class="st-tab" class:on={active === t.key} role="tab" aria-selected={active === t.key} onclick={() => onselect?.(t.key)}>
						{@html iconSvg(t.icon)}<span>{t.label}</span>
					</button>
				{/if}
			{/each}
		</div>
	</div>
</div>

<style>
	.subtabs { background: #fff; border-bottom: 1px solid var(--border); }
	.subtabs-inner { max-width: 1200px; margin: 0 auto; padding: 0 28px; box-sizing: border-box; display: flex; align-items: center; gap: 18px; min-height: 52px; }
	.st-title { font-size: 17px; font-weight: 800; letter-spacing: -0.3px; color: #18181B; margin: 0; padding: 12px 18px 12px 0; border-right: 1px solid var(--border); white-space: nowrap; }
	.st-tabs { display: flex; align-items: center; gap: 6px; overflow-x: auto; scrollbar-width: none; }
	.st-tabs::-webkit-scrollbar { display: none; }
	.st-tab { display: inline-flex; align-items: center; gap: 7px; font-family: inherit; font-size: 13.5px; font-weight: 700; color: #6B6355; background: none; border: none; border-radius: 100px; padding: 7px 13px; cursor: pointer; text-decoration: none; white-space: nowrap; transition: background .12s, color .12s; }
	.st-tab:hover { background: #FBF5E6; color: #524431; }
	.st-tab.on { background: #FFE6A5; color: #7B3803; }
	.st-tab:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(245,120,50,.25); }
	@media (max-width: 640px) {
		.subtabs-inner { padding: 0 16px; gap: 12px; }
		.st-title { font-size: 15px; padding-right: 12px; }
		.st-tab { padding: 6px 10px; font-size: 13px; }
	}
</style>
