<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	// Real endpoints from the OpenAPI spec. Edit freely.
	const PRESETS = [
		{ label: 'Login (key test)',      method: 'GET',  path: '/api/login', body: '' },
		{ label: 'Orders · current',      method: 'GET',  path: '/api/order/list', body: '' },
		{ label: 'Received · 5',          method: 'GET',  path: '/api/order/list/status/RECEIVED?page=1&pagesize=5', body: '' },
		{ label: 'Sent · 5',              method: 'GET',  path: '/api/order/list/status/SENT?page=1&pagesize=5', body: '' },
		{ label: 'Finished · 5',          method: 'GET',  path: '/api/order/list/status/FINISHED?page=1&pagesize=5', body: '' },
		{ label: 'Goods-in list',         method: 'GET',  path: '/api/goodsin/list', body: '' },
		{ label: 'Report: last month (received)', method: 'POST', path: '/api/reports/orders', body: '{\n  "orderPeriod": "lastMonth",\n  "orderCustomperiodType": "date_recived"\n}' },
		{ label: 'Report: last month (done)',     method: 'POST', path: '/api/reports/orders', body: '{\n  "orderPeriod": "lastMonth",\n  "orderCustomperiodType": "date_done"\n}' },
	];

	let method = $state('GET');
	let path = $state('/api/login');
	let bodyText = $state('');
	let loading = $state(false);
	let result = $state(null);
	let errText = $state('');

	function applyPreset(pr) {
		method = pr.method; path = pr.path; bodyText = pr.body;
		run();
	}

	async function run() {
		loading = true; errText = ''; result = null;
		try {
			const res = await fetch('/api/lagersystem/probe', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ method, path, body: method === 'POST' ? bodyText : '' })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) { errText = body?.message || `Probe failed (${res.status})`; return; }
			result = body;
		} catch (e) {
			errText = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	const pretty = (v) => {
		try { return typeof v === 'string' ? v : JSON.stringify(v, null, 2); }
		catch { return String(v); }
	};
</script>

<svelte:head><title>Lagersystem probe — Admin</title></svelte:head>

<AppNav user={data.user} />

<div class="wrap">
	<h1>Lagersystem API probe</h1>
	<p class="sub">
		Admin-only exploration of our Lagersystem instance. Calls are made server-side with
		<code>LAGERSYSTEM_API_KEY</code> (<code>X-APIKEY</code> header; key never reaches the browser).
	</p>

	<div class="keychip" class:on={data.hasKey}>
		{data.hasKey ? 'API key configured on this environment' : 'LAGERSYSTEM_API_KEY is NOT set on this environment'}
	</div>

	<div class="presets">
		{#each PRESETS as pr}
			<button class="chip" onclick={() => applyPreset(pr)} disabled={loading || !data.hasKey}>{pr.label}</button>
		{/each}
	</div>

	<form class="runner" onsubmit={(e) => { e.preventDefault(); run(); }}>
		<select class="method" bind:value={method}>
			<option>GET</option>
			<option>POST</option>
		</select>
		<span class="base">spilbraetdk.lagersystem.dk</span>
		<input class="path" bind:value={path} placeholder="/api/order/list" spellcheck="false" />
		<button class="btn primary" type="submit" disabled={loading || !data.hasKey}>{loading ? 'Calling…' : 'Send'}</button>
	</form>

	{#if method === 'POST'}
		<textarea class="bodybox" bind:value={bodyText} rows="4" spellcheck="false" placeholder="JSON request body (for POST)"></textarea>
	{/if}

	{#if errText}<div class="banner err">{errText}</div>{/if}

	{#if result}
		<div class="meta-row">
			<span class="pill" class:ok={result.ok} class:bad={!result.ok}>HTTP {result.status ?? '—'}</span>
			{#if result.ms != null}<span class="muted">{result.ms} ms</span>{/if}
			{#if result.contentType}<span class="muted">{result.contentType}</span>{/if}
			<span class="muted tgt">{result.method} {result.target}</span>
		</div>
		{#if result.error}<div class="banner err">{result.error}</div>{/if}
		<pre class="out">{pretty(result.body)}</pre>
	{/if}
</div>

<style>
	.wrap { max-width: 1000px; margin: 0 auto; padding: 24px 28px 80px; }
	h1 { font-size: 20px; font-weight: 800; color: #18181B; margin: 0 0 4px; }
	.sub { font-size: 13px; color: #71717A; margin: 0 0 14px; line-height: 1.5; }
	code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; background: #F4F1EA; padding: 1px 5px; border-radius: 5px; }

	.keychip { display: inline-block; font-size: 12px; font-weight: 700; padding: 5px 11px; border-radius: 999px; background: #FEE2E2; color: #B91C1C; margin-bottom: 16px; }
	.keychip.on { background: #DCFCE7; color: #15803D; }

	.presets { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
	.chip { border: 1px solid var(--border); background: #fff; border-radius: 999px; padding: 6px 12px; font-size: 13px; font-weight: 600; color: #3F3F46; cursor: pointer; }
	.chip:hover:not(:disabled) { background: #FAF6EE; }
	.chip:disabled { opacity: .5; cursor: default; }

	.runner { display: flex; align-items: stretch; gap: 8px; margin-bottom: 10px; }
	.method { border: 1px solid var(--border); border-radius: 9px; padding: 0 8px; font-weight: 700; font-size: 13px; background: #fff; }
	.base { display: flex; align-items: center; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; color: #9A8A6A; background: #FBFAF7; border: 1px solid var(--border); border-radius: 9px; padding: 0 10px; white-space: nowrap; }
	.path { flex: 1; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; border: 1px solid var(--border); border-radius: 9px; padding: 9px 11px; }
	.path:focus { outline: none; border-color: var(--accent); }
	.bodybox { width: 100%; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; border: 1px solid var(--border); border-radius: 9px; padding: 9px 11px; margin-bottom: 16px; resize: vertical; }
	.bodybox:focus { outline: none; border-color: var(--accent); }
	.btn { border: 0; border-radius: 9px; padding: 9px 16px; font-weight: 700; font-size: 14px; cursor: pointer; }
	.btn.primary { background: var(--accent); color: #fff; }
	.btn.primary:hover:not(:disabled) { background: var(--accent-hover); }
	.btn:disabled { opacity: .5; cursor: default; }

	.meta-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 6px 0 8px; font-size: 13px; }
	.pill { font-weight: 800; font-size: 12px; padding: 3px 9px; border-radius: 999px; }
	.pill.ok { background: #DCFCE7; color: #15803D; }
	.pill.bad { background: #FEE2E2; color: #B91C1C; }
	.muted { color: #A1A1AA; }
	.tgt { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; }

	.out { background: #0E1116; color: #E6EDF3; border-radius: 12px; padding: 16px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; line-height: 1.5; overflow: auto; max-height: 70vh; white-space: pre-wrap; word-break: break-word; }

	.banner { padding: 10px 14px; border-radius: 9px; margin-bottom: 12px; font-size: 13px; font-weight: 600; }
	.banner.err { background: #FEE2E2; color: #B91C1C; }
</style>
