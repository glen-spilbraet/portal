<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	const dkkFmt = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 0 });
	const numFmt = new Intl.NumberFormat('da-DK');

	function formatDkk(n) {
		return dkkFmt.format(Math.round(n ?? 0)) + ' kr';
	}
	function formatPct(pct) {
		if (pct === null || pct === undefined) return null;
		const sign = pct >= 0 ? '+' : '−';
		return `${sign}${Math.abs(pct).toFixed(1)}%`;
	}
	function dataAsOf(meta) {
		if (!meta?.last_run) return null;
		const d = new Date(meta.last_run);
		if (isNaN(d)) return meta.last_run;
		return d.toLocaleString('da-DK', { dateStyle: 'medium', timeStyle: 'short' });
	}
</script>

<svelte:head><title>Sales Stats · Product Portal</title></svelte:head>

<AppNav active="stats" user={data.user} />

<main class="wrap">
	<header class="page-head">
		<div>
			<h1>Sales Stats</h1>
			<p class="sub">
				Revenue by market · <strong>{data.periodLabel}</strong>
				{#if !data.isAdmin}<span class="scope">· your accounts</span>{/if}
			</p>
		</div>

		<div class="periods">
			{#each data.periods as pr}
				<a
					href="?period={pr.key}"
					class="period-btn"
					class:active={data.selected === pr.key}
					data-sveltekit-noscroll
				>{pr.label}</a>
			{/each}
		</div>
	</header>

	<section class="grid">
		{#each data.widgets as w (w.key)}
			<div class="card" class:total={w.key === 'total'}>
				<div class="card-label">{w.label}</div>
				<div class="card-value">{formatDkk(w.dkk)}</div>
				<div class="card-foot">
					<span class="deals">{numFmt.format(w.deals)} deals</span>
					{#if w.pct !== null}
						<span class="yoy" class:up={w.pct >= 0} class:down={w.pct < 0}>
							<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
								{#if w.pct >= 0}<polyline points="6 15 12 9 18 15" />{:else}<polyline points="6 9 12 15 18 9" />{/if}
							</svg>
							{formatPct(w.pct)}
						</span>
					{:else}
						<span class="yoy flat">— no prior</span>
					{/if}
				</div>
				{#if w.index !== null}
					<div class="index-line">Index {w.index} <span class="vs">vs {data.priorLabel}</span></div>
				{/if}
			</div>
		{/each}
	</section>

	{#if dataAsOf(data.meta)}
		<p class="freshness">Data synced from HubSpot · last updated {dataAsOf(data.meta)}</p>
	{/if}
</main>

<style>
	.wrap {
		max-width: 1140px;
		margin: 0 auto;
		padding: 28px;
	}

	.page-head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 20px;
		flex-wrap: wrap;
		margin-bottom: 22px;
	}
	h1 {
		font-size: 24px;
		font-weight: 800;
		letter-spacing: -0.4px;
		color: #18181B;
		margin: 0;
	}
	.sub {
		font-size: 14px;
		color: #8A7550;
		margin: 4px 0 0;
	}
	.sub strong { color: #7B3803; font-weight: 700; }
	.scope { color: #A1A1AA; }

	.periods {
		display: flex;
		gap: 4px;
		background: #fff;
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 4px;
	}
	.period-btn {
		padding: 6px 14px;
		border-radius: 7px;
		font-size: 13px;
		font-weight: 700;
		color: #8A7550;
		text-decoration: none;
		transition: background 0.12s, color 0.12s;
		white-space: nowrap;
	}
	.period-btn:hover { background: #FFF5D2; color: #7B3803; }
	.period-btn.active { background: #FFE6A5; color: #7B3803; }

	.grid {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 14px;
	}
	@media (max-width: 900px) {
		.grid { grid-template-columns: repeat(2, 1fr); }
	}
	@media (max-width: 520px) {
		.grid { grid-template-columns: 1fr; }
	}

	.card {
		background: #fff;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow);
		padding: 18px 18px 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	.card.total {
		background: linear-gradient(135deg, #FFF6E2, #FFE9BE);
		border-color: #F4CE7A;
	}

	.card-label {
		font-size: 12px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		color: #A88B52;
	}
	.card.total .card-label { color: #B15A12; }

	.card-value {
		font-size: 21px;
		font-weight: 800;
		letter-spacing: -0.6px;
		color: #18181B;
		line-height: 1.1;
	}
	.card.total .card-value { color: #7B3803; }

	.card-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-top: 2px;
	}
	.deals { font-size: 12px; color: #A1A1AA; font-weight: 600; }

	.yoy {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		font-size: 12px;
		font-weight: 800;
		padding: 2px 7px 2px 5px;
		border-radius: 100px;
	}
	.yoy.up   { background: #E7F6EC; color: #16794C; }
	.yoy.down { background: #FDECEC; color: #C4381B; }
	.yoy.flat { background: #F4F4F5; color: #A1A1AA; font-weight: 700; padding: 2px 8px; }

	.index-line {
		font-size: 11px;
		font-weight: 700;
		color: #8A7550;
	}
	.index-line .vs { color: #C0AC7C; font-weight: 600; }

	.freshness {
		margin-top: 18px;
		font-size: 12px;
		color: #A1A1AA;
	}
</style>
