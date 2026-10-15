<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import DateBar from '$lib/components/DateBar.svelte';
	import MarketWidgets from '$lib/components/MarketWidgets.svelte';
	import CreditMonthlyChart from '$lib/components/CreditMonthlyChart.svelte';
	import BreakdownTable from '$lib/components/BreakdownTable.svelte';

	let { data } = $props();

	const DIMS = [
		{ key: 'customers', label: 'Customers', lead: [{ key: 'label', header: 'Customer', bold: true }], search: 'Search customers…' },
		{ key: 'owners', label: 'Owners', lead: [{ key: 'label', header: 'Owner', bold: true }], search: 'Search owners…' },
		{ key: 'countries', label: 'Countries', lead: [{ key: 'label', header: 'Country', bold: true }], search: 'Search countries…' },
		{ key: 'publishers', label: 'Publisher', lead: [{ key: 'label', header: 'Publisher', bold: true }], search: 'Search publishers…' },
		{ key: 'products', label: 'Product', lead: [{ key: 'sku', header: 'SKU', bold: true }, { key: 'name', header: 'Name' }], search: 'Search products (SKU or name)…' },
	];
	let dim = $state('customers');
	const active = $derived(DIMS.find((d) => d.key === dim) ?? DIMS[0]);
</script>

<svelte:head><title>Credit Notes · Product Portal</title></svelte:head>

<AppNav active="credit_notes" user={data.user} />

<DateBar
	selected={data.selected}
	range={data.range}
	yearOptions={data.yearOptions}
	quarterOptions={data.quarterOptions}
	monthOptions={data.monthOptions}
/>

<main class="wrap">
	<div class="section-head">
		<h2>Credit Notes</h2>
	</div>

	<MarketWidgets widgets={data.widgets} invert={true} />

	<CreditMonthlyChart monthly={data.monthly} />

	<div class="dim-tabs" role="tablist">
		{#each DIMS as d}
			<button role="tab" class:on={dim === d.key} aria-selected={dim === d.key} onclick={() => (dim = d.key)}>{d.label}</button>
		{/each}
	</div>

	{#key dim}
		<BreakdownTable
			title={active.label}
			rows={data.dims[active.key]}
			leadCols={active.lead}
			yearCols={data.yearCols}
			colNoData={data.colNoData}
			searchPlaceholder={active.search}
			emptyText="No credit notes in this period."
			caption="Credit per {active.label.toLowerCase()} · biggest credits first · Index = this period vs one year earlier (lower is better)"
			invertIndex={true}
			defaultSortDir="asc"
		/>
	{/key}
</main>

<style>
	.wrap { max-width: 1140px; margin: 0 auto; padding: 20px 28px 60px; }
	.section-head { display: flex; align-items: center; gap: 14px; margin: 4px 0 14px; }
	.section-head h2 { font-size: 15px; font-weight: 800; letter-spacing: -0.2px; color: #18181B; margin: 0; white-space: nowrap; }
	.section-head::after { content: ''; flex: 1; height: 1px; background: var(--border); }

	.dim-tabs { display: inline-flex; flex-wrap: wrap; gap: 6px; margin: 20px 0 2px; border: 1px solid var(--border); border-radius: 100px; padding: 4px; background: #fff; }
	.dim-tabs button { border: none; background: none; color: #71717A; font-size: 12.5px; font-weight: 700; font-family: inherit; padding: 6px 14px; border-radius: 100px; cursor: pointer; white-space: nowrap; }
	.dim-tabs button.on { background: #C4381B; color: #fff; }
</style>
