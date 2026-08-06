<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import DateBar from '$lib/components/DateBar.svelte';
	import MarketWidgets from '$lib/components/MarketWidgets.svelte';
	import MonthlyChart from '$lib/components/MonthlyChart.svelte';
	import BreakdownTable from '$lib/components/BreakdownTable.svelte';

	let { data } = $props();
</script>

<svelte:head><title>{data.publisher} · Product · Product Portal</title></svelte:head>

<AppNav active="product" user={data.user} />

<DateBar
	selected={data.selected}
	range={data.range}
	yearOptions={data.yearOptions}
	quarterOptions={data.quarterOptions}
	monthOptions={data.monthOptions}
/>

<main class="wrap">
	<div class="head">
		<a class="back" href="/product">← Publishers</a>
		<h1>{data.publisher}</h1>
		<span class="period">{data.periodLabel}</span>
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
		emptyText="No customers for this publisher in this period."
		caption="Revenue for {data.publisher} only · Index = newest vs one year earlier"
	/>

	<BreakdownTable
		title="Products"
		rows={data.products}
		leadCols={[{ key: 'sku', header: 'SKU', bold: true }, { key: 'name', header: 'Name' }]}
		yearCols={data.yearCols}
		colNoData={data.colNoData}
		searchPlaceholder="Search products (SKU or name)…"
		emptyText="No products for this publisher in this period."
		caption="{data.publisher} products · Index = newest vs one year earlier"
	/>
</main>

<style>
	.wrap { max-width: 1140px; margin: 0 auto; padding: 20px 28px 60px; }
	.head { display: flex; align-items: baseline; gap: 14px; margin-bottom: 18px; flex-wrap: wrap; }
	.back { font-size: 13px; font-weight: 700; color: #B15A12; text-decoration: none; }
	.back:hover { text-decoration: underline; }
	.head h1 { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; color: #18181B; margin: 0; }
	.period { font-size: 14px; font-weight: 600; color: #A88B52; }
</style>
