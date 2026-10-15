<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import DateBar from '$lib/components/DateBar.svelte';
	import MarketWidgets from '$lib/components/MarketWidgets.svelte';
	import MonthlyChart from '$lib/components/MonthlyChart.svelte';
	import BreakdownTable from '$lib/components/BreakdownTable.svelte';

	let { data } = $props();
	const pq = $derived(data.pub === 'mapped' ? '?pub=mapped' : '');
</script>

<svelte:head><title>{data.series.name} · {data.publisher} · Product Portal</title></svelte:head>

<AppNav active="product" user={data.user} />

<DateBar
	selected={data.selected}
	range={data.range}
	yearOptions={data.yearOptions}
	quarterOptions={data.quarterOptions}
	monthOptions={data.monthOptions}
/>

<main class="wrap">
	<div class="section-head">
		<h2>
			<a class="crumb" href="/product{pq}">Publishers</a><span class="sep">›</span>
			<a class="crumb" href="/product/{encodeURIComponent(data.publisher)}{pq}">{data.publisher}</a><span class="sep">›</span>{data.series.name}
		</h2>
	</div>

	<MarketWidgets widgets={data.widgets} />

	<MonthlyChart monthly={data.monthly} />

	<BreakdownTable
		title="Customers"
		rows={data.customers}
		leadCols={[{ key: 'name', header: 'Company name', bold: true }, { key: 'owner', header: 'Owner Name' }]}
		yearCols={data.yearCols}
		colNoData={data.colNoData}
		searchPlaceholder="Search customers…"
		emptyText="No customers for this series in this period."
		caption="Revenue for {data.series.name} only · Index = newest vs one year earlier"
	/>

	<BreakdownTable
		title="Products"
		rows={data.products}
		leadCols={[{ key: 'sku', header: 'SKU', bold: true }, { key: 'name', header: 'Name' }]}
		yearCols={data.yearCols}
		colNoData={data.colNoData}
		searchPlaceholder="Search products (SKU or name)…"
		emptyText="No products in this series in this period."
		caption="{data.series.name} products · Index = newest vs one year earlier"
	/>
</main>

<style>
	.wrap { max-width: 1140px; margin: 0 auto; padding: 20px 28px 60px; }
	.section-head { display: flex; align-items: center; gap: 14px; margin: 4px 0 14px; }
	.section-head h2 { font-size: 15px; font-weight: 800; letter-spacing: -0.2px; color: #18181B; margin: 0; white-space: nowrap; }
	.section-head::after { content: ''; flex: 1; height: 1px; background: var(--border); }
	.crumb { color: #B15A12; text-decoration: none; }
	.crumb:hover { text-decoration: underline; }
	.sep { color: #C0AC7C; margin: 0 8px; }
</style>
