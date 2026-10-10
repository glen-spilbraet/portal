<script>
	import ReportView from '$lib/components/ReportView.svelte';
	import DateBar from '$lib/components/DateBar.svelte';
	let { data } = $props();
</script>

<svelte:head><title>{data.name} — Sales report</title></svelte:head>

{#if data.allowDateFilter}
	<DateBar selected={data.selected} range={data.range} yearOptions={data.yearOptions} quarterOptions={data.quarterOptions} monthOptions={data.monthOptions} />
{/if}

<div class="wrap">
	<header class="hero">
		<img class="logo" src="/logo-da.svg" alt="Spilbræt.dk" />
		<div class="hero-txt">
			<h1>{data.name}</h1>
			<p class="sub">Sales report · {data.data?.period?.label ?? 'Year to date'}</p>
		</div>
	</header>

	<ReportView data={data.data} metric={data.metric} />

	<footer class="foot">Figures are updated live. Shared by Spilbræt.dk.</footer>
</div>

<style>
	:global(body) { background: #F4F1EC; }
	.wrap { max-width: 980px; margin: 0 auto; padding: 28px 20px 60px; }
	.hero { display: flex; align-items: center; gap: 18px; margin-bottom: 22px; padding-bottom: 20px; border-bottom: 2px solid #F57832; }
	.logo { height: 40px; width: auto; }
	.hero-txt h1 { font-size: 24px; font-weight: 800; color: #18181B; margin: 0; letter-spacing: -0.4px; }
	.sub { font-size: 13px; color: #8a7f6a; margin: 3px 0 0; font-weight: 600; }
	.foot { margin-top: 26px; text-align: center; font-size: 12px; color: #a99f8c; }
	@media (max-width: 520px) { .hero { flex-direction: column; align-items: flex-start; gap: 10px; } }
</style>
