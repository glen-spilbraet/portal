<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import DateBar from '$lib/components/DateBar.svelte';
	import MarketWidgets from '$lib/components/MarketWidgets.svelte';
	import MonthlyChart from '$lib/components/MonthlyChart.svelte';
	import BreakdownTable from '$lib/components/BreakdownTable.svelte';

	let { data } = $props();

	const PORTAL = '145052209';
	const companyUrl = (id) => `https://app.hubspot.com/contacts/${PORTAL}/record/0-2/${id}`;

	const DIMS = [
		{ key: 'products',   label: 'Products',            lead: [{ key: 'sku', header: 'SKU', bold: true }, { key: 'name', header: 'Name' }], search: 'Search products (SKU or name)…' },
		{ key: 'pub_sku',    label: 'Publishers (SKU)',    lead: [{ key: 'label', header: 'Publisher', bold: true }], search: 'Search publishers…' },
		{ key: 'pub_mapped', label: 'Publishers (mapped)', lead: [{ key: 'label', header: 'Publisher', bold: true }], search: 'Search publishers…' },
		{ key: 'series',     label: 'Series',              lead: [{ key: 'label', header: 'Series', bold: true }], search: 'Search series…' },
	];
	let dim = $state('products');
	const active = $derived(DIMS.find((d) => d.key === dim) ?? DIMS[0]);
</script>

<svelte:head><title>{data.customer.name} · Customer · Product Portal</title></svelte:head>

<AppNav active="stats" user={data.user} />

<DateBar
	selected={data.selected}
	range={data.range}
	yearOptions={data.yearOptions}
	quarterOptions={data.quarterOptions}
	monthOptions={data.monthOptions}
/>

<main class="wrap">
	<div class="section-head">
		<h2><a class="crumb" href="/">Stats</a><span class="sep">›</span>{data.customer.name}</h2>
	</div>

	<div class="cust-meta">
		<div class="meta-txt">
			{data.customer.owner ?? '—'}{#if data.customer.country} · {data.customer.country}{/if}{#if data.customer.level} · Level: {data.customer.level}{/if}{#if data.customer.group} · {data.customer.group}{/if}
		</div>
		{#if data.id !== 'none'}
			<a class="hs-link" href={companyUrl(data.id)} target="_blank" rel="noopener">View in HubSpot ↗</a>
		{/if}
	</div>

	<MarketWidgets widgets={data.widgets} />

	<MonthlyChart monthly={data.monthly} />

	{#snippet dimHead()}
		<div class="dim-tabs" role="tablist">
			{#each DIMS as d}
				<button class="dim-tab" class:on={dim === d.key} role="tab" aria-selected={dim === d.key} onclick={() => (dim = d.key)}>{d.label}</button>
			{/each}
		</div>
	{/snippet}

	{#key dim}
		<BreakdownTable
			head={dimHead}
			rows={data.dims[active.key]}
			leadCols={active.lead}
			yearCols={data.yearCols}
			colNoData={data.colNoData}
			searchPlaceholder={active.search}
			emptyText="No {active.label.toLowerCase()} for this customer in this period."
			caption="{data.customer.name} · {active.label.toLowerCase()} · Index = newest vs one year earlier"
		/>
	{/key}
</main>

<style>
	.wrap { max-width: 1140px; margin: 0 auto; padding: 20px 28px 60px; }
	.section-head { display: flex; align-items: center; gap: 14px; margin: 4px 0 14px; }
	.section-head h2 { font-size: 15px; font-weight: 800; letter-spacing: -0.2px; color: #18181B; margin: 0; white-space: nowrap; }
	.section-head::after { content: ''; flex: 1; height: 1px; background: var(--border); }
	.crumb { color: #B15A12; text-decoration: none; }
	.crumb:hover { text-decoration: underline; }
	.sep { color: #C0AC7C; margin: 0 8px; }

	.cust-meta { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin: -4px 0 14px; }
	.meta-txt { font-size: 13px; color: #8A7550; font-weight: 600; }
	.hs-link { font-size: 12.5px; font-weight: 700; color: var(--accent); text-decoration: none; white-space: nowrap; border: 1px solid var(--border); padding: 6px 12px; border-radius: 8px; }
	.hs-link:hover { background: #FFF5D2; }

	.dim-tabs { display: flex; flex-wrap: wrap; gap: 4px; flex: 1; min-width: 0; }
	.dim-tab { font-size: 13px; font-weight: 700; color: #6B7280; background: transparent; border: none; padding: 6px 12px; border-radius: 8px; cursor: pointer; white-space: nowrap; font-family: inherit; transition: background 0.12s, color 0.12s; }
	.dim-tab:hover { background: #F4F4F5; color: #18181B; }
	.dim-tab.on { background: #18181B; color: #fff; }
</style>
