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
	:global(body) { background: linear-gradient(165deg, #FCFAF6 0%, #F1ECE3 55%, #ECE6DB 100%); background-attachment: fixed; min-height: 100vh; }
	.wrap { max-width: 980px; margin: 0 auto; padding: 32px 20px 64px; }
	.hero { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 26px; }
	.logo { height: 58px; width: auto; }
	.hero-txt { text-align: right; }
	.hero-txt h1 { font-size: 26px; font-weight: 800; color: #18181B; margin: 0; letter-spacing: -0.4px; }
	.sub { font-size: 13px; color: #8a7f6a; margin: 4px 0 0; font-weight: 600; }
	.foot { margin-top: 28px; text-align: center; font-size: 12px; color: #a99f8c; }
	@media (max-width: 520px) { .hero { flex-direction: column; align-items: flex-start; gap: 12px; } .hero-txt { text-align: left; } }
</style>
