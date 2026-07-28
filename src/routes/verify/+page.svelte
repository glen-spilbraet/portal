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

	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

	async function rerun() {
		running = true;
		err = '';
		try {
			const res = await fetch('/api/stats/run-verification', { method: 'POST' });
			if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message ?? `Failed (${res.status})`);
			// Run is async on the worker — poll until it finishes (~1–2 min).
			for (let i = 0; i < 45; i++) {
				await sleep(4000);
				const s = await fetch('/api/stats/run-verification').then((r) => r.json()).catch(() => ({}));
				if (s.status === 'ok') break;
				if (s.status === 'error') throw new Error('Verification run failed on the worker');
			}
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
			<p class="sub">HubSpot deal <strong>amount</strong> &amp; <strong>close date</strong> vs Rackbeat invoices. Shows only discrepancies.</p>
		</div>
		<button class="run-btn" onclick={rerun} disabled={running}>{running ? 'Running…' : 'Re-run check'}</button>
	</header>

	{#if err}<div class="err">{err}</div>{/if}

	{#if m}
		<div class="stats">
			<div class="stat"><span class="s-num">{num.format(m.checked ?? 0)}</span><span class="s-lbl">Checked</span></div>
			<div class="stat ok"><span class="s-num">{num.format(m.ok ?? 0)}</span><span class="s-lbl">OK</span></div>
			<div class="stat bad"><span class="s-num">{num.format(m.amount_mismatch ?? 0)}</span><span class="s-lbl">Amount ≠</span></div>
			<div class="stat bad"><span class="s-num">{num.format(m.date_mismatch ?? 0)}</span><span class="s-lbl">Date ≠</span></div>
			<div class="stat warn"><span class="s-num">{num.format(m.not_found ?? 0)}</span><span class="s-lbl">No invoice</span></div>
			<div class="stat warn"><span class="s-num">{num.format(m.multiple ?? 0)}</span><span class="s-lbl">Multiple</span></div>
		</div>
		<p class="freshness">Last run {asOf(m.last_run)} · {data.issues.length} discrepancies</p>
	{:else}
		<p class="freshness">No verification run yet — click “Re-run check”.</p>
	{/if}

	<section class="table-wrap">
		<div class="table-scroll">
			<table>
				<colgroup>
					<col /><col style="width:150px" /><col style="width:120px" /><col style="width:150px" /><col style="width:180px" />
				</colgroup>
				<thead>
					<tr>
						<th>Customer / Deal</th>
						<th>Owner</th>
						<th>Issue</th>
						<th class="num">Amount (HS → RB)</th>
						<th class="num">Date (HS → RB)</th>
					</tr>
				</thead>
				<tbody>
					{#each data.issues as r (r.deal_id)}
						<tr>
							<td class="name">
								<span class="cn">{r.company_name ?? '—'}</span>
								<a class="dl" href={dealUrl(r.deal_id)} target="_blank" rel="noopener">{r.deal_name} ↗</a>
							</td>
							<td class="owner">{r.owner_name ?? '—'}</td>
							<td><span class="badge {r.issue}">{r.issue}</span></td>
							<td class="num" class:bad={!r.amount_match}>
								{fmt(r.amount_raw)} {r.currency ?? ''} → {r.rb_subtotal == null ? '—' : fmt(r.rb_subtotal)}
							</td>
							<td class="num" class:bad={!r.date_match}>
								{r.close_date ?? '—'} → {r.rb_date ?? '—'}
							</td>
						</tr>
					{:else}
						<tr><td colspan="5" class="empty">No discrepancies 🎉</td></tr>
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
	.sub { font-size: 14px; color: #8A7550; margin: 4px 0 0; }
	.run-btn { font-family: inherit; font-size: 14px; font-weight: 700; color: #fff; background: var(--accent); border: none; border-radius: 9px; padding: 10px 18px; cursor: pointer; }
	.run-btn:hover { background: var(--accent-hover); }
	.run-btn:disabled { opacity: 0.6; cursor: default; }
	.err { background: #FEF2F2; border: 1px solid #fecaca; color: #dc2626; border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 14px; }

	.stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 8px; }
	.stat { background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; }
	.s-num { font-size: 21px; font-weight: 800; letter-spacing: -0.5px; }
	.s-lbl { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #A88B52; }
	.stat.ok .s-num { color: #16794C; }
	.stat.bad .s-num { color: #C4381B; }
	.stat.warn .s-num { color: #B4611A; }
	@media (max-width: 800px) { .stats { grid-template-columns: repeat(3, 1fr); } }

	.freshness { font-size: 12px; color: #A1A1AA; margin: 6px 0 18px; }

	.table-wrap { background: #fff; border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow); overflow: hidden; }
	.table-scroll { max-height: 640px; overflow: auto; }
	table { width: 100%; border-collapse: collapse; font-size: 13.5px; table-layout: fixed; }
	thead th { position: sticky; top: 0; z-index: 1; background: #FBEFCB; color: #7B3803; font-weight: 800; text-align: left; padding: 11px 16px; white-space: nowrap; border-bottom: 1px solid var(--border); }
	th.num, td.num { text-align: right; }
	tbody td { padding: 10px 16px; border-bottom: 1px solid #F5EDD8; vertical-align: middle; }
	tbody tr:nth-child(even) td { background: #FFFBEF; }
	td.name { overflow: hidden; }
	.cn { display: block; font-weight: 700; color: #18181B; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.dl { font-size: 12px; color: var(--accent); text-decoration: none; }
	.dl:hover { text-decoration: underline; }
	td.owner { color: #6b5e4e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	td.num { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
	td.num.bad { color: #C4381B; font-weight: 800; }
	.badge { font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 100px; white-space: nowrap; }
	.badge.not_found { background: #FDEBD2; color: #B4611A; }
	.badge.amount, .badge.date, .badge { background: #FDECEC; color: #C4381B; }
	.badge.multiple { background: #EEF1F5; color: #3E5060; }
	.empty { text-align: center; color: #A1A1AA; padding: 28px; }
</style>
