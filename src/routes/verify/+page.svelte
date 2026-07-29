<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	const PORTAL = '145052209';
	const dkk = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 2 });
	const num = new Intl.NumberFormat('da-DK');
	const dealUrl = (id) => `https://app.hubspot.com/contacts/${PORTAL}/record/0-3/${id}`;
	const rbUrl = (number) => `https://app.rackbeat.com/sales/customer-invoices/${String(number).split(',')[0]}`;
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
	const filtered = $derived((data.issues ?? []).filter((r) => matches(r, filter)));
	function setFilter(f) {
		filter = filter === f ? null : f;
		if (filter !== 'date') dateSeg = null;
	}

	// Date sub-segments (only meaningful for date issues).
	let dateSeg = $state(null); // 'diffQ' | '1' | '2-7' | '8-20' | '20+' | null
	const toggleSeg = (s) => (dateSeg = dateSeg === s ? null : s);
	const qtrIndex = (s) => { const [y, m] = s.split('-').map(Number); return y * 4 + Math.floor((m - 1) / 3); };
	const diffQof = (r) => (r.rb_date && r.close_date ? qtrIndex(r.close_date) !== qtrIndex(String(r.rb_date).split(',')[0]) : false);
	function bucketOf(r) {
		const d = dateDiffDays(r);
		if (d == null) return null;
		if (d <= 1) return '1';
		if (d <= 7) return '2-7';
		if (d <= 20) return '8-20';
		return '20+';
	}
	const segMatch = (r, seg) => (seg === 'diffQ' ? diffQof(r) : bucketOf(r) === seg);
	const dateRows = $derived((data.issues ?? []).filter((r) => matches(r, 'date')));
	const segCounts = $derived.by(() => {
		const c = { diffQ: 0, '1': 0, '2-7': 0, '8-20': 0, '20+': 0 };
		for (const r of dateRows) { const b = bucketOf(r); if (b) c[b]++; if (diffQof(r)) c.diffQ++; }
		return c;
	});
	const segLabels = [
		['diffQ', 'Different quarter'],
		['1', '1 day'],
		['2-7', '2–7 days'],
		['8-20', '8–20 days'],
		['20+', '20+ days'],
	];

	// Sorting by size of the difference.
	let sortKey = $state(null); // 'amount' | 'date' | null
	let sortDir = $state('desc');
	const amtDiff = (r) => (r.rb_subtotal == null ? null : Math.abs((r.amount_raw ?? 0) - (r.rb_subtotal ?? 0)));
	const dateDiffDays = (r) => {
		if (!r.rb_date || !r.close_date) return null;
		const a = Date.parse(r.close_date);
		const b = Date.parse(String(r.rb_date).split(',')[0]);
		return isNaN(a) || isNaN(b) ? null : Math.abs(a - b) / 86400000;
	};
	function setSort(k) {
		if (sortKey === k) sortDir = sortDir === 'desc' ? 'asc' : 'desc';
		else { sortKey = k; sortDir = 'desc'; }
	}
	const segFiltered = $derived(filter === 'date' && dateSeg ? filtered.filter((r) => segMatch(r, dateSeg)) : filtered);
	const shown = $derived.by(() => {
		const arr = [...segFiltered];
		if (!sortKey) return arr;
		const val = sortKey === 'amount' ? amtDiff : dateDiffDays;
		return arr.sort((x, y) => {
			const xv = val(x), yv = val(y);
			if (xv == null && yv == null) return 0;
			if (xv == null) return 1; // no-invoice rows sort last
			if (yv == null) return -1;
			return sortDir === 'desc' ? yv - xv : xv - yv;
		});
	});
	const caret = (k) => (sortKey === k ? (sortDir === 'desc' ? ' ▼' : ' ▲') : '');

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

	// ── Fixing (write Rackbeat values back to HubSpot) ───────────────────────
	const isFixable = (r) => r.issue === 'amount' || r.issue === 'date' || r.issue === 'amount+date';
	let selected = $state(new Set());
	let fixField = $state('both');
	let fixing = $state(false);
	let fixMsg = $state('');
	let queue = $state(null); // { total, done, fixed, failed, stop, field } while running
	const QUEUE_BATCH = 30;

	const fixableShown = $derived(shown.filter(isFixable));
	const allSelected = $derived(fixableShown.length > 0 && fixableShown.every((r) => selected.has(r.deal_id)));

	function toggle(id) {
		selected.has(id) ? selected.delete(id) : selected.add(id);
		selected = new Set(selected);
	}
	function toggleAll() {
		if (allSelected) selected = new Set();
		else selected = new Set(fixableShown.map((r) => r.deal_id));
	}
	function selectFirst(n) {
		selected = new Set(fixableShown.slice(0, n).map((r) => r.deal_id));
	}
	function selectAll() {
		selected = new Set(fixableShown.map((r) => r.deal_id));
	}

	function stopQueue() {
		if (queue) queue = { ...queue, stop: true };
	}

	async function applyFix() {
		const ids = [...selected];
		if (!ids.length) return;
		const label = { date: 'close dates', amount: 'amounts', both: 'dates & amounts' }[fixField];
		if (!confirm(`Update ${ids.length} deal(s) in HubSpot — set their ${label} to the Rackbeat values?\n\n⚠️ This changes LIVE HubSpot data. It runs in batches of ${QUEUE_BATCH}; you can stop between batches.`)) return;

		fixing = true;
		fixMsg = '';
		queue = { total: ids.length, done: 0, fixed: 0, failed: 0, stop: false, field: fixField };
		for (let i = 0; i < ids.length; i += QUEUE_BATCH) {
			if (queue.stop) break;
			const chunk = ids.slice(i, i + QUEUE_BATCH);
			try {
				const res = await fetch('/api/stats/fix', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ dealIds: chunk, field: queue.field }),
				});
				const b = await res.json().catch(() => ({}));
				if (!res.ok) throw new Error(b?.message ?? res.status);
				queue = { ...queue, done: queue.done + chunk.length, fixed: queue.fixed + (b.fixed || 0), failed: queue.failed + (b.failed || 0) };
			} catch (e) {
				queue = { ...queue, done: queue.done + chunk.length, failed: queue.failed + chunk.length };
			}
		}
		const stopped = queue.stop && queue.done < queue.total;
		fixMsg = `${stopped ? 'Stopped' : 'Done'} — fixed ${queue.fixed}${queue.failed ? ` · ${queue.failed} failed` : ''} of ${queue.total}.`;
		selected = new Set();
		queue = null;
		fixing = false;
		await invalidateAll();
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

	{#if filter === 'date'}
		<div class="segs">
			<span class="seg-lbl">Date segments</span>
			{#each segLabels as [key, label]}
				<button class="seg" class:on={dateSeg === key} onclick={() => toggleSeg(key)}>{label} <span class="seg-n">{segCounts[key]}</span></button>
			{/each}
		</div>
	{/if}

	{#if fixableShown.length > 0}
		<div class="sel-tools">
			<span class="st-lbl">{fixableShown.length} fixable</span>
			<button class="st-btn" onclick={() => selectFirst(50)}>Select first 50</button>
			<button class="st-btn" onclick={selectAll}>Select all ({fixableShown.length})</button>
			{#if selected.size > 0}<button class="st-btn ghost" onclick={() => (selected = new Set())}>Clear selection</button>{/if}
		</div>
	{/if}

	<section class="table-wrap">
		<div class="table-scroll">
			<table>
				<colgroup><col style="width:38px" /><col /><col style="width:160px" /><col style="width:110px" /><col style="width:170px" /><col style="width:170px" /></colgroup>
				<thead>
					<tr>
						<th class="chk"><input type="checkbox" checked={allSelected} onchange={toggleAll} aria-label="Select all fixable" /></th>
						<th>Customer / Deal</th>
						<th>Owner</th>
						<th>Issue</th>
						<th class="th-sort" class:sorted={sortKey === 'amount'} onclick={() => setSort('amount')}>Amount{caret('amount')}</th>
						<th class="th-sort" class:sorted={sortKey === 'date'} onclick={() => setSort('date')}>Date{caret('date')}</th>
					</tr>
				</thead>
				<tbody>
					{#each shown as r (r.deal_id)}
						<tr class:sel={selected.has(r.deal_id)}>
							<td class="chk">
								{#if isFixable(r)}<input type="checkbox" checked={selected.has(r.deal_id)} onchange={() => toggle(r.deal_id)} aria-label="Select row" />{/if}
							</td>
							<td class="cust-cell">
								<div class="cust">{r.company_name ?? '—'}</div>
								<div class="idlinks">
									<a class="idl" href={dealUrl(r.deal_id)} target="_blank" rel="noopener">Hubspot: {r.rackbeat_id}&nbsp;↗</a>
									{#if r.invoice_number}<a class="idl" href={rbUrl(r.invoice_number)} target="_blank" rel="noopener">Rackbeat: {String(r.invoice_number).split(',')[0]}&nbsp;↗</a>{/if}
								</div>
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
						<tr><td colspan="6" class="empty">{data.issues.length ? 'No rows for this filter.' : 'No discrepancies 🎉'}</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</main>

{#if queue}
	<div class="fixbar">
		<span class="fx-count">Fixing {queue.done}/{queue.total}</span>
		<div class="q-bar"><div class="q-fill" style="width:{Math.round((queue.done / queue.total) * 100)}%"></div></div>
		<span class="fx-msg">✓ {queue.fixed}{queue.failed ? ` · ✕ ${queue.failed}` : ''}</span>
		<button class="fx-cancel" onclick={stopQueue} disabled={queue.stop}>{queue.stop ? 'Stopping…' : 'Stop'}</button>
	</div>
{:else if selected.size > 0}
	<div class="fixbar">
		<span class="fx-count">{selected.size} selected</span>
		<select class="fx-sel" bind:value={fixField} disabled={fixing}>
			<option value="both">Fix dates &amp; amounts</option>
			<option value="date">Fix dates</option>
			<option value="amount">Fix amounts</option>
		</select>
		<button class="fx-apply" onclick={applyFix} disabled={fixing}>Apply to HubSpot</button>
		<button class="fx-cancel" onclick={() => (selected = new Set())} disabled={fixing}>Cancel</button>
	</div>
{:else if fixMsg}
	<div class="fixbar done"><span class="fx-msg">{fixMsg}</span><button class="fx-cancel" onclick={() => (fixMsg = '')}>Dismiss</button></div>
{/if}

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

	.segs { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: -6px 0 18px; }
	.seg-lbl { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; color: #A88B52; margin-right: 2px; }
	.seg { font-family: inherit; font-size: 13px; font-weight: 700; color: #7B3803; background: #fff; border: 1px solid var(--border); border-radius: 100px; padding: 6px 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
	.seg:hover { background: #FFF5D2; }
	.seg.on { background: #FFE6A5; border-color: #F4CE7A; }
	.seg-n { font-size: 11px; font-weight: 800; color: #B4611A; background: #FDECEC; border-radius: 100px; padding: 1px 7px; }
	.seg.on .seg-n { background: #fff; }

	.table-wrap { background: #fff; border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow); overflow: hidden; }
	.table-scroll { max-height: 660px; overflow: auto; }
	table { width: 100%; border-collapse: collapse; font-size: 13.5px; table-layout: fixed; }
	thead th { position: sticky; top: 0; z-index: 1; background: #FBEFCB; color: #7B3803; font-weight: 800; text-align: left; padding: 11px 16px; white-space: nowrap; border-bottom: 1px solid var(--border); }
	.th-sort { cursor: pointer; user-select: none; }
	.th-sort:hover { background: #F8E6B0; }
	.th-sort.sorted { color: #B15A12; }
	tbody td { padding: 10px 16px; border-bottom: 1px solid #F5EDD8; vertical-align: middle; }
	tbody tr:nth-child(even) td { background: #FFFBEF; }
	tbody tr:hover td { background: #FFF5D2; }

	.cust-cell { overflow: hidden; }
	.cust { font-weight: 800; color: #18181B; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.idlinks { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 2px; }
	.idl { font-size: 12px; font-weight: 700; color: var(--accent); text-decoration: none; white-space: nowrap; }
	.idl:hover { text-decoration: underline; }
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

	.sel-tools { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
	.st-lbl { font-size: 12px; font-weight: 700; color: #A88B52; margin-right: 2px; }
	.st-btn { font-family: inherit; font-size: 12.5px; font-weight: 700; color: #7B3803; background: #FFE6A5; border: 1px solid #F4CE7A; border-radius: 8px; padding: 6px 12px; cursor: pointer; }
	.st-btn:hover { background: #F8D97F; }
	.st-btn.ghost { background: #fff; border-color: var(--border); color: #8A7550; }
	.st-btn.ghost:hover { background: #FFF5D2; }

	.chk { text-align: center; padding-left: 12px; padding-right: 4px; }
	.chk input { width: 15px; height: 15px; cursor: pointer; accent-color: var(--accent); }
	tbody tr.sel td { background: #FFE6A5 !important; }

	.fixbar {
		position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); z-index: 200;
		display: flex; align-items: center; gap: 12px;
		background: #18181B; color: #fff; padding: 10px 14px; border-radius: 12px;
		box-shadow: 0 12px 34px rgba(0, 0, 0, 0.3);
	}
	.fx-count { font-size: 13px; font-weight: 800; }
	.fx-sel { font-family: inherit; font-size: 13px; font-weight: 700; border: none; border-radius: 8px; padding: 8px 10px; cursor: pointer; }
	.fx-apply { font-family: inherit; font-size: 13px; font-weight: 800; color: #fff; background: var(--accent); border: none; border-radius: 8px; padding: 8px 16px; cursor: pointer; }
	.fx-apply:hover { background: var(--accent-hover); }
	.fx-apply:disabled { opacity: 0.6; cursor: default; }
	.fx-cancel { font-family: inherit; font-size: 13px; font-weight: 700; color: #d4d4d8; background: none; border: none; cursor: pointer; }
	.fx-cancel:hover { color: #fff; }
	.fx-msg { font-size: 12px; color: #E7F6EC; font-weight: 700; }
	.q-bar { width: 200px; height: 8px; background: rgba(255,255,255,0.2); border-radius: 100px; overflow: hidden; }
	.q-fill { height: 100%; background: var(--accent); border-radius: 100px; transition: width 0.2s; }
	.fixbar.done { background: #16794C; }
</style>
