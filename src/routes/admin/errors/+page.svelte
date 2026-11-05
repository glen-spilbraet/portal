<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { goto, invalidateAll } from '$app/navigation';

	let { data } = $props();

	const SOURCES = [
		{ v: '', label: 'All' },
		{ v: 'server', label: 'Server' },
		{ v: 'client', label: 'Browser' },
		{ v: 'retry', label: 'DB retries' },
	];
	const RANGES = [{ v: '24h', label: '24 hours' }, { v: '7d', label: '7 days' }, { v: '30d', label: '30 days' }];

	function nav(patch) {
		const p = new URLSearchParams({ range: data.range, source: data.source, resolved: data.showResolved ? '1' : '', ...patch });
		for (const [k, v] of [...p]) if (!v) p.delete(k);
		goto(`?${p}`, { keepFocus: true, noScroll: true });
	}

	let refInput = $state(data.ref ?? '');
	let openFp = $state('');
	let detail = $state(/** @type {any[]} */ ([]));
	let loadingDetail = $state(false);

	async function toggle(fp) {
		if (openFp === fp) { openFp = ''; return; }
		openFp = fp; detail = []; loadingDetail = true;
		try {
			const r = await fetch(`/api/admin/errors?fingerprint=${encodeURIComponent(fp)}`).then((x) => x.json());
			detail = r.rows ?? [];
		} finally { loadingDetail = false; }
	}
	async function setResolved(fp, resolved) {
		await fetch('/api/admin/errors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fingerprint: fp, resolved }) });
		await invalidateAll();
	}

	// Stored times are UTC ("YYYY-MM-DD HH:MM:SS") → local, compact.
	const fmt = (s) => {
		if (!s) return '';
		const d = new Date(s.replace(' ', 'T') + 'Z');
		return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
	};
	const ago = (s) => {
		if (!s) return '';
		const m = Math.round((Date.now() - new Date(s.replace(' ', 'T') + 'Z').getTime()) / 60000);
		if (m < 1) return 'just now';
		if (m < 60) return `${m} min ago`;
		if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
		return `${Math.round(m / 1440)} days ago`;
	};
	const srcLabel = { server: 'Server', client: 'Browser', retry: 'DB retry' };

	// Plain-text block to paste to Claude / a colleague.
	let copied = $state('');
	async function copyFor(g) {
		const l = g.latest ?? {};
		const rows = openFp === g.fingerprint ? detail : [];
		const text = [
			`Portal error (${srcLabel[l.source] ?? l.source}) — ${g.n}× between ${g.first_at} and ${g.last_at} UTC, ${g.users} user(s)`,
			`Route: ${l.route ?? '-'}   Path: ${l.method ?? ''} ${l.path ?? '-'}   Status: ${l.status ?? '-'}`,
			`Message: ${l.message ?? ''}`,
			l.ref ? `Reference: ${l.ref}` : '',
			'',
			l.stack ? `Stack:\n${l.stack}` : '',
			rows.length ? `\nRecent occurrences:\n${rows.slice(0, 10).map((r) => `  ${r.at}  ${r.user_email ?? 'anonymous'}  ${r.path ?? ''}`).join('\n')}` : '',
		].filter((x) => x !== '').join('\n');
		try { await navigator.clipboard.writeText(text); copied = g.fingerprint; setTimeout(() => (copied = ''), 1500); } catch { /* ignore */ }
	}
</script>

<svelte:head><title>Error Log — Admin</title></svelte:head>

<AppNav user={data.user} active="errors" />

<main>
	<div class="section-head"><h2>Error Log</h2></div>

	{#if !data.ready}
		<div class="empty">
			{#if data.noTable}
				<p><strong>Not set up yet.</strong></p>
				<p class="muted">Apply <code>migrations/0105_error_log.sql</code> to this environment's database to start recording errors.</p>
			{:else}
				<p><strong>Couldn’t load the error log.</strong></p>
				<p class="muted mono">{data.message}</p>
			{/if}
		</div>
	{:else}
		<div class="kpis">
			<div class="kpi"><span class="k">Server errors · 24 h</span><span class="v" class:bad={data.last24.server}>{data.last24.server ?? 0}</span></div>
			<div class="kpi"><span class="k">Browser errors · 24 h</span><span class="v" class:bad={data.last24.client}>{data.last24.client ?? 0}</span></div>
			<div class="kpi"><span class="k">DB retries · 24 h</span><span class="v">{data.last24.retry ?? 0}</span></div>
		</div>

		<div class="bar">
			<div class="dim-tabs">
				{#each SOURCES as s}<button class="dim-tab" class:on={data.source === s.v} onclick={() => nav({ source: s.v })}>{s.label}</button>{/each}
			</div>
			<select value={data.range} onchange={(e) => nav({ range: e.currentTarget.value })}>
				{#each RANGES as r}<option value={r.v}>{r.label}</option>{/each}
			</select>
			<label class="chk"><input type="checkbox" checked={data.showResolved} onchange={(e) => nav({ resolved: e.currentTarget.checked ? '1' : '' })} /> Show resolved</label>
			<form class="ref" onsubmit={(e) => { e.preventDefault(); nav({ ref: refInput.trim() }); }}>
				<input placeholder="Reference, e.g. k3f9x2" bind:value={refInput} />
				{#if data.ref}<button type="button" class="link" onclick={() => { refInput = ''; nav({ ref: '' }); }}>Clear</button>{/if}
			</form>
		</div>

		{#if !data.groups.length}
			<div class="empty"><p><strong>No errors</strong> {data.ref ? 'for that reference' : 'in this period'}. 🎉</p></div>
		{:else}
			<div class="list">
				{#each data.groups as g (g.fingerprint)}
					{@const l = g.latest ?? {}}
					<div class="grp" class:open={openFp === g.fingerprint}>
						<button class="row" onclick={() => toggle(g.fingerprint)}>
							<span class="src {l.source}">{srcLabel[l.source] ?? l.source}</span>
							<span class="main">
								<span class="msg">{l.message ?? '—'}</span>
								<span class="where mono">{l.route ?? l.path ?? ''}{#if l.status} · {l.status}{/if}</span>
							</span>
							<span class="n" title="Occurrences">{g.n}×</span>
							<span class="when" title="Last seen {fmt(g.last_at)} · first seen {fmt(g.first_at)}">{ago(g.last_at)}</span>
						</button>
						{#if openFp === g.fingerprint}
							<div class="body">
								<div class="meta">
									<span><b>First</b> {fmt(g.first_at)}</span>
									<span><b>Last</b> {fmt(g.last_at)}</span>
									<span><b>Users</b> {g.users}</span>
									<span><b>Path</b> <span class="mono">{l.method} {l.path}</span></span>
								</div>
								{#if l.stack}<pre>{l.stack}</pre>{/if}
								<div class="occ-head">Recent occurrences</div>
								{#if loadingDetail}<p class="muted">Loading…</p>{:else}
									<table>
										<tbody>
											{#each detail as r}
												<tr><td>{fmt(r.at)}</td><td>{r.user_email ?? 'anonymous'}</td><td class="mono">{r.path}</td><td>{r.ref ?? ''}</td></tr>
											{/each}
										</tbody>
									</table>
								{/if}
								<div class="actions">
									<button class="btn" onclick={() => copyFor(g)}>{copied === g.fingerprint ? 'Copied!' : 'Copy details'}</button>
									{#if g.open === 0}
										<button class="btn primary" onclick={() => setResolved(g.fingerprint, true)}>Mark resolved</button>
									{:else}
										<button class="btn" onclick={() => setResolved(g.fingerprint, false)}>Reopen</button>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
		<p class="hint">Same errors are grouped. “Mark resolved” hides a group until it happens again. Times are local.</p>
	{/if}
</main>

<style>
	main { max-width: 1200px; margin: 0 auto; width: 100%; padding: 28px 28px 80px; box-sizing: border-box; }
	.section-head { display: flex; align-items: center; gap: 14px; margin: 4px 0 18px; }
	.section-head h2 { font-size: 15px; font-weight: 800; letter-spacing: -0.2px; color: #18181B; margin: 0; white-space: nowrap; }
	.section-head::after { content: ''; flex: 1; height: 1px; background: var(--border); }
	.empty { border: 1px dashed var(--border); border-radius: var(--radius-lg); padding: 36px; text-align: center; background: #FBFAF7; margin-bottom: 18px; }
	.muted { color: #9A8A6A; font-size: 13px; }
	.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; }
	code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; background: #F4F1EA; padding: 1px 5px; border-radius: 5px; }

	.kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
	.kpi { background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
	.kpi .k { font-size: 12px; font-weight: 700; color: #6B7280; }
	.kpi .v { font-size: 24px; font-weight: 900; color: #18181B; }
	.kpi .v.bad { color: #DC2626; }
	@media (max-width: 640px) { .kpis { grid-template-columns: 1fr; } main { padding: 20px 16px 60px; } }

	.bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
	.dim-tabs { display: flex; gap: 4px; flex: 1; min-width: 0; flex-wrap: wrap; }
	.dim-tab { font-family: inherit; font-size: 13px; font-weight: 700; color: #6B7280; background: transparent; border: none; padding: 6px 12px; border-radius: 8px; cursor: pointer; }
	.dim-tab:hover { background: #F4F4F5; color: #18181B; }
	.dim-tab.on { background: #18181B; color: #fff; }
	select, .ref input { font-family: inherit; font-size: 13px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 8px; background: #fff; }
	.ref { display: flex; align-items: center; gap: 6px; }
	.ref input { width: 190px; }
	.chk { font-size: 13px; color: #52525B; display: inline-flex; align-items: center; gap: 6px; }
	.link { background: none; border: 0; color: var(--accent); font-weight: 700; cursor: pointer; font-family: inherit; font-size: 13px; }

	.list { display: flex; flex-direction: column; gap: 6px; }
	.grp { background: #fff; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
	.grp.open { border-color: #d4d4d8; box-shadow: 0 2px 10px rgba(0,0,0,.04); }
	.row { width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: none; border: 0; cursor: pointer; text-align: left; font-family: inherit; }
	.row:hover { background: #FAFAF9; }
	.src { flex: none; font-size: 11px; font-weight: 800; border-radius: 100px; padding: 2px 9px; background: #F4F4F5; color: #52525B; }
	.src.server { background: #FEE2E2; color: #B91C1C; }
	.src.client { background: #FEF3C7; color: #92400E; }
	.src.retry { background: #E0E7FF; color: #3730A3; }
	.main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
	.msg { font-size: 13.5px; font-weight: 700; color: #18181B; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.where { color: #71717A; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.n { flex: none; font-weight: 800; font-size: 13px; color: #18181B; }
	.when { flex: none; font-size: 12px; color: #71717A; width: 88px; text-align: right; }
	.body { padding: 4px 14px 14px; border-top: 1px solid #F4F4F5; }
	.meta { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 12.5px; color: #52525B; margin: 10px 0; }
	.meta b { color: #18181B; margin-right: 4px; }
	pre { background: #18181B; color: #E4E4E7; font-size: 11.5px; line-height: 1.5; padding: 12px; border-radius: 8px; overflow-x: auto; max-height: 320px; margin: 0 0 12px; white-space: pre-wrap; word-break: break-word; }
	.occ-head { font-size: 12px; font-weight: 800; color: #6B7280; margin-bottom: 4px; }
	table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
	td { padding: 5px 8px 5px 0; border-bottom: 1px solid #F4F4F5; vertical-align: top; }
	td.mono { word-break: break-all; }
	.actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
	.btn { font-family: inherit; font-size: 13px; font-weight: 700; border: 1px solid var(--border); background: #fff; border-radius: 8px; padding: 7px 12px; cursor: pointer; color: #18181B; }
	.btn.primary { background: #18181B; color: #fff; border-color: #18181B; }
	.hint { font-size: 12px; color: #9A8A6A; margin-top: 14px; }
</style>
