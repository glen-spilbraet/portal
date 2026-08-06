<script>
	import OrderList from '$lib/components/OrderList.svelte';

	let { company, ranges, periodLabel, priorLabel, onClose } = $props();

	const PORTAL = '145052209';
	const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const dkk = new Intl.NumberFormat('da-DK');

	let loading = $state(true);
	let err = $state('');
	let detail = $state(null);

	$effect(() => {
		const p = new URLSearchParams({
			id: company.cid,
			curStart: ranges.curStart,
			curEnd: ranges.curEnd,
			priorStart: ranges.priorStart,
			priorEnd: ranges.priorEnd,
			year: String(ranges.year),
		});
		loading = true;
		err = '';
		detail = null;
		fetch(`/api/stats/company?${p}`)
			.then((r) => { if (!r.ok) throw new Error('Could not load customer details'); return r.json(); })
			.then((d) => { detail = d; })
			.catch((e) => { err = e.message; })
			.finally(() => { loading = false; });
	});

	const fdkk = (n) => dkk.format(Math.round(n || 0)) + ' kr';
	const pct = (c, p) => (p > 0 ? (c / p - 1) * 100 : null);
	const fpct = (p) => (p == null ? '–' : (p >= 0 ? '+' : '−') + Math.abs(p).toFixed(1) + '%');

	const chartMax = $derived(detail ? Math.max(1, ...detail.monthly.flatMap((m) => [m.cur, m.prev])) : 1);
	const barH = (v) => Math.max(v > 0 ? 3 : 0, (v / chartMax) * 150);
	const companyUrl = (id) => `https://app.hubspot.com/contacts/${PORTAL}/record/0-2/${id}`;

	const revPct = $derived(detail ? pct(detail.tiles.curRevenue, detail.tiles.priorRevenue) : null);
	const ordPct = $derived(detail ? pct(detail.tiles.curOrders, detail.tiles.priorOrders) : null);
	const aovCur = $derived(detail && detail.tiles.curOrders > 0 ? detail.tiles.curRevenue / detail.tiles.curOrders : 0);
	const aovPrior = $derived(detail && detail.tiles.priorOrders > 0 ? detail.tiles.priorRevenue / detail.tiles.priorOrders : 0);
	const aovPct = $derived(detail ? pct(aovCur, aovPrior) : null);

	function onKey(e) { if (e.key === 'Escape') onClose(); }
</script>

<svelte:window onkeydown={onKey} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="ov" onclick={onClose}></div>
<div class="modal" role="dialog" aria-modal="true" aria-label="Customer details">
	<button class="close" onclick={onClose} aria-label="Close">✕</button>

	<div class="cm-head">
		<div>
			<div class="cm-name">{company.name}</div>
			<div class="cm-sub">
				{company.owner ?? '—'}{#if detail?.company?.country} · {detail.company.country}{/if}{#if detail?.company?.level} · Level: {detail.company.level}{/if}
			</div>
		</div>
		{#if company.cid !== 'none'}
			<a class="cm-hs" href={companyUrl(company.cid)} target="_blank" rel="noopener">View in HubSpot ↗</a>
		{/if}
	</div>

	{#if loading}
		<div class="state">Loading…</div>
	{:else if err}
		<div class="state err">{err}</div>
	{:else if detail}
		<div class="tiles">
			<div class="tile">
				<div class="t-label">Revenue · {periodLabel}</div>
				<div class="t-value">{fdkk(detail.tiles.curRevenue)}</div>
				<div class="t-delta" class:up={revPct >= 0} class:down={revPct != null && revPct < 0}>
					{fpct(revPct)} <span>vs {priorLabel}</span>
				</div>
			</div>
			<div class="tile">
				<div class="t-label">Orders · {periodLabel}</div>
				<div class="t-value">{dkk.format(detail.tiles.curOrders)}</div>
				<div class="t-delta" class:up={ordPct >= 0} class:down={ordPct != null && ordPct < 0}>
					{fpct(ordPct)} <span>vs {dkk.format(detail.tiles.priorOrders)} last period</span>
				</div>
			</div>
			<div class="tile">
				<div class="t-label">Avg. order value · {periodLabel}</div>
				<div class="t-value">{fdkk(aovCur)}</div>
				<div class="t-delta" class:up={aovPct >= 0} class:down={aovPct != null && aovPct < 0}>
					{fpct(aovPct)} <span>vs {priorLabel}</span>
				</div>
			</div>
		</div>

		<div class="cm-section">
			<div class="cm-section-head">
				<span class="cm-title">Revenue by month · {detail.year}</span>
				<div class="legend">
					<span class="lg"><span class="sw sw-prev"></span>{detail.year - 1}</span>
					<span class="lg"><span class="sw sw-cur"></span>{detail.year}</span>
				</div>
			</div>
			<div class="chart">
				{#each detail.monthly as m (m.month)}
					<div class="mcol">
						<div class="bars">
							<div class="bar prev" style="height:{barH(m.prev)}px" title="{detail.year - 1}: {fdkk(m.prev)}"></div>
							<div class="bar cur" style="height:{barH(m.cur)}px" title="{detail.year}: {fdkk(m.cur)}"></div>
						</div>
						<div class="mlabel">{MONTHS[m.month - 1]}</div>
					</div>
				{/each}
			</div>
		</div>

		<div class="cm-section orders-wrap">
			<div class="ocol">
				<div class="cm-section-head"><span class="cm-title">Orders · {periodLabel}</span><span class="cm-count">{detail.ordersCur.length}</span></div>
				<OrderList orders={detail.ordersCur} portal={PORTAL} />
			</div>
			<div class="ocol">
				<div class="cm-section-head"><span class="cm-title">Orders · {priorLabel}</span><span class="cm-count">{detail.ordersPrev.length}</span></div>
				<OrderList orders={detail.ordersPrev} portal={PORTAL} />
			</div>
		</div>
	{/if}
</div>

<style>
	.ov { position: fixed; inset: 0; background: rgba(30, 20, 0, 0.35); backdrop-filter: blur(2px); z-index: 300; }
	.modal {
		position: fixed; z-index: 301; top: 50%; left: 50%; transform: translate(-50%, -50%);
		width: min(780px, calc(100vw - 32px)); max-height: calc(100vh - 48px); overflow-y: auto;
		background: #fff; border: 1px solid var(--border); border-radius: 18px;
		box-shadow: 0 24px 60px rgba(60, 30, 0, 0.28);
	}
	.close {
		position: absolute; top: 14px; right: 14px; z-index: 2;
		width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--border);
		background: #fff; color: #8A7550; font-size: 14px; font-weight: 800; cursor: pointer;
	}
	.close:hover { background: #FFF5D2; color: #7B3803; }

	.cm-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 20px 22px; border-bottom: 1px solid var(--border); }
	.cm-name { font-size: 19px; font-weight: 800; letter-spacing: -0.3px; color: #18181B; }
	.cm-sub { font-size: 12.5px; color: #8A7550; margin-top: 3px; font-weight: 600; }
	.cm-hs { font-size: 12.5px; font-weight: 700; color: var(--accent); text-decoration: none; white-space: nowrap; border: 1px solid var(--border); padding: 7px 12px; border-radius: 8px; margin-right: 34px; }
	.cm-hs:hover { background: #FFF5D2; }

	.state { padding: 40px; text-align: center; color: #8A7550; font-weight: 600; }
	.state.err { color: var(--danger); }

	.tiles { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; padding: 18px 22px; border-bottom: 1px solid var(--border); }
	.tile { background: #FFFBEF; border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; }
	.t-label { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; color: #A88B52; }
	.t-value { font-size: 23px; font-weight: 800; letter-spacing: -0.5px; margin: 5px 0 6px; color: #18181B; }
	.t-delta { font-size: 12.5px; font-weight: 800; color: #A1A1AA; }
	.t-delta span { font-weight: 600; color: #A88B52; }
	.t-delta.up { color: #16794C; }
	.t-delta.down { color: #C4381B; }

	.cm-section { padding: 18px 22px; border-bottom: 1px solid var(--border); }
	.cm-section:last-child { border-bottom: none; }
	.cm-section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
	.cm-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #8A7550; }
	.cm-count { font-size: 12px; font-weight: 700; color: #A88B52; background: #FFF5D2; padding: 1px 8px; border-radius: 100px; }
	.legend { display: flex; gap: 14px; font-size: 12px; font-weight: 700; color: #8A7550; }
	.lg { display: flex; align-items: center; gap: 5px; }
	.sw { width: 11px; height: 11px; border-radius: 3px; display: inline-block; }
	.sw-prev { background: #E4D7B0; }
	.sw-cur { background: var(--accent); }

	.chart { display: flex; align-items: flex-end; gap: 10px; height: 172px; padding-top: 8px; }
	.mcol { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; justify-content: flex-end; }
	.bars { display: flex; align-items: flex-end; gap: 4px; height: 150px; width: 100%; justify-content: center; }
	.bar { width: 15px; border-radius: 3px 3px 0 0; min-height: 1px; }
	.bar.prev { background: #E4D7B0; }
	.bar.cur { background: var(--accent); }
	.mlabel { font-size: 10px; font-weight: 700; color: #A88B52; }

	.orders-wrap { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }

	@media (max-width: 620px) { .tiles, .orders-wrap { grid-template-columns: 1fr; } }
</style>
