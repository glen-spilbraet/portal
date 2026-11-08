<script>
	import ReportView from '$lib/components/ReportView.svelte';
	import DateBar from '$lib/components/DateBar.svelte';
	import InitiativesView from '$lib/components/InitiativesView.svelte';
	import { onMount } from 'svelte';
	let { data } = $props();

	// Stats ⟷ Initiatives (only when the report has Initiatives switched on).
	// Initiatives are fetched the first time the pane is opened; #initiatives in
	// the URL opens it directly, so a link can point straight at it.
	let pane = $state('stats');
	let init = $state(/** @type {any} */ (null));
	let initLoading = $state(false);
	let initError = $state('');

	async function loadInit() {
		if (init || initLoading) return;
		initLoading = true; initError = '';
		try {
			const res = await fetch(`/reports/share/${data.token}/initiatives`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			init = await res.json();
		} catch (e) { initError = e instanceof Error ? e.message : String(e); }
		finally { initLoading = false; }
	}
	function openPane(k) {
		pane = k;
		history.replaceState(history.state, '', k === 'initiatives' ? '#initiatives' : location.pathname + location.search);
		if (k === 'initiatives') loadInit();
	}
	onMount(() => { if (data.showInitiatives && location.hash === '#initiatives') openPane('initiatives'); });
</script>

<svelte:head><title>{data.name} — Sales report</title></svelte:head>

{#if data.allowDateFilter && pane === 'stats'}
	<DateBar selected={data.selected} range={data.range} yearOptions={data.yearOptions} quarterOptions={data.quarterOptions} monthOptions={data.monthOptions} />
{/if}

<div class="wrap" class:with-pane={data.showInitiatives}>
	<header class="hero">
		<img class="logo" src="/logo-da.svg" alt="Spilbræt.dk" />
		<div class="hero-txt">
			<h1>{data.name}</h1>
			<p class="sub">
				{#if pane === 'initiatives'}Initiatives · awards, press and events{:else}Sales report · {data.data?.period?.label ?? 'Year to date'}{/if}
			</p>
		</div>
	</header>

	{#if data.showInitiatives}
		<div class="layout">
			<nav class="pane" aria-label="Report sections">
				<button type="button" class:on={pane === 'stats'} aria-current={pane === 'stats' ? 'page' : undefined} onclick={() => openPane('stats')}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 15l4-5 4 3 5-7"/></svg>
					<span>Stats</span>
				</button>
				<button type="button" class:on={pane === 'initiatives'} aria-current={pane === 'initiatives' ? 'page' : undefined} onclick={() => openPane('initiatives')}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/></svg>
					<span>Initiatives</span>
					{#if init}<em>{init.awards.length + init.press.length + init.events.length}</em>{/if}
				</button>
			</nav>
			<section class="content">
				{#if pane === 'stats'}
					<ReportView data={data.data} metric={data.metric} exportBase={`/reports/share/${data.token}/export${data.dateQuery || ''}`} />
				{:else if initLoading}
					<div class="state">Loading initiatives…</div>
				{:else if initError}
					<div class="state">Couldn’t load initiatives. <button type="button" onclick={() => { init = null; loadInit(); }}>Try again</button></div>
				{:else if init}
					<InitiativesView data={init} />
				{/if}
			</section>
		</div>
	{:else}
		<ReportView data={data.data} metric={data.metric} exportBase={`/reports/share/${data.token}/export${data.dateQuery || ''}`} />
	{/if}

	<footer class="foot">Figures are updated live. Shared by Spilbræt.dk.</footer>
</div>

<style>
	:global(body) {
		background:
			radial-gradient(1100px 520px at 100% -5%, rgba(245, 120, 50, 0.20), transparent 60%),
			radial-gradient(900px 480px at 0% 8%, rgba(245, 120, 50, 0.10), transparent 55%),
			linear-gradient(165deg, #FFF4E6 0%, #FBE4C6 48%, #F6D1A6 100%);
		background-attachment: fixed;
		min-height: 100vh;
	}
	.wrap { max-width: 980px; margin: 0 auto; padding: 32px 20px 64px; }
	.wrap.with-pane { max-width: 1180px; }
	.hero { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 26px; }
	.logo { height: 58px; width: auto; }
	.hero-txt { text-align: right; }
	.hero-txt h1 { font-size: 26px; font-weight: 800; color: #18181B; margin: 0; letter-spacing: -0.4px; }
	.sub { font-size: 13px; color: #8a7f6a; margin: 4px 0 0; font-weight: 600; }
	.foot { margin-top: 28px; text-align: center; font-size: 12px; color: #a99f8c; }

	.layout { display: grid; grid-template-columns: 184px minmax(0, 1fr); gap: 24px; align-items: start; }
	.pane { position: sticky; top: 72px; display: flex; flex-direction: column; gap: 6px; background: rgba(255,255,255,.62); border: 1px solid rgba(214,190,150,.45); border-radius: 16px; padding: 8px; backdrop-filter: blur(6px); }
	.pane button { display: flex; align-items: center; gap: 10px; width: 100%; font-family: inherit; font-size: 14px; font-weight: 700; color: #6B6355; background: none; border: none; border-radius: 11px; padding: 10px 12px; cursor: pointer; text-align: left; transition: background .12s, color .12s; }
	.pane button:hover { background: rgba(255,255,255,.85); color: #3F3A31; }
	.pane button.on { background: #18181B; color: #fff; }
	.pane button em { margin-left: auto; font-style: normal; font-size: 11.5px; font-weight: 800; background: rgba(245,120,50,.16); color: #C4581B; border-radius: 100px; padding: 1px 8px; }
	.pane button.on em { background: #F57832; color: #fff; }
	.state { padding: 48px 20px; text-align: center; color: #8a7f6a; font-weight: 600; background: rgba(255,255,255,.7); border-radius: 16px; }
	.state button { font: inherit; color: #C4581B; background: none; border: none; cursor: pointer; text-decoration: underline; }

	@media (max-width: 820px) {
		.layout { grid-template-columns: minmax(0, 1fr); gap: 16px; }
		.pane { position: static; flex-direction: row; padding: 5px; }
		.pane button { justify-content: center; padding: 9px 10px; }
		.pane button em { margin-left: 4px; }
	}
	@media (max-width: 520px) { .hero { flex-direction: column; align-items: flex-start; gap: 12px; } .hero-txt { text-align: left; } }
</style>
