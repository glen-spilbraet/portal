<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import DateBar from '$lib/components/DateBar.svelte';
	import MarketWidgets from '$lib/components/MarketWidgets.svelte';
	import CreditMonthlyChart from '$lib/components/CreditMonthlyChart.svelte';
	import BreakdownTable from '$lib/components/BreakdownTable.svelte';

	let { data } = $props();
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
	<p class="intro">Credit notes only (returns &amp; corrections). Amounts are negative; a <strong>lower</strong> index than last year is good (fewer/smaller credits).</p>

	<MarketWidgets widgets={data.widgets} invert={true} />

	<CreditMonthlyChart monthly={data.monthly} />

	<BreakdownTable
		title="Customers"
		rows={data.customers}
		leadCols={[{ key: 'label', header: 'Customer', bold: true }]}
		yearCols={data.yearCols}
		colNoData={data.colNoData}
		searchPlaceholder="Search customers…"
		emptyText="No credit notes in this period."
		caption="Credit per customer · biggest credits first · Index = this period vs one year earlier (lower is better)"
		invertIndex={true}
		defaultSortDir="asc"
	/>

	<BreakdownTable
		title="Owners"
		rows={data.owners}
		leadCols={[{ key: 'label', header: 'Owner', bold: true }]}
		yearCols={data.yearCols}
		colNoData={data.colNoData}
		searchPlaceholder="Search owners…"
		emptyText="No credit notes in this period."
		caption="Credit per owner · Index = this period vs one year earlier (lower is better)"
		invertIndex={true}
		defaultSortDir="asc"
	/>

	<BreakdownTable
		title="Countries"
		rows={data.countries}
		leadCols={[{ key: 'label', header: 'Country', bold: true }]}
		yearCols={data.yearCols}
		colNoData={data.colNoData}
		searchPlaceholder="Search countries…"
		emptyText="No credit notes in this period."
		caption="Credit per country · Index = this period vs one year earlier (lower is better)"
		invertIndex={true}
		defaultSortDir="asc"
	/>
</main>

<style>
	.wrap { max-width: 1140px; margin: 0 auto; padding: 20px 28px 60px; }
	.section-head { display: flex; align-items: center; gap: 14px; margin: 4px 0 10px; }
	.section-head h2 { font-size: 15px; font-weight: 800; letter-spacing: -0.2px; color: #18181B; margin: 0; white-space: nowrap; }
	.section-head::after { content: ''; flex: 1; height: 1px; background: var(--border); }
	.intro { font-size: 13px; color: #8A7550; margin: 0 0 14px; }
	.intro strong { color: #C4381B; }
</style>
