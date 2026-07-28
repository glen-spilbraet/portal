<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	const PORTAL = '145052209';
	const dkk = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 2 });
	const num = new Intl.NumberFormat('da-DK');
	const dealUrl = (id) => `https://app.hubspot.com/contacts/${PORTAL}/record/0-3/${id}`;
	const fmt = (n) => (n == null ? '—' : dkk.format(n));

	let running = $state(false);
	let err = $state('');
	let filter = $state(null); // 'amount' | 'date' | 'not_found' | 'multiple' | null

	const periods = [];
	for (const y of [2026, 2025, 2024]) {
		periods.push({ label: `Q1 ${y}`, from: `${y}-01-01`, to: `${y}-04-01` });
		periods.push({ label: `Q2 ${y}`, from: `${y}-04-01`, to: `${y}-07-01` });
		periods.push({ label: `Q3 ${y}`, from: `${y}-07-01`, to: `${y}-10-01` });
		periods.push({ label: `Q4 ${y}`, from: `${y}-10-01`, to: `${y + 1}-01-01` });
	}
	let sel = $state(Math.max(0, periods.findIndex((p) => p.label === 'Q2 2026')));

	function matches(r, f) {
		if (f === 'amount') return r.amount_match === 0 && r.issue !== 'not_found';
		if (f === 'date') return r.date_match === 0 && r.issue !== 'not_found';
		if (f === 'not_found') return r.issue === 'not_found';
		if (f === 'multiple') return r.issue === 'multiple';
		return true;
	}
	const shown = $derived((data.issues ?? []).filter((r) => matches(r, filter)));
	const setFilter = (f) => (filter = filter === f ? null : f);

	async function rerun() {
		running = true;
		err = '';
		try {
			const p = periods[sel];
			const res = await fetch('/api/stats/run-verification', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ from: p.from, to: p.to }),
			});
			if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message ?? `Failed (${res.status})`);
			await invalidateAll();
		} catch (e) {
			err = e.message;
		} finally {
			running = false;
		}
	}

	function asOf(s) {
		if (!s) return null;
		const d = new Date(s);
		return isNaN(d) ? s : d.toLocaleString('da-DK', { dateStyle: 'medium', timeStyle: 'short' });
	}
	const m = $derived(data.meta);
</script>

<svelte:head><title>Data Verification · Product Portal</title></svelte:head>

<AppNav active="verify" user={data.user} />

<main class="wrap">
	<header class="page-head">
		<div>
			<h1>Data Verification</h1>
			<p class="sub">
				HubSpot deal <strong>amount</strong> &amp; <strong>close date</strong> vs Rackbeat invoices.
				{#if m}<span class="scope-pill">{m.message?.split(' · ')[0] ?? ''}</span>{/if}
			</p>
		</div>
		<div class="run-controls">
			<select class="period-sel" bind:value={sel} disabled={running}>
				{#each periods as p, i}<option value={i}>{p.label}</option>{/each}
			</select>
			<button class="run-btn" onclick={rerun} disabled={running}>{running ? 'Running… (~2–4 min)' : 'Run check'}</button>
		</div>
	</header>

	{#if err}<div class="err">{err}</div>{/if}

	{#if m}
		<div class="stats">
			<div class="stat static"><span class="s-num">{num.format(m.checked ?? 0)}</span><span class="s-lbl">Checked</span></div>
			<div class="stat static ok"><span class="s-num">{num.format(m.ok ?? 0)}</span><span class="s-lbl">OK</span></div>
			<button class="stat bad" class:on={filter === 'amount'} onclick={() => setFilter('amount')}>
				<span class="s-num">{num.format(m.amount_mismatch ?? 0)}</span><span class="s-lbl">Amount ≠</span>
			</button>
			<button class="stat bad" class:on={filter === 'date'} onclick={() => setFilter('date')}>
				<span class="s-num">{num.format(m.date_mismatch ?? 0)}</span><span class="s-lbl">Date ≠</span>
			</button>
			<button class="stat warn" class:on={filter === 'not_found'} onclick={() => setFilter('not_found')}>
				<span class="s-num">{num.format(m.not_found ?? 0)}</span><span class="s-lbl">No invoice</span>
			</button>
			<button class="stat neutral" class:on={filter === 'multiple'} onclick={() => setFilter('multiple')}>
				<span class="s-num">{num.format(m.multiple ?? 0)}</span><span class="s-lbl">Multiple</span>
			</button>
		</div>
		<p class="freshness">
			Last run {asOf(m.last_run)} · {data.issues.length} discrepancies
			{#if filter}· <button class="clear" onclick={() => (filter = null)}>showing {shown.length} · clear filter ✕</button>{/if}
		</p>
	{:else}
		<p class="freshness">No verification run yet — pick a period and click “Run check”.</p>
	{/if}

	<section class="table-wrap">
		<div class="table-scroll">
			<table>
				<colgroup><col /><col style="width:160px" /><col style="width:110px" /><col style="width:170px" /><col style="width:170px" /></colgroup>
				<thead>
					<tr><th>Customer / Deal</th><th>Owner</th><th>Issue</th><th>Amount</th><th>Date</th></tr>
				</thead>
				<tbody>
					{#each shown as r (r.deal_id)}
						<tr>
							<td class="cust-cell">
								<div class="cust">{r.company_name ?? '—'}</div>
								<a class="deal" href={dealUrl(r.deal_id)} target="_blank" rel="noopener">{r.deal_name} ↗</a>
							</td>
							<td class="owner">{r.owner_name ?? '—'}</td>
							<td><span class="badge {r.issue}">{r.issue.replace('_', ' ')}</span></td>
							<td class="cell">
								<div class="ln"><span class="k">HS</span>{fmt(r.amount_raw)} {r.currency ?? ''}</div>
								<div class="ln rb" class:bad={!r.amount_match && r.issue !== 'not_found'}><span class="k">RB</span>{r.rb_subtotal == null ? '—' : `${fmt(r.rb_subtotal)} ${r.currency ?? ''}`}</div>
							</td>
							<td class="cell">
								<div class="ln"><span class="k">HS</span>{r.close_date ?? '—'}</div>
								<div class="ln rb" class:bad={!r.date_match && r.issue !== 'not_found'}><span class="k">RB</span>{r.rb_date ?? '—'}</div>
							</td>
						</tr>
					{:else}
						<tr><td colspan="5" class="empty">{data.issues.length ? 'No rows for this filter.' : 'No discrepancies 🎉'}</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</main>

<style>
	.wrap { max-width: 1140px; margin: 0 auto; padding: 28px; }
	.page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; flex-wrap: wrap; }
	h1 { font-size: 24px; font-weight: 800; letter-spacing: -0.4px; margin: 0; }
	.sub { font-size: 14px; color: #8A7550; margin: 4px 0 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
	.scope-pill { background: #FFE6A5; color: #7B3803; font-size: 12px; font-weight: 700; padding: 2px 10px; border-radius: 100px; }
	.run-controls { display: flex; align-items: center; gap: 8px; }
	.period-sel { font-family: inherit; font-size: 14px; font-weight: 700; color: #524431; background: #fff; border: 1px solid var(--border); border-radius: 9px; padding: 9px 10px; cursor: pointer; }
	.run-btn { font-family: inherit; font-size: 14px; font-weight: 700; color: #fff; background: var(--accent); border: none; border-radius: 9px; padding: 10px 18px; cursor: pointer; }
	.run-btn:hover { background: var(--accent-hover); }
	.run-btn:disabled { opacity: 0.6; cursor: default; }
	.err { background: #FEF2F2; border: 1px solid #fecaca; color: #dc2626; border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 14px; }

	.stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 8px; }
	.stat { background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; text-align: left; font-family: inherit; }
	button.stat { cursor: pointer; transition: box-shadow 0.12s, border-color 0.12s, transform 0.05s; }
	button.stat:hover { border-color: var(--accent); }
	button.stat.on { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(245, 120, 50, 0.2); }
	.s-num { font-size: 21px; font-weight: 800; letter-spacing: -0.5px; }
	.s-lbl { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #A88B52; }
	.stat.ok .s-num { color: #16794C; }
	.stat.bad .s-num { color: #C4381B; }
	.stat.warn .s-num { color: #B4611A; }
	.stat.neutral .s-num { color: #3E5060; }
	@media (max-width: 820px) { .stats { grid-template-columns: repeat(3, 1fr); } }

	.freshness { font-size: 12px; color: #A1A1AA; margin: 8px 0 18px; }
	.clear { background: none; border: none; font-family: inherit; font-size: 12px; font-weight: 700; color: #B15A12; cursor: pointer; padding: 0; }
	.clear:hover { text-decoration: underline; }

	.table-wrap { background: #fff; border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow); overflow: hidden; }
	.table-scroll { max-height: 660px; overflow: auto; }
	table { width: 100%; border-collapse: collapse; font-size: 13.5px; table-layout: fixed; }
	thead th { position: sticky; top: 0; z-index: 1; background: #FBEFCB; color: #7B3803; font-weight: 800; text-align: left; padding: 11px 16px; white-space: nowrap; border-bottom: 1px solid var(--border); }
	tbody td { padding: 10px 16px; border-bottom: 1px solid #F5EDD8; vertical-align: middle; }
	tbody tr:nth-child(even) td { background: #FFFBEF; }
	tbody tr:hover td { background: #FFF5D2; }

	.cust-cell { overflow: hidden; }
	.cust { font-weight: 800; color: #18181B; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.deal { font-size: 12px; color: var(--accent); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
	.deal:hover { text-decoration: underline; }
	.owner { color: #6b5e4e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	.cell { font-variant-numeric: tabular-nums; }
	.ln { display: flex; gap: 6px; white-space: nowrap; }
	.ln .k { display: inline-block; width: 20px; font-size: 10px; font-weight: 800; color: #A1A1AA; text-transform: uppercase; padding-top: 1px; }
	.ln.rb { color: #8A7550; }
	.ln.rb.bad { color: #C4381B; font-weight: 800; }

	.badge { font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 100px; white-space: nowrap; text-transform: capitalize; }
	.badge.not_found { background: #FDEBD2; color: #B4611A; }
	.badge.amount, .badge.date, .badge { background: #FDECEC; color: #C4381B; }
	.badge.multiple { background: #EEF1F5; color: #3E5060; }
	.empty { text-align: center; color: #A1A1AA; padding: 28px; }
</style>
