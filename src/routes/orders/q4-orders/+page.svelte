<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	const COLLI_DISCOUNT = 7;

	// ── Data ──────────────────────────────────────────────────────────────────
	let drafts      = $state([]);
	let generatedAt = $state('');
	let loading     = $state(true);
	let loadError   = $state('');

	// Per-line decisions, keyed by `${number}:${lineId}`.
	//   colli_discount → { accepted: bool }
	//   not_colli      → { choice: 'up' | 'down' | 'leave' }
	let decisions = $state({});

	// ── Transfer flow ─────────────────────────────────────────────────────────
	let showSummary    = $state(false);
	let transferring   = $state(false);
	let transferResult = $state(null);

	const keyOf = (num, lineId) => `${num}:${lineId}`;

	async function loadDrafts() {
		loading = true;
		loadError = '';
		transferResult = null;
		try {
			const res = await fetch('/api/q4-orders');
			if (!res.ok) {
				let msg = `Failed to load drafts (${res.status})`;
				try { const b = await res.json(); if (b?.message) msg = b.message; } catch { /* ignore */ }
				throw new Error(msg);
			}
			const body = await res.json();
			drafts = body.drafts ?? [];
			generatedAt = body.generatedAt ?? '';

			// Seed default decisions: accept every colli discount, round non-colli up.
			const seed = {};
			for (const d of drafts) {
				for (const l of d.lines) {
					if (l.lineId == null) continue;
					const k = keyOf(d.number, l.lineId);
					if (l.status === 'colli_discount') seed[k] = { accepted: true };
					else if (l.status === 'not_colli') seed[k] = { choice: 'up' };
				}
			}
			decisions = seed;
		} catch (e) {
			loadError = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	$effect(() => { loadDrafts(); });

	// ── Per-line resolved change ────────────────────────────────────────────────
	// Returns null when the line produces no change, otherwise a descriptive
	// object used both for the summary and for the POST payload.
	function lineChange(num, line) {
		if (line.lineId == null) return null;
		const k = keyOf(num, line.lineId);
		const dec = decisions[k];

		if (line.status === 'colli_discount') {
			if (!dec?.accepted) return null;
			return {
				lineId: line.lineId, sku: line.sku, name: line.name,
				qtyFrom: line.quantity, qtyTo: line.quantity,
				discFrom: line.discount, discTo: COLLI_DISCOUNT,
				remove: false,
				reason: 'Full colli → apply 7% discount'
			};
		}

		if (line.status === 'not_colli') {
			const choice = dec?.choice ?? 'up';
			if (choice === 'leave') return null;
			const newQty = choice === 'up' ? line.up : line.down;
			const remove = newQty === 0;
			const discTo = remove ? line.discount : Math.max(line.discount, COLLI_DISCOUNT);
			const dir = choice === 'up' ? 'Increased' : (remove ? 'Removed' : 'Decreased');
			const reason = remove
				? 'Rounded down to 0 → line removed'
				: `${dir} to full colli (${line.colli})${discTo !== line.discount ? ' + 7% discount' : ''}`;
			return {
				lineId: line.lineId, sku: line.sku, name: line.name,
				qtyFrom: line.quantity, qtyTo: newQty,
				discFrom: line.discount, discTo,
				remove,
				reason
			};
		}

		return null;
	}

	// ── Derived summary ─────────────────────────────────────────────────────────
	let changeSets = $derived.by(() => {
		const sets = [];
		for (const d of drafts) {
			const changes = [];
			for (const l of d.lines) {
				const c = lineChange(d.number, l);
				if (c) changes.push(c);
			}
			if (changes.length) sets.push({ number: d.number, customerName: d.customerName, changes });
		}
		return sets;
	});

	let totalChanges = $derived(changeSets.reduce((n, s) => n + s.changes.length, 0));

	let counts = $derived.by(() => {
		let colli = 0, notColli = 0, noColli = 0, ok = 0, lines = 0;
		for (const d of drafts) for (const l of d.lines) {
			lines++;
			if (l.status === 'colli_discount') colli++;
			else if (l.status === 'not_colli') notColli++;
			else if (l.status === 'no_colli') noColli++;
			else ok++;
		}
		return { colli, notColli, noColli, ok, lines };
	});

	// ── Transfer ────────────────────────────────────────────────────────────────
	function buildPayload() {
		return changeSets.map((s) => ({
			number: s.number,
			lines: s.changes.map((c) => {
				const line = { lineId: c.lineId };
				if (c.remove) { line.remove = true; return line; }
				if (c.qtyTo !== c.qtyFrom) line.quantity = c.qtyTo;
				if (c.discTo !== c.discFrom) line.discount_percentage = c.discTo;
				return line;
			})
		}));
	}

	async function doTransfer() {
		transferring = true;
		try {
			const res = await fetch('/api/q4-orders', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ changes: buildPayload() })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body?.message || `Transfer failed (${res.status})`);
			transferResult = body;
			showSummary = false;
			// Reload to reflect the new Rackbeat state.
			await loadDrafts();
		} catch (e) {
			transferResult = { error: e instanceof Error ? e.message : String(e) };
			showSummary = false;
		} finally {
			transferring = false;
		}
	}

	// ── Helpers ───────────────────────────────────────────────────────────────
	const pct = (n) => `${Number(n ?? 0)}%`;
	function fmtDate(s) {
		if (!s) return '';
		const d = new Date(s);
		return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
	}
	function setChoice(num, lineId, choice) {
		decisions = { ...decisions, [keyOf(num, lineId)]: { choice } };
	}
	function toggleAccept(num, lineId, accepted) {
		decisions = { ...decisions, [keyOf(num, lineId)]: { accepted } };
	}
	function draftHasChange(num) {
		return changeSets.some((s) => s.number === num);
	}
</script>

<svelte:head><title>Q4 Orders — Product Portal</title></svelte:head>

<AppNav user={data.user} />

<div class="wrap">
	<header class="head">
		<div>
			<h1>Q4 Orders</h1>
			<p class="sub">
				Colli assessment of every open Rackbeat draft. Full-colli lines get a {COLLI_DISCOUNT}% discount;
				non-colli lines can be rounded up or down. Nothing is sent to Rackbeat until you transfer.
			</p>
		</div>
		<button class="btn ghost" onclick={loadDrafts} disabled={loading}>
			{loading ? 'Loading…' : 'Refresh'}
		</button>
	</header>

	{#if transferResult && !transferResult.error}
		<div class="banner ok">
			Transferred: {transferResult.updated} draft{transferResult.updated === 1 ? '' : 's'} updated{transferResult.failed ? `, ${transferResult.failed} failed` : ''}.
			{#if transferResult.results?.some((r) => r.status === 'failed')}
				<ul class="fail-list">
					{#each transferResult.results.filter((r) => r.status === 'failed') as r}
						<li>#{r.number}: {r.error}</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
	{#if transferResult?.error}
		<div class="banner err">Transfer failed: {transferResult.error}</div>
	{/if}

	{#if loading}
		<div class="state">
			<div class="spinner"></div>
			<p>Reading drafts and colli sizes from Rackbeat…</p>
		</div>
	{:else if loadError}
		<div class="banner err">{loadError}</div>
	{:else if drafts.length === 0}
		<div class="state"><p>No open drafts in Rackbeat.</p></div>
	{:else}
		<div class="meta">
			<span>{drafts.length} draft{drafts.length === 1 ? '' : 's'}</span>
			<span class="dot colli">{counts.colli} full-colli → 7%</span>
			<span class="dot notcolli">{counts.notColli} not in colli</span>
			<span class="dot nocolli">{counts.noColli} no colli data</span>
			{#if generatedAt}<span class="ts">as of {fmtDate(generatedAt)}</span>{/if}
		</div>

		{#each drafts as d (d.number)}
			<section class="card" class:actionable={draftHasChange(d.number)}>
				<div class="card-head">
					<div class="ch-left">
						<span class="onum">#{d.number}</span>
						<span class="cust">{d.customerName || 'Unknown customer'}</span>
						{#if d.heading}<span class="heading">{d.heading}</span>{/if}
					</div>
					<span class="cur">{d.currency}</span>
				</div>

				<div class="tbl-scroll">
					<table>
						<thead>
							<tr>
								<th class="c-sku">SKU</th>
								<th class="c-name">Product</th>
								<th class="c-num">Colli</th>
								<th class="c-num">Qty</th>
								<th class="c-num">Disc.</th>
								<th class="c-action">Assessment</th>
							</tr>
						</thead>
						<tbody>
							{#each d.lines as l (l.lineId ?? l.sku)}
								{@const dec = decisions[keyOf(d.number, l.lineId)]}
								<tr class="st-{l.status}">
									<td class="c-sku mono">{l.sku}</td>
									<td class="c-name">{l.name}</td>
									<td class="c-num">{l.colli ?? '—'}</td>
									<td class="c-num">{l.quantity}</td>
									<td class="c-num">{l.discount ? pct(l.discount) : '—'}</td>
									<td class="c-action">
										{#if l.status === 'colli_discount'}
											<label class="accept">
												<input type="checkbox" checked={dec?.accepted ?? true}
													onchange={(e) => toggleAccept(d.number, l.lineId, e.currentTarget.checked)} />
												<span class="tag tag-colli">Full colli</span>
												apply 7%
												{#if dec?.accepted ?? true}<span class="res">{pct(l.discount)} → 7%</span>{/if}
											</label>
										{:else if l.status === 'not_colli'}
											<div class="choice-row">
												<span class="tag tag-warn">Not full colli</span>
												<div class="seg">
													<button class:on={(dec?.choice ?? 'up') === 'up'}
														onclick={() => setChoice(d.number, l.lineId, 'up')}>↑ {l.up}</button>
													<button class:on={(dec?.choice ?? 'up') === 'down'}
														onclick={() => setChoice(d.number, l.lineId, 'down')}>
														{l.down === 0 ? 'Remove' : `↓ ${l.down}`}</button>
													<button class:on={(dec?.choice ?? 'up') === 'leave'}
														onclick={() => setChoice(d.number, l.lineId, 'leave')}>Leave</button>
												</div>
												{#if (dec?.choice ?? 'up') !== 'leave'}
													{@const c = lineChange(d.number, l)}
													{#if c}<span class="res">{c.reason}</span>{/if}
												{/if}
											</div>
										{:else if l.status === 'ok_discounted'}
											<span class="muted">Full colli · keeps {pct(l.discount)}</span>
										{:else if l.status === 'no_colli'}
											<span class="tag tag-grey">No colli defined</span>
										{:else}
											<span class="muted">—</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/each}
	{/if}
</div>

<!-- Sticky transfer bar -->
{#if !loading && !loadError && drafts.length > 0}
	<div class="bar">
		<span class="bar-count">
			{totalChanges} change{totalChanges === 1 ? '' : 's'} across {changeSets.length} draft{changeSets.length === 1 ? '' : 's'}
		</span>
		<button class="btn primary" disabled={totalChanges === 0} onclick={() => (showSummary = true)}>
			Transfer to Rackbeat
		</button>
	</div>
{/if}

<!-- Summary / confirm modal -->
{#if showSummary}
	<div class="overlay" onclick={() => (showSummary = false)} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
			<h2>Review changes before transfer</h2>
			<p class="modal-sub">These updates will be written to the Rackbeat drafts. Review, then confirm.</p>
			<div class="modal-body">
				{#each changeSets as s}
					<div class="sum-draft">
						<div class="sum-head">#{s.number} · {s.customerName || 'Unknown customer'}</div>
						<ul>
							{#each s.changes as c}
								<li>
									<span class="mono">{c.sku}</span> {c.name}
									<div class="sum-detail">
										{#if c.remove}
											<span class="chg-rm">Remove line (qty {c.qtyFrom} → 0)</span>
										{:else}
											{#if c.qtyTo !== c.qtyFrom}<span class="chg">qty {c.qtyFrom} → <b>{c.qtyTo}</b></span>{/if}
											{#if c.discTo !== c.discFrom}<span class="chg">disc {pct(c.discFrom)} → <b>{pct(c.discTo)}</b></span>{/if}
										{/if}
										<span class="why">{c.reason}</span>
									</div>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
			<div class="modal-foot">
				<button class="btn ghost" onclick={() => (showSummary = false)} disabled={transferring}>Cancel</button>
				<button class="btn primary" onclick={doTransfer} disabled={transferring}>
					{transferring ? 'Transferring…' : `Confirm & transfer ${totalChanges} change${totalChanges === 1 ? '' : 's'}`}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.wrap { max-width: 1100px; margin: 0 auto; padding: 24px 20px 120px; }
	.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
	h1 { font-size: 1.6rem; font-weight: 800; color: #18181B; }
	.sub { color: #6B6456; font-size: .9rem; max-width: 640px; margin-top: 4px; line-height: 1.45; }

	.btn { border: none; border-radius: var(--radius); padding: 9px 16px; font-weight: 700; font-size: .9rem; }
	.btn.primary { background: var(--accent); color: #fff; }
	.btn.primary:hover:not(:disabled) { background: var(--accent-hover); }
	.btn.ghost { background: #fff; border: 1px solid var(--border); color: #18181B; }
	.btn:disabled { opacity: .5; cursor: not-allowed; }

	.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-bottom: 16px; font-size: .85rem; color: #6B6456; font-weight: 600; }
	.meta .dot::before { content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
	.meta .colli::before { background: #16A34A; }
	.meta .notcolli::before { background: var(--accent); }
	.meta .nocolli::before { background: #B6A684; }
	.meta .ts { margin-left: auto; color: #9A8A6A; font-weight: 500; }

	.card { background: #fff; border: 1px solid var(--border); border-radius: var(--radius-lg); margin-bottom: 14px; overflow: hidden; box-shadow: var(--shadow); }
	.card.actionable { border-color: #F3C79A; }
	.card-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #FFF9EE; border-bottom: 1px solid var(--border); }
	.ch-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
	.onum { font-weight: 800; color: var(--accent); }
	.cust { font-weight: 700; }
	.heading { color: #6B6456; font-size: .85rem; }
	.cur { color: #9A8A6A; font-weight: 700; font-size: .8rem; }

	.tbl-scroll { overflow-x: auto; }
	table { width: 100%; border-collapse: collapse; font-size: .88rem; }
	th { text-align: left; padding: 8px 12px; color: #9A8A6A; font-weight: 700; font-size: .72rem; text-transform: uppercase; letter-spacing: .03em; border-bottom: 1px solid #F0E8D4; }
	td { padding: 9px 12px; border-bottom: 1px solid #F5EFE0; vertical-align: middle; }
	tr:last-child td { border-bottom: none; }
	.c-num { text-align: right; white-space: nowrap; }
	.c-sku { white-space: nowrap; }
	.c-name { min-width: 180px; }
	.c-action { min-width: 260px; }
	.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .82rem; }
	.muted { color: #B6A684; }
	tr.st-no_colli td { background: #FBFAF6; }

	.tag { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: .72rem; font-weight: 700; }
	.tag-colli { background: #DCFCE7; color: #15803D; }
	.tag-warn  { background: #FEE9D6; color: #C2560F; }
	.tag-grey  { background: #EFEADF; color: #8A7E66; }

	.accept { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
	.accept input { width: 15px; height: 15px; accent-color: var(--accent); }
	.res { color: #16A34A; font-weight: 700; font-size: .82rem; }

	.choice-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
	.seg { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
	.seg button { background: #fff; border: none; padding: 5px 10px; font-size: .82rem; font-weight: 700; color: #6B6456; border-right: 1px solid var(--border); white-space: nowrap; }
	.seg button:last-child { border-right: none; }
	.seg button.on { background: var(--accent); color: #fff; }

	.banner { padding: 11px 15px; border-radius: var(--radius); margin-bottom: 14px; font-size: .9rem; font-weight: 600; }
	.banner.ok { background: #DCFCE7; color: #15803D; }
	.banner.err { background: #FEE2E2; color: #B91C1C; }
	.fail-list { margin: 6px 0 0 18px; font-weight: 500; font-size: .85rem; }

	.state { text-align: center; padding: 70px 20px; color: #6B6456; }
	.spinner { width: 34px; height: 34px; border: 3px solid #EADFBE; border-top-color: var(--accent); border-radius: 50%; margin: 0 auto 14px; animation: spin .8s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }

	.bar { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid var(--border); box-shadow: 0 -4px 20px rgba(100,60,0,.08); padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; z-index: 40; }
	.bar-count { font-weight: 700; color: #18181B; }

	.overlay { position: fixed; inset: 0; background: rgba(40,28,10,.45); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 50; }
	.modal { background: #fff; border-radius: var(--radius-lg); max-width: 640px; width: 100%; max-height: 85vh; display: flex; flex-direction: column; box-shadow: var(--shadow-lg); }
	.modal h2 { padding: 18px 20px 0; font-size: 1.2rem; font-weight: 800; }
	.modal-sub { padding: 4px 20px 0; color: #6B6456; font-size: .88rem; }
	.modal-body { padding: 14px 20px; overflow-y: auto; }
	.sum-draft { margin-bottom: 14px; }
	.sum-head { font-weight: 800; color: var(--accent); margin-bottom: 4px; font-size: .9rem; }
	.sum-draft ul { list-style: none; }
	.sum-draft li { padding: 6px 0; border-bottom: 1px solid #F5EFE0; font-size: .86rem; }
	.sum-detail { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 3px; align-items: center; }
	.chg { background: #FFF3E4; color: #C2560F; padding: 1px 7px; border-radius: 6px; font-size: .8rem; font-weight: 600; }
	.chg-rm { background: #FEE2E2; color: #B91C1C; padding: 1px 7px; border-radius: 6px; font-size: .8rem; font-weight: 700; }
	.why { color: #9A8A6A; font-size: .8rem; }
	.modal-foot { padding: 14px 20px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 10px; }

	@media (max-width: 640px) {
		.head { flex-direction: column; }
		.c-name { min-width: 120px; }
	}
</style>
