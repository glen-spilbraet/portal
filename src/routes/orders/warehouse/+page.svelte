<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	const SITES = { 1: 'DK', 2: 'SE', 3: 'NO' };
	const GRAINS = [
		{ key: 'orders', label: 'Orders' },
		{ key: 'lines', label: 'Lines' },
		{ key: 'units', label: 'Units' },
	];
	let grain = $state('orders');

	// ── Day axis ────────────────────────────────────────────────────────────────
	const days = $derived.by(() => {
		const out = [];
		if (!data.from || !data.to) return out;
		let d = new Date(data.from + 'T00:00:00Z');
		const end = new Date(data.to + 'T00:00:00Z');
		let guard = 0;
		while (d <= end && guard++ < 400) {
			out.push(d.toISOString().slice(0, 10));
			d.setUTCDate(d.getUTCDate() + 1);
		}
		return out;
	});

	// ── Aggregate rows → per-day totals (active grain), summed across sites ─────
	function byDay(rows) {
		const m = new Map();
		for (const r of rows ?? []) m.set(r.d, (m.get(r.d) ?? 0) + (Number(r[grain]) || 0));
		return m;
	}
	const inboundByDay = $derived(byDay(data.inbound));
	const handledByDay = $derived(byDay(data.handled));

	const series = $derived(days.map((d) => ({
		d,
		inbound: inboundByDay.get(d) ?? 0,
		handled: handledByDay.get(d) ?? 0,
	})));
	const maxVal = $derived(Math.max(1, ...series.map((p) => Math.max(p.inbound, p.handled))));

	// ── Totals + per-site split (active grain) ──────────────────────────────────
	function sum(rows) {
		return (rows ?? []).reduce((s, r) => s + (Number(r[grain]) || 0), 0);
	}
	function bySite(rows) {
		const m = { 1: 0, 2: 0, 3: 0 };
		for (const r of rows ?? []) if (m[r.site] != null) m[r.site] += Number(r[grain]) || 0;
		return m;
	}
	const inboundTotal = $derived(sum(data.inbound));
	const handledTotal = $derived(sum(data.handled));
	const inboundSite = $derived(bySite(data.inbound));
	const handledSite = $derived(bySite(data.handled));

	// ── Top customers (handled, active grain) ───────────────────────────────────
	const topCustomers = $derived(
		[...(data.customers ?? [])]
			.map((c) => ({ name: c.name, site: c.site, value: Number(c[grain]) || 0 }))
			.sort((a, b) => b.value - a.value)
			.slice(0, 12)
	);
	const customerMax = $derived(Math.max(1, ...topCustomers.map((c) => c.value)));

	const nf = new Intl.NumberFormat('en-US');
	const fmt = (n) => nf.format(Math.round(n || 0));

	// Chart geometry (fluid viewBox).
	const VB_W = 1000, VB_H = 260, PAD_L = 8, PAD_R = 8, PAD_T = 12, PAD_B = 26;
	const innerW = VB_W - PAD_L - PAD_R;
	const innerH = VB_H - PAD_T - PAD_B;
	const groupW = $derived(series.length ? innerW / series.length : innerW);
	const barW = $derived(Math.max(1.5, Math.min(14, groupW / 2 - 1.5)));
	const y = (v) => PAD_T + innerH - (v / maxVal) * innerH;

	// Sparse x labels (≈8 ticks).
	const xTicks = $derived.by(() => {
		const n = series.length;
		if (!n) return [];
		const step = Math.max(1, Math.round(n / 8));
		const out = [];
		for (let i = 0; i < n; i += step) out.push(i);
		if (out[out.length - 1] !== n - 1) out.push(n - 1);
		return out;
	});
	const shortDay = (d) => d?.slice(5); // MM-DD

	function presetRange(daysBack) {
		const to = new Date();
		const from = new Date();
		from.setUTCDate(from.getUTCDate() - (daysBack - 1));
		return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
	}
</script>

<svelte:head><title>Warehouse — Orders</title></svelte:head>

<AppNav user={data.user} active="warehouse" />

<main>
	<header class="head">
		<div>
			<h1>Warehouse</h1>
			<p class="sub">Inbound (orders received) vs handled (picked &amp; shipped), from the Lagersystem mirror.</p>
		</div>
		{#if data.meta?.last_run}
			<span class="fresh" title="Last sync from Lagersystem">
				synced {new Date(data.meta.last_run).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
			</span>
		{/if}
	</header>

	{#if !data.ready}
		<div class="empty">
			<p><strong>No warehouse data yet.</strong></p>
			{#if data.reason === 'no-table'}
				<p class="muted">The <code>wms_orders</code> tables aren’t created on this environment yet — apply migration <code>0099_wms_orders.sql</code>, then run the <code>lagersystem-sync</code> worker.</p>
			{:else}
				<p class="muted">Database unavailable.</p>
			{/if}
		</div>
	{:else}
		<!-- Controls -->
		<form class="controls" method="GET">
			<div class="grain">
				{#each GRAINS as g}
					<button type="button" class="seg" class:on={grain === g.key} onclick={() => (grain = g.key)}>{g.label}</button>
				{/each}
			</div>
			<div class="spacer"></div>
			<div class="dates">
				<label>From <input type="date" name="from" value={data.from} max={data.to} /></label>
				<label>To <input type="date" name="to" value={data.to} min={data.from} /></label>
				<button type="submit" class="apply">Apply</button>
			</div>
			<div class="presets">
				{#each [[7, '7d'], [30, '30d'], [90, '90d']] as [n, lbl]}
					{@const r = presetRange(n)}
					<a class="preset" href={`?from=${r.from}&to=${r.to}`}>{lbl}</a>
				{/each}
			</div>
		</form>

		<!-- KPI row -->
		<div class="kpis">
			<div class="kpi inbound">
				<span class="k-label">Inbound</span>
				<span class="k-val">{fmt(inboundTotal)}</span>
				<span class="k-sites">DK {fmt(inboundSite[1])} · SE {fmt(inboundSite[2])} · NO {fmt(inboundSite[3])}</span>
			</div>
			<div class="kpi handled">
				<span class="k-label">Handled</span>
				<span class="k-val">{fmt(handledTotal)}</span>
				<span class="k-sites">DK {fmt(handledSite[1])} · SE {fmt(handledSite[2])} · NO {fmt(handledSite[3])}</span>
			</div>
			<div class="kpi net">
				<span class="k-label">Net (in − handled)</span>
				<span class="k-val" class:pos={inboundTotal - handledTotal > 0}>{inboundTotal - handledTotal > 0 ? '+' : ''}{fmt(inboundTotal - handledTotal)}</span>
				<span class="k-sites">{grain} across {days.length} days</span>
			</div>
		</div>

		<!-- Time series -->
		<section class="card">
			<div class="legend">
				<span class="lg"><i class="sw in"></i> Inbound</span>
				<span class="lg"><i class="sw hd"></i> Handled</span>
			</div>
			<svg class="chart" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" role="img" aria-label="Inbound vs handled over time">
				<!-- baseline -->
				<line x1={PAD_L} y1={PAD_T + innerH} x2={VB_W - PAD_R} y2={PAD_T + innerH} class="axis" />
				{#each series as p, i}
					{@const gx = PAD_L + i * groupW}
					{@const cx = gx + groupW / 2}
					<rect x={cx - barW - 0.75} y={y(p.inbound)} width={barW} height={PAD_T + innerH - y(p.inbound)} class="bar in" rx="1">
						<title>{p.d} · inbound {fmt(p.inbound)}</title>
					</rect>
					<rect x={cx + 0.75} y={y(p.handled)} width={barW} height={PAD_T + innerH - y(p.handled)} class="bar hd" rx="1">
						<title>{p.d} · handled {fmt(p.handled)}</title>
					</rect>
				{/each}
				{#each xTicks as i}
					<text x={PAD_L + i * groupW + groupW / 2} y={VB_H - 8} class="xlab" text-anchor="middle">{shortDay(series[i]?.d)}</text>
				{/each}
			</svg>
		</section>

		<!-- Top customers -->
		<section class="card">
			<h2>Top customers <span class="muted">· handled · {grain}</span></h2>
			{#if topCustomers.length === 0}
				<p class="muted">No handled orders in this range.</p>
			{:else}
				<div class="bars">
					{#each topCustomers as c}
						<div class="row">
							<span class="name" title={c.name}>{c.name}</span>
							<span class="site-tag">{SITES[c.site] ?? '—'}</span>
							<span class="track"><span class="fill" style={`width:${(c.value / customerMax) * 100}%`}></span></span>
							<span class="val">{fmt(c.value)}</span>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</main>

<style>
	main { max-width: 1200px; margin: 0 auto; width: 100%; padding: 28px 28px 80px; box-sizing: border-box; }
	.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
	h1 { font-size: 22px; font-weight: 800; color: #18181B; margin: 0; }
	.sub { font-size: 13px; color: #71717A; margin: 4px 0 0; }
	.fresh { font-size: 12px; color: #9A8A6A; background: #FBFAF7; border: 1px solid var(--border); border-radius: 999px; padding: 4px 11px; white-space: nowrap; }

	.empty { border: 1px dashed var(--border); border-radius: var(--radius-lg); padding: 40px; text-align: center; background: #FBFAF7; }
	.empty .muted { font-size: 13px; }
	code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; background: #F4F1EA; padding: 1px 5px; border-radius: 5px; }

	.controls { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 18px; }
	.grain { display: inline-flex; background: #F4F1EA; border-radius: 10px; padding: 3px; }
	.seg { border: 0; background: transparent; padding: 6px 14px; font-size: 13px; font-weight: 700; color: #6B6355; border-radius: 8px; cursor: pointer; }
	.seg.on { background: #fff; color: #18181B; box-shadow: var(--shadow); }
	.spacer { flex: 1; }
	.dates { display: flex; align-items: end; gap: 8px; }
	.dates label { font-size: 11px; font-weight: 700; color: #9A8A6A; text-transform: uppercase; letter-spacing: .04em; display: flex; flex-direction: column; gap: 3px; }
	.dates input { font-size: 13px; border: 1px solid var(--border); border-radius: 9px; padding: 7px 9px; font-family: inherit; }
	.apply { background: var(--accent); color: #fff; border: 0; border-radius: 9px; padding: 8px 16px; font-weight: 700; font-size: 13px; cursor: pointer; align-self: stretch; }
	.apply:hover { background: var(--accent-hover); }
	.presets { display: inline-flex; gap: 6px; }
	.preset { font-size: 12px; font-weight: 700; color: #6B6355; background: #fff; border: 1px solid var(--border); border-radius: 999px; padding: 6px 11px; text-decoration: none; }
	.preset:hover { background: #FAF6EE; }

	.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 18px; }
	.kpi { border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px 18px; background: #fff; display: flex; flex-direction: column; gap: 4px; }
	.kpi.inbound { border-left: 4px solid #3B82F6; }
	.kpi.handled { border-left: 4px solid var(--accent); }
	.kpi.net { border-left: 4px solid #D4CBB8; }
	.k-label { font-size: 12px; font-weight: 700; color: #9A8A6A; text-transform: uppercase; letter-spacing: .04em; }
	.k-val { font-size: 30px; font-weight: 800; color: #18181B; line-height: 1.1; }
	.k-val.pos { color: #2563EB; }
	.k-sites { font-size: 12px; color: #8A8276; }

	.card { border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 18px; background: #fff; margin-bottom: 18px; }
	.card h2 { font-size: 14px; font-weight: 800; color: #18181B; margin: 0 0 14px; }
	.muted { color: #9A8A6A; font-weight: 500; }

	.legend { display: flex; gap: 18px; margin-bottom: 8px; }
	.lg { font-size: 12px; font-weight: 700; color: #6B6355; display: inline-flex; align-items: center; gap: 6px; }
	.sw { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
	.sw.in { background: #3B82F6; }
	.sw.hd { background: var(--accent); }

	.chart { width: 100%; height: 260px; display: block; }
	.chart .axis { stroke: #ECD9A0; stroke-width: 1; }
	.chart .bar.in { fill: #3B82F6; }
	.chart .bar.hd { fill: var(--accent); }
	.chart .bar:hover { opacity: .8; }
	.chart .xlab { font-size: 11px; fill: #A89C84; }

	.bars { display: flex; flex-direction: column; gap: 8px; }
	.row { display: grid; grid-template-columns: minmax(120px, 1.6fr) 34px 1fr 64px; align-items: center; gap: 10px; }
	.name { font-size: 13px; color: #3F3F46; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.site-tag { font-size: 11px; font-weight: 700; color: #6B6355; background: #F4F1EA; border-radius: 6px; padding: 2px 0; text-align: center; }
	.track { background: #F4F1EA; border-radius: 6px; height: 14px; overflow: hidden; }
	.fill { display: block; height: 100%; background: var(--accent); border-radius: 6px; }
	.val { font-size: 13px; font-weight: 700; color: #18181B; text-align: right; }

	@media (max-width: 720px) {
		.kpis { grid-template-columns: 1fr; }
		.controls { gap: 10px; }
		.spacer { display: none; }
	}
</style>
