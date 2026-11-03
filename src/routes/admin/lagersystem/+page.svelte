<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	// A few things worth trying first to learn the schema. Edit the path freely.
	const PRESETS = [
		{ label: 'List orders', path: '/api/v1/orders' },
		{ label: 'Orders · limit 5', path: '/api/v1/orders?limit=5' },
		{ label: 'Orders · page 1', path: '/api/v1/orders?page=1&limit=25' },
		{ label: 'Orders · pageSize', path: '/api/v1/orders?pageSize=5' },
		{ label: 'Orders · perPage', path: '/api/v1/orders?per_page=5' },
		{ label: 'Stock (needs SKU)', path: '/api/v1/stock?itemNumber=' },
		{ label: 'Users', path: '/api/v1/users' },
		{ label: 'Webhooks', path: '/api/webhooks' },
	];

	let path = $state('/api/v1/orders?limit=5');
	let loading = $state(false);
	let result = $state(null);
	let errText = $state('');

	async function run(p) {
		if (p) path = p;
		loading = true; errText = ''; result = null;
		try {
			const res = await fetch(`/api/lagersystem/probe?path=${encodeURIComponent(path)}`);
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
		Admin-only exploration of the Lagersystem REST API. Calls are made server-side with
		<code>LAGERSYSTEM_API_KEY</code> (the key never reaches the browser). GET and <code>/api/…</code> paths only.
	</p>

	<div class="keychip" class:on={data.hasKey}>
		{data.hasKey ? 'API key configured on this environment' : 'LAGERSYSTEM_API_KEY is NOT set on this environment'}
	</div>

	<div class="presets">
		{#each PRESETS as pr}
			<button class="chip" onclick={() => run(pr.path)} disabled={loading}>{pr.label}</button>
		{/each}
	</div>

	<form class="runner" onsubmit={(e) => { e.preventDefault(); run(); }}>
		<span class="base">https://api.lagersystem.dk</span>
		<input class="path" bind:value={path} placeholder="/api/v1/orders?limit=5" spellcheck="false" />
		<button class="btn primary" type="submit" disabled={loading || !data.hasKey}>{loading ? 'Calling…' : 'Send'}</button>
	</form>

	{#if errText}<div class="banner err">{errText}</div>{/if}

	{#if result}
		<div class="meta-row">
			<span class="pill" class:ok={result.ok} class:bad={!result.ok}>HTTP {result.status ?? '—'}</span>
			{#if result.ms != null}<span class="muted">{result.ms} ms</span>{/if}
			{#if result.contentType}<span class="muted">{result.contentType}</span>{/if}
			<span class="muted tgt">{result.target}</span>
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

	.runner { display: flex; align-items: stretch; gap: 8px; margin-bottom: 16px; }
	.base { display: flex; align-items: center; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; color: #9A8A6A; background: #FBFAF7; border: 1px solid var(--border); border-radius: 9px; padding: 0 10px; white-space: nowrap; }
	.path { flex: 1; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; border: 1px solid var(--border); border-radius: 9px; padding: 9px 11px; }
	.path:focus { outline: none; border-color: var(--accent); }
	.btn { border: 0; border-radius: 9px; padding: 9px 16px; font-weight: 700; font-size: 14px; cursor: pointer; }
	.btn.primary { background: var(--accent); color: #fff; }
	.btn.primary:hover:not(:disabled) { background: var(--accent-hover); }
	.btn:disabled { opacity: .5; cursor: default; }

	.meta-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; font-size: 13px; }
	.pill { font-weight: 800; font-size: 12px; padding: 3px 9px; border-radius: 999px; }
	.pill.ok { background: #DCFCE7; color: #15803D; }
	.pill.bad { background: #FEE2E2; color: #B91C1C; }
	.muted { color: #A1A1AA; }
	.tgt { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; }

	.out { background: #0E1116; color: #E6EDF3; border-radius: 12px; padding: 16px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; line-height: 1.5; overflow: auto; max-height: 70vh; white-space: pre-wrap; word-break: break-word; }

	.banner { padding: 10px 14px; border-radius: 9px; margin-bottom: 12px; font-size: 13px; font-weight: 600; }
	.banner.err { background: #FEE2E2; color: #B91C1C; }
</style>
