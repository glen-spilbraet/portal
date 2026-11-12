<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { goto, invalidateAll } from '$app/navigation';

	let { data } = $props();

	const isOn = $derived(data.settings.until > data.now);
	let hours = $state(24);
	let threshold = $state(data.settings.threshold ?? 500);
	let busy = $state(false);

	async function post(body) {
		busy = true;
		try {
			const res = await fetch('/api/admin/performance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
			if (!res.ok) alert(`Failed (${res.status})`);
			await invalidateAll();
		} finally { busy = false; }
	}
	const start = () => post({ action: 'on', hours, threshold_ms: threshold });
	const stop = () => post({ action: 'off', threshold_ms: threshold });
	const clear = () => confirm('Delete all logged requests?') && post({ action: 'clear' });

	const fmtMs = (ms) => (ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)} s` : `${Math.round(ms)} ms`);
	const nf = new Intl.NumberFormat('en-GB');
	const dt = (ms) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
	const untilText = $derived(isOn ? new Date(data.settings.until).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
	const sev = (ms) => (ms >= 5000 ? 'bad' : ms >= 2000 ? 'warn' : '');

	let tab = $state('pages');
	let sort = $state('slowest');
	const reqs = $derived(sort === 'slowest' ? [...data.requests].sort((a, b) => b.total_ms - a.total_ms) : data.requests);
	let openId = $state(null);
	/** Other logged requests running while this one was. */
	const overlapping = (r) => data.requests.filter((o) => o.id !== r.id && o.started_at < r.started_at + r.total_ms && o.started_at + o.total_ms > r.started_at)
		.sort((a, b) => a.started_at - b.started_at);
	const median = $derived.by(() => { const t = data.requests.map((r) => r.total_ms).sort((a, b) => a - b); return t.length ? t[Math.floor(t.length / 2)] : null; });
	const waitOf = (r) => Math.max(0, (r.query_ms ?? 0) - (r.db_ms ?? 0));
</script>

<svelte:head><title>Performance — Admin</title></svelte:head>
<AppNav active="admin" user={data.user} />

<main>
	<div class="head">
		<div>
			<h1>Performance</h1>
			<p class="sub">Logs slow page loads and API calls with their database queries, so the slowest spots can be found and fixed. Off by default; switches itself off after the chosen time.</p>
		</div>
	</div>

	{#if !data.ready}
		<div class="empty">
			{#if data.noTable}
				<p><strong>Not set up yet.</strong></p>
				<p class="muted">Apply <code>migrations/0114_perf_log.sql</code> to this environment's database.</p>
			{:else}
				<p><strong>Couldn't load the log.</strong></p><p class="muted mono">{data.message}</p>
			{/if}
		</div>
	{:else}
		<section class="ctl" class:on={isOn}>
			<div class="status">
				<span class="dot"></span>
				{#if isOn}<strong>Logging is on</strong> — until {untilText} · requests over {fmtMs(data.settings.threshold)}{#if data.settings.threshold === 0} (all){/if}
				{:else}<strong>Logging is off</strong>{/if}
			</div>
			<div class="controls">
				<label>Log requests slower than
					<select bind:value={threshold} disabled={busy}>
						<option value={0}>All requests</option>
						<option value={300}>0.3 s</option>
						<option value={500}>0.5 s</option>
						<option value={1000}>1 s</option>
						<option value={2000}>2 s</option>
					</select>
				</label>
				<label>for
					<select bind:value={hours} disabled={busy}>
						<option value={1}>1 hour</option>
						<option value={4}>4 hours</option>
						<option value={8}>8 hours</option>
						<option value={24}>24 hours</option>
						<option value={48}>48 hours</option>
					</select>
				</label>
				<button class="primary" onclick={start} disabled={busy}>{isOn ? 'Update' : 'Start logging'}</button>
				{#if isOn}<button class="ghost" onclick={stop} disabled={busy}>Stop</button>{/if}
				{#if data.count}<button class="ghost danger" onclick={clear} disabled={busy}>Clear log</button>{/if}
			</div>
			<p class="note">Each request's time is split into <b>database</b> (the query itself running) and <b>waiting</b> (queued behind other work — D1 runs one query at a time). "All requests" is best for short sessions only.</p>
		</section>

		<div class="bar">
			<div class="chips">
				{#each [['24h', 'Last 24 h'], ['7d', '7 days'], ['14d', '14 days']] as [k, l]}
					<button class:on={data.range === k} onclick={() => goto(`?range=${k}`, { keepFocus: true, noScroll: true })}>{l}</button>
				{/each}
			</div>
			<div class="kpis">
				<span><b>{nf.format(data.count)}</b> requests logged</span>
				{#if median != null}<span>median <b>{fmtMs(median)}</b></span>{/if}
				{#if data.requests.length}<span>slowest <b>{fmtMs(Math.max(...data.requests.map((r) => r.total_ms)))}</b></span>{/if}
			</div>
		</div>

		{#if !data.count}
			<div class="empty"><p><strong>Nothing logged{isOn ? ' yet' : ''}.</strong></p><p class="muted">{isOn ? 'Use the Portal as normal — slow requests show up here within a minute.' : 'Start logging, use the Portal as normal for a while, then come back.'}</p></div>
		{:else}
			<div class="tabs" role="tablist">
				<button role="tab" class:on={tab === 'pages'} onclick={() => (tab = 'pages')}>Pages <span>{data.routes.length}</span></button>
				<button role="tab" class:on={tab === 'requests'} onclick={() => (tab = 'requests')}>Requests <span>{data.requests.length}</span></button>
				<button role="tab" class:on={tab === 'queries'} onclick={() => (tab = 'queries')}>Queries <span>{data.queries.length}</span></button>
			</div>

			{#if tab === 'pages'}
				<div class="card">
					<table>
						<thead><tr><th>Page / API</th><th class="num">Logged</th><th class="num">Median</th><th class="num">Avg</th><th class="num">Slowest</th><th class="num">Queries</th><th class="num">Database</th><th class="num">Waiting</th><th class="num">Total time</th></tr></thead>
						<tbody>
							{#each data.routes as g (g.key)}
								<tr>
									<td class="mono path" title={g.key}>{g.key}</td>
									<td class="num">{g.n}</td>
									<td class="num {sev(g.median)}">{fmtMs(g.median)}</td>
									<td class="num">{fmtMs(g.avg)}</td>
									<td class="num {sev(g.max)}">{fmtMs(g.max)}</td>
									<td class="num">{g.avgQueries}</td>
									<td class="num">{fmtMs(g.avgDb)}</td>
									<td class="num" class:warn={g.avgWait > g.avgDb && g.avgWait > 300}>{fmtMs(g.avgWait)}</td>
									<td class="num"><b>{fmtMs(g.totalMs)}</b></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="hint">Sorted by total time spent (count × duration) — the top rows cost the most overall. Database / Waiting are per request on average.</p>
			{:else if tab === 'requests'}
				<div class="sortbar">
					<button class:on={sort === 'slowest'} onclick={() => (sort = 'slowest')}>Slowest first</button>
					<button class:on={sort === 'newest'} onclick={() => (sort = 'newest')}>Newest first</button>
				</div>
				<div class="card">
					<table>
						<thead><tr><th>When</th><th>Request</th><th>User</th><th class="num">Time</th><th class="num">Queries</th><th class="num">Database</th><th class="num">Waiting</th></tr></thead>
						<tbody>
							{#each reqs as r (r.id)}
								<tr class="click" class:open={openId === r.id} onclick={() => (openId = openId === r.id ? null : r.id)}>
									<td class="nowrap muted">{dt(r.started_at)}</td>
									<td class="mono path" title={r.path}>{r.method} {r.path}{#if r.status >= 400} <span class="st">{r.status}</span>{/if}</td>
									<td class="muted user">{r.user_email ?? '—'}</td>
									<td class="num {sev(r.total_ms)}"><b>{fmtMs(r.total_ms)}</b></td>
									<td class="num">{r.query_count}</td>
									<td class="num">{fmtMs(r.db_ms)}</td>
									<td class="num" class:warn={waitOf(r) > 300}>{fmtMs(waitOf(r))}</td>
								</tr>
								{#if openId === r.id}
									{@const ov = overlapping(r)}
									<tr class="detail"><td colspan="7">
										<div class="dgrid">
											<div>
												<h4>Slowest queries in this request</h4>
												{#if r.queries.length}
													<table class="inner">
														<thead><tr><th>Query</th><th class="num">Runs</th><th class="num">Time</th><th class="num">Database</th><th class="num">Rows read</th></tr></thead>
														<tbody>
															{#each r.queries as q}
																<tr><td class="mono sql" title={q.sql}><span class="dbtag">{q.db === 'SALES_DB' ? 'sales' : 'app'}</span>{q.sql}</td><td class="num">{q.n}</td><td class="num {sev(q.ms)}">{fmtMs(q.ms)}</td><td class="num">{q.dbMs ? fmtMs(q.dbMs) : '—'}</td><td class="num">{q.rows ? nf.format(q.rows) : '—'}</td></tr>
															{/each}
														</tbody>
													</table>
												{:else}<p class="muted">No database queries — the time went elsewhere (external API, rendering).</p>{/if}
											</div>
											<div>
												<h4>Running at the same moment</h4>
												{#if ov.length}
													<ul class="ov">
														{#each ov as o (o.id)}<li><span class="mono">{o.method} {o.route ?? o.path}</span> <b class={sev(o.total_ms)}>{fmtMs(o.total_ms)}</b> <span class="muted">{o.user_email ?? ''}</span></li>{/each}
													</ul>
												{:else}<p class="muted">No other logged request overlapped{data.settings.threshold > 0 ? ' (only requests over the threshold are logged)' : ''}.</p>{/if}
											</div>
										</div>
									</td></tr>
								{/if}
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="card">
					<table>
						<thead><tr><th>Query</th><th class="num">Runs</th><th class="num">Avg</th><th class="num">Avg database</th><th class="num">Slowest</th><th class="num">Avg rows read</th><th class="num">Total time</th></tr></thead>
						<tbody>
							{#each data.queries as q}
								<tr>
									<td class="mono sql" title={q.sql}>
										<span class="dbtag">{q.db === 'SALES_DB' ? 'sales' : 'app'}</span>{q.sql}
										<div class="used">{q.routes.join(' · ')}</div>
									</td>
									<td class="num">{nf.format(q.runs)}</td>
									<td class="num {sev(q.avgMs)}">{fmtMs(q.avgMs)}</td>
									<td class="num">{fmtMs(q.avgDbMs)}</td>
									<td class="num {sev(q.maxMs)}">{fmtMs(q.maxMs)}</td>
									<td class="num">{nf.format(q.avgRows)}</td>
									<td class="num"><b>{fmtMs(q.totalMs)}</b></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="hint">From the slowest queries of each logged request. A high "Avg rows read" usually means a missing index; Avg much higher than Avg database means it mostly waited for other work.</p>
			{/if}
		{/if}
	{/if}
</main>

<style>
	main { max-width: 1280px; margin: 0 auto; width: 100%; padding: 28px 28px 80px; box-sizing: border-box; }
	.head h1 { font-size: 26px; font-weight: 800; color: #18181B; letter-spacing: -0.5px; margin: 0 0 4px; }
	.sub { font-size: 14px; color: #A89060; margin: 0 0 18px; max-width: 760px; }
	.empty { border: 1px dashed var(--border); border-radius: 14px; padding: 36px; text-align: center; background: #FBFAF7; margin-bottom: 18px; }
	.empty p { margin: 4px 0; }
	.muted { color: #9A8A6A; font-size: 12.5px; }
	.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; }
	code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; background: #F4F1EA; padding: 1px 5px; border-radius: 5px; }

	.ctl { background: #fff; border: 1px solid var(--border); border-radius: 14px; padding: 14px 16px; margin-bottom: 16px; }
	.ctl.on { border-color: #86C99E; background: #F6FCF8; }
	.status { display: flex; align-items: center; gap: 8px; font-size: 14px; color: #3F3A31; flex-wrap: wrap; }
	.dot { width: 9px; height: 9px; border-radius: 50%; background: #C4B998; }
	.ctl.on .dot { background: #22A35A; box-shadow: 0 0 0 4px rgba(34,163,90,.15); }
	.controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
	.controls label { font-size: 13px; font-weight: 700; color: #524431; display: inline-flex; align-items: center; gap: 6px; }
	.controls select { padding: 6px 8px; border: 1px solid var(--border); border-radius: 8px; font-family: inherit; font-size: 13px; background: #fff; }
	.note { font-size: 12px; color: #9A8A6A; margin: 10px 0 0; }
	button.primary, button.ghost { font-family: inherit; font-size: 13px; font-weight: 700; border-radius: 9px; padding: 7px 14px; cursor: pointer; }
	.primary { background: #F57832; color: #fff; border: none; }
	.ghost { background: #fff; border: 1px solid var(--border); color: #18181B; }
	.ghost.danger { color: #dc2626; border-color: #fecaca; }
	button:disabled { opacity: .55; cursor: default; }

	.bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
	.chips, .sortbar, .tabs { display: flex; gap: 6px; flex-wrap: wrap; }
	.chips button, .sortbar button { font-family: inherit; font-size: 12.5px; font-weight: 700; color: #6B6355; background: #fff; border: 1px solid var(--border); border-radius: 100px; padding: 5px 12px; cursor: pointer; }
	.chips button.on, .sortbar button.on { background: #18181B; color: #fff; border-color: #18181B; }
	.kpis { display: flex; gap: 16px; font-size: 13px; color: #6B6355; }
	.tabs { border-bottom: 1px solid var(--border); margin-bottom: 12px; gap: 2px; }
	.tabs button { font-family: inherit; font-size: 13.5px; font-weight: 700; color: #6B6355; background: none; border: none; border-bottom: 2px solid transparent; padding: 8px 12px; cursor: pointer; margin-bottom: -1px; }
	.tabs button span { font-size: 11.5px; color: #A89060; margin-left: 4px; }
	.tabs button.on { color: #7B3803; border-bottom-color: #F57832; }
	.sortbar { margin-bottom: 10px; }

	.card { background: #fff; border: 1px solid var(--border); border-radius: 12px; overflow-x: auto; }
	table { width: 100%; border-collapse: collapse; font-size: 13px; }
	th { text-align: left; font-size: 11.5px; font-weight: 800; color: #7B3803; background: #FBEFCB; padding: 8px 10px; white-space: nowrap; }
	td { padding: 7px 10px; border-top: 1px solid #F5EDD8; vertical-align: top; }
	.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
	.nowrap { white-space: nowrap; }
	.path { max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.user { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.sql { max-width: 640px; word-break: break-word; }
	.used { font-size: 11px; color: #A89060; margin-top: 3px; font-family: inherit; }
	.dbtag { display: inline-block; font-size: 10px; font-weight: 800; color: #6B6355; background: #F4F1EA; border-radius: 4px; padding: 0 5px; margin-right: 6px; font-family: inherit; }
	.warn { color: #B45309; font-weight: 700; }
	.bad { color: #dc2626; font-weight: 800; }
	.st { font-size: 10.5px; font-weight: 800; color: #dc2626; }
	tr.click { cursor: pointer; }
	tr.click:hover td, tr.open td { background: #FFFBF0; }
	tr.detail td { background: #FFFDF7; padding: 12px 14px 16px; }
	.dgrid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 18px; }
	h4 { margin: 0 0 8px; font-size: 12.5px; font-weight: 800; color: #3F3A31; }
	.inner th { background: #F8F3E6; }
	.ov { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; }
	.hint { font-size: 12px; color: #9A8A6A; margin: 8px 2px 0; }
	@media (max-width: 860px) { .dgrid { grid-template-columns: 1fr; } }
</style>
