<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	// ── Status (from dates) ─────────────────────────────────────────────────────
	const TABS = [
		{ key: 'active', label: 'Active' },
		{ key: 'upcoming', label: 'Upcoming' },
		{ key: 'expired', label: 'Expired' },
	];
	let tab = $state('active');
	let search = $state('');

	function statusOf(d) {
		if (d.start_date && d.start_date > data.today) return 'upcoming';
		if (d.end_date && d.end_date < data.today) return 'expired';
		return 'active';
	}
	const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

	// Two agreements for the same SKU + market whose periods overlap = conflict.
	const conflicts = $derived.by(() => {
		const out = new Set();
		const lo = (d) => d.start_date ?? '0000-00-00';
		const hi = (d) => d.end_date ?? '9999-12-31';
		const ds = data.deals ?? [];
		for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) {
			const a = ds[i], b = ds[j];
			if (a.sku.toLowerCase() !== b.sku.toLowerCase() || a.market !== b.market) continue;
			if (lo(a) <= hi(b) && lo(b) <= hi(a)) { out.add(a.id); out.add(b.id); }
		}
		return out;
	});

	const counts = $derived.by(() => {
		const c = { active: 0, upcoming: 0, expired: 0 };
		for (const d of data.deals ?? []) c[statusOf(d)]++;
		return c;
	});

	// Per market → rows sorted by product, for the current tab + search.
	const byMarket = $derived.by(() => {
		const q = search.trim().toLowerCase();
		const rows = (data.deals ?? []).filter((d) => statusOf(d) === tab).filter((d) => !q
			|| d.sku.toLowerCase().includes(q)
			|| (d.product_name ?? '').toLowerCase().includes(q)
			|| d.parties.some((p) => p.label.toLowerCase().includes(q)));
		return data.markets
			.map((m) => ({
				market: m,
				rows: rows.filter((d) => d.market === m)
					.sort((a, b) => (a.product_name ?? a.sku).localeCompare(b.product_name ?? b.sku, 'en', { sensitivity: 'base' })),
			}))
			.filter((g) => g.rows.length);
	});

	// ── Date labels ─────────────────────────────────────────────────────────────
	const MON = ['jan.', 'feb.', 'mar.', 'apr.', 'may', 'jun.', 'jul.', 'aug.', 'sep.', 'oct.', 'nov.', 'dec.'];
	const fdate = (s) => { const d = new Date(s + 'T00:00:00Z'); return `${d.getUTCDate()}. ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
	function periodLabel(d) {
		if (d.start_date && d.end_date) return `${fdate(d.start_date)} – ${fdate(d.end_date)}`;
		if (d.start_date) return `From ${fdate(d.start_date)}`;
		if (d.end_date) return `Until ${fdate(d.end_date)}`;
		return 'No set period';
	}
	function hintOf(d) {
		const s = statusOf(d);
		if (s === 'upcoming') { const n = dayDiff(data.today, d.start_date); return { text: `starts in ${n} ${n === 1 ? 'day' : 'days'}`, cls: 'soon' }; }
		if (s === 'expired') { const n = dayDiff(d.end_date, data.today); return { text: `ended ${n} ${n === 1 ? 'day' : 'days'} ago`, cls: '' }; }
		if (!d.end_date) return { text: 'open-ended', cls: '' };
		const n = dayDiff(data.today, d.end_date);
		return { text: n === 0 ? 'ends today' : `ends in ${n} ${n === 1 ? 'day' : 'days'}`, cls: n <= 30 ? 'warn' : '' };
	}

	// ── Add / edit dialog ───────────────────────────────────────────────────────
	let open = $state(false);
	let editId = $state(null);
	let form = $state(blank());
	let saving = $state(false);
	let formError = $state('');

	function blank() {
		return { sku: '', product_name: '', market: 'DK', start_date: '', end_date: '', note: '', parties: [] };
	}
	function openNew() {
		editId = null; form = blank(); formError = ''; skuQ = ''; custQ = ''; skuHits = []; custHits = []; open = true;
	}
	function openEdit(d) {
		editId = d.id;
		form = {
			sku: d.sku, product_name: d.product_name ?? '', market: d.market,
			start_date: d.start_date ?? '', end_date: d.end_date ?? '', note: d.note ?? '',
			parties: d.parties.map((p) => ({ ...p })),
		};
		formError = ''; skuQ = ''; custQ = ''; skuHits = []; custHits = []; open = true;
	}
	function close() { if (!saving) open = false; }

	// SKU typeahead (Sheets). Free text is accepted as the SKU too.
	let skuQ = $state('');
	let skuHits = $state([]);
	let skuTimer;
	function onSkuInput(e) {
		skuQ = e.currentTarget.value;
		form.sku = skuQ.trim();
		form.product_name = '';
		clearTimeout(skuTimer);
		if (skuQ.trim().length < 2) { skuHits = []; return; }
		skuTimer = setTimeout(async () => {
			const r = await fetch(`/api/admin/exclusivity?type=product&q=${encodeURIComponent(skuQ.trim())}`);
			skuHits = r.ok ? await r.json() : [];
		}, 200);
	}
	function pickSku(h) { form.sku = h.sku; form.product_name = h.label; skuQ = ''; skuHits = []; }

	// Customer typeahead (groups + companies, current market first).
	let custQ = $state('');
	let custHits = $state([]);
	let custTimer;
	function onCustInput(e) {
		custQ = e.currentTarget.value;
		clearTimeout(custTimer);
		if (custQ.trim().length < 2) { custHits = []; return; }
		custTimer = setTimeout(async () => {
			const r = await fetch(`/api/admin/exclusivity?type=customer&market=${form.market}&q=${encodeURIComponent(custQ.trim())}`);
			custHits = r.ok ? await r.json() : [];
		}, 200);
	}
	const hasParty = (h) => form.parties.some((p) => p.kind === h.kind && p.ref === h.ref);
	function addParty(h) { if (!hasParty(h)) form.parties = [...form.parties, { kind: h.kind, ref: h.ref, label: h.label }]; custQ = ''; custHits = []; }
	function removeParty(p) { form.parties = form.parties.filter((x) => !(x.kind === p.kind && x.ref === p.ref)); }

	// Live overlap warning for the agreement being edited.
	const formConflict = $derived.by(() => {
		if (!form.sku || !form.market) return null;
		const lo = form.start_date || '0000-00-00', hi = form.end_date || '9999-12-31';
		return (data.deals ?? []).find((d) => d.id !== editId && d.sku.toLowerCase() === form.sku.toLowerCase() && d.market === form.market
			&& lo <= (d.end_date ?? '9999-12-31') && (d.start_date ?? '0000-00-00') <= hi) ?? null;
	});

	async function save() {
		formError = '';
		saving = true;
		try {
			const res = await fetch(editId ? `/api/admin/exclusivity/${editId}` : '/api/admin/exclusivity', {
				method: editId ? 'PUT' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...form, start_date: form.start_date || null, end_date: form.end_date || null }),
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) { formError = body.message ?? `Save failed (${res.status})`; return; }
			open = false;
			await invalidateAll();
		} finally { saving = false; }
	}
	async function remove() {
		if (!editId || !confirm('Delete this exclusivity agreement? This cannot be undone.')) return;
		saving = true;
		try {
			const res = await fetch(`/api/admin/exclusivity/${editId}`, { method: 'DELETE' });
			if (!res.ok) { formError = `Delete failed (${res.status})`; return; }
			open = false;
			await invalidateAll();
		} finally { saving = false; }
	}
	// "End now": set the end date to yesterday so it moves to Expired.
	function endNow() {
		const d = new Date(data.today + 'T00:00:00Z');
		d.setUTCDate(d.getUTCDate() - 1);
		form.end_date = d.toISOString().slice(0, 10);
		if (form.start_date && form.start_date > form.end_date) form.start_date = form.end_date;
	}
	const editingStatus = $derived(editId ? statusOf(data.deals.find((d) => d.id === editId) ?? {}) : null);
</script>

<svelte:head><title>Exclusivity — Admin</title></svelte:head>
<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && open) close(); }} />

<AppNav user={data.user} active="exclusivity" />

<main>
	<div class="section-head">
		<h2>Exclusivity</h2>
		<button class="new-btn" type="button" onclick={openNew} disabled={!data.ready}>+ New agreement</button>
	</div>

	{#if !data.ready}
		<div class="empty">
			{#if data.noTable}
				<p><strong>Not set up yet.</strong></p>
				<p class="muted">Apply <code>migrations/0103_exclusivity.sql</code> to <code>portal-db</code> to create the exclusivity tables.</p>
			{:else}
				<p><strong>Couldn’t load agreements.</strong></p>
				<p class="muted mono">{data.message}</p>
			{/if}
		</div>
	{:else}
		<div class="bar">
			<div class="dim-tabs" role="tablist">
				{#each TABS as t}
					<button class="dim-tab" class:on={tab === t.key} role="tab" aria-selected={tab === t.key} onclick={() => (tab = t.key)}>
						{t.label}<span class="tab-n">{counts[t.key]}</span>
					</button>
				{/each}
			</div>
			<div class="dim-search">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
				<input type="text" bind:value={search} placeholder="Search SKU, product or customer…" aria-label="Search agreements" />
				{#if search}<button class="dim-search-clear" onclick={() => (search = '')} aria-label="Clear search">×</button>{/if}
			</div>
		</div>

		{#if byMarket.length === 0}
			<div class="empty">
				<p><strong>{search ? 'No matches.' : `No ${tab} agreements.`}</strong></p>
				{#if !search && tab === 'active'}<p class="muted">Use <em>New agreement</em> to make a product exclusive to one or more customers in a market.</p>{/if}
			</div>
		{/if}

		{#each byMarket as g (g.market)}
			<section class="market">
				<div class="m-head">
					<span class="m-code">{g.market}</span>
					<h3>{data.marketLabel[g.market]}</h3>
					<span class="count">{g.rows.length} {g.rows.length === 1 ? 'product' : 'products'}</span>
				</div>
				<table>
					<colgroup><col style="width:120px" /><col /><col style="width:34%" /><col style="width:230px" /><col style="width:44px" /></colgroup>
					<thead><tr><th>SKU</th><th>Product</th><th>Exclusive to</th><th>Period</th><th></th></tr></thead>
					<tbody>
						{#each g.rows as d (d.id)}
							{@const h = hintOf(d)}
							<tr>
								<td class="sku">{d.sku}</td>
								<td class="name">
									{d.product_name ?? d.sku}
									{#if conflicts.has(d.id)}<span class="flag" title="Another agreement for this SKU and market overlaps this period">Overlaps</span>{/if}
									{#if d.note}<span class="note">{d.note}</span>{/if}
								</td>
								<td>
									<div class="chips">
										{#each d.parties as p}
											<span class="chip" class:grp={p.kind === 'group'} title={p.kind === 'group' ? 'Whole customer group' : 'Single company'}>
												{#if p.kind === 'group'}<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>{/if}
												{p.label}
											</span>
										{/each}
									</div>
								</td>
								<td class="period">{periodLabel(d)}<span class="hint {h.cls}">{h.text}</span></td>
								<td><button class="edit" type="button" onclick={() => openEdit(d)} aria-label="Edit agreement" title="Edit">
									<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
								</button></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
		{/each}
	{/if}
</main>

{#if open}
	<div class="overlay" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) close(); }}>
		<div class="modal" role="dialog" aria-modal="true" aria-label={editId ? 'Edit agreement' : 'New agreement'}>
			<h3>{editId ? 'Edit agreement' : 'New exclusivity agreement'}</h3>

			<label class="fl" for="ex-sku">Product</label>
			{#if form.sku && form.product_name && !skuQ}
				<div class="picked">
					<span class="sku">{form.sku}</span><span class="pname">{form.product_name}</span>
					<button type="button" class="link" onclick={() => { skuQ = form.sku; form.product_name = ''; }}>Change</button>
				</div>
			{:else}
				<div class="ta">
					<input id="ex-sku" class="in" placeholder="Search SKU or product name…" value={skuQ || form.sku} oninput={onSkuInput} autocomplete="off" />
					{#if skuHits.length}
						<div class="hits">
							{#each skuHits as h}
								<button type="button" class="hit" onclick={() => pickSku(h)}><span class="sku">{h.sku}</span>{h.label}</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<span class="fl">Market</span>
			<div class="pub-toggle" role="group" aria-label="Market">
				{#each data.markets as m}
					<button type="button" class:active={form.market === m} onclick={() => (form.market = m)}>{data.marketLabel[m]}</button>
				{/each}
			</div>

			<label class="fl" for="ex-cust">Exclusive to</label>
			{#if form.parties.length}
				<div class="chips edit-chips">
					{#each form.parties as p}
						<span class="chip" class:grp={p.kind === 'group'}>
							{p.kind === 'group' ? 'Group: ' : ''}{p.label}
							<button type="button" class="x" onclick={() => removeParty(p)} aria-label={`Remove ${p.label}`}>×</button>
						</span>
					{/each}
				</div>
			{/if}
			<div class="ta">
				<input id="ex-cust" class="in" placeholder="Search customer group or company…" value={custQ} oninput={onCustInput} autocomplete="off" />
				{#if custHits.length}
					<div class="hits">
						{#each custHits as h}
							<button type="button" class="hit" disabled={hasParty(h)} onclick={() => addParty(h)}>
								<span class="hl">{h.label}</span><span class="hh">{h.hint}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<div class="dates">
				<div>
					<label class="fl" for="ex-from">From <span class="opt">optional</span></label>
					<input id="ex-from" class="in" type="date" bind:value={form.start_date} max={form.end_date || undefined} />
				</div>
				<div>
					<label class="fl" for="ex-to">To <span class="opt">optional</span></label>
					<input id="ex-to" class="in" type="date" bind:value={form.end_date} min={form.start_date || undefined} />
				</div>
			</div>
			<p class="help">Leave <em>From</em> empty if it already applies; leave <em>To</em> empty for no end date.</p>

			<label class="fl" for="ex-note">Note <span class="opt">optional</span></label>
			<textarea id="ex-note" class="in" rows="2" bind:value={form.note} placeholder="e.g. Christmas campaign, contract ref…"></textarea>

			{#if formConflict}
				<div class="warn-box">Overlaps an existing agreement for {formConflict.sku} in {data.marketLabel[formConflict.market]} ({periodLabel(formConflict)}). You can still save.</div>
			{/if}
			{#if formError}<div class="err-box">{formError}</div>{/if}

			<div class="actions">
				{#if editId}
					<button type="button" class="danger" onclick={remove} disabled={saving}>Delete</button>
					{#if editingStatus === 'active'}<button type="button" class="ghost" onclick={endNow} disabled={saving} title="Set the end date to yesterday">End now</button>{/if}
				{/if}
				<span class="grow"></span>
				<button type="button" class="ghost" onclick={close} disabled={saving}>Cancel</button>
				<button type="button" class="primary" onclick={save} disabled={saving || !form.sku || !form.parties.length}>{saving ? 'Saving…' : editId ? 'Save' : 'Create agreement'}</button>
			</div>
		</div>
	</div>
{/if}

<style>
	main { max-width: 1200px; margin: 0 auto; width: 100%; padding: 28px 28px 80px; box-sizing: border-box; }
	.section-head { display: flex; align-items: center; gap: 14px; margin: 4px 0 18px; }
	.section-head h2 { font-size: 15px; font-weight: 800; letter-spacing: -0.2px; color: #18181B; margin: 0; white-space: nowrap; }
	.section-head::after { content: ''; flex: 1; height: 1px; background: var(--border); order: 1; }
	.new-btn { order: 2; font-family: inherit; font-size: 13px; font-weight: 700; color: #fff; background: var(--accent); border: 0; border-radius: 8px; padding: 7px 14px; cursor: pointer; }
	.new-btn:hover { background: var(--accent-hover); }
	.new-btn:disabled { opacity: .5; cursor: default; }

	.empty { border: 1px dashed var(--border); border-radius: var(--radius-lg); padding: 36px; text-align: center; background: #FBFAF7; margin-bottom: 18px; }
	.muted { color: #9A8A6A; font-size: 13px; }
	.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; }
	code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; background: #F4F1EA; padding: 1px 5px; border-radius: 5px; }

	.bar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 18px; }
	.dim-tabs { display: flex; gap: 4px; flex: 1; min-width: 0; }
	.dim-tab { font-family: inherit; font-size: 13px; font-weight: 700; color: #6B7280; background: transparent; border: none; padding: 6px 12px; border-radius: 8px; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 7px; }
	.dim-tab:hover { background: #F4F4F5; color: #18181B; }
	.dim-tab.on { background: #18181B; color: #fff; }
	.tab-n { font-size: 11px; font-weight: 800; background: rgba(0,0,0,.07); border-radius: 100px; padding: 1px 7px; }
	.dim-tab.on .tab-n { background: rgba(255,255,255,.18); }
	.dim-search { display: inline-flex; align-items: center; gap: 7px; width: 300px; max-width: 100%; padding: 6px 10px; border: 1px solid var(--border); border-radius: 8px; background: #fff; }
	.dim-search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(245,120,50,.12); }
	.dim-search svg { color: #B7A579; flex-shrink: 0; }
	.dim-search input { flex: 1; min-width: 0; border: none; background: none; outline: none; font-family: inherit; font-size: 13px; color: #3f3a33; }
	.dim-search-clear { border: none; background: none; cursor: pointer; color: #A88B52; font-size: 16px; line-height: 1; padding: 0 2px; }

	.market { background: #fff; border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow); overflow: hidden; margin-bottom: 18px; }
	.m-head { display: flex; align-items: center; gap: 10px; padding: 14px 20px; border-bottom: 1px solid var(--border); }
	.m-head h3 { font-size: 15px; font-weight: 800; color: #18181B; margin: 0; flex: 1; }
	.m-code { font-size: 11px; font-weight: 800; color: #7B3803; background: #FBEFCB; border-radius: 6px; padding: 3px 7px; letter-spacing: .03em; }
	.count { font-size: 12px; font-weight: 700; color: #A88B52; background: #FFF5D2; padding: 2px 9px; border-radius: 100px; }

	table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
	thead th { background: #FBEFCB; color: #7B3803; font-weight: 800; text-align: left; padding: 10px 20px; white-space: nowrap; border-bottom: 1px solid var(--border); }
	tbody td { padding: 11px 20px; border-bottom: 1px solid #F5EDD8; color: #3f3a33; vertical-align: middle; }
	tbody tr:last-child td { border-bottom: none; }
	tbody tr:nth-child(even) td { background: #FFFBEF; }
	tbody tr:hover td { background: #FFF5D2; }
	td.sku, .hit .sku, .picked .sku { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; color: #8A7A5C; }
	td.name { font-weight: 700; color: #18181B; }
	.note { display: block; font-size: 12px; font-weight: 500; color: #9A8A6A; margin-top: 2px; }
	.flag { margin-left: 8px; font-size: 11px; font-weight: 800; color: #C4381B; background: #FDECEC; border-radius: 999px; padding: 2px 8px; vertical-align: 1px; }
	.chips { display: flex; flex-wrap: wrap; gap: 5px; }
	.chip { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 700; color: #3F3F46; background: #F4F1EA; border-radius: 999px; padding: 3px 10px; }
	.chip.grp { background: #FFE6A5; color: #7B3803; }
	.period { white-space: nowrap; font-size: 13px; }
	.hint { display: block; font-size: 11.5px; font-weight: 600; color: #A89C84; }
	.hint.warn { color: #B4611A; }
	.hint.soon { color: #16794C; }
	.edit { border: 1px solid transparent; background: none; color: #A89C84; border-radius: 7px; padding: 5px; cursor: pointer; display: grid; place-items: center; }
	.edit:hover { color: #7B3803; background: #fff; border-color: var(--border); }

	/* Dialog */
	.overlay { position: fixed; inset: 0; z-index: 200; background: rgba(24,24,27,.35); display: grid; place-items: center; padding: 16px; }
	.modal { width: 560px; max-width: 100%; max-height: calc(100vh - 32px); overflow: auto; background: #fff; border-radius: 16px; box-shadow: var(--shadow-lg); padding: 22px 24px 18px; box-sizing: border-box; }
	.modal h3 { margin: 0 0 14px; font-size: 17px; font-weight: 800; color: #18181B; }
	.fl { display: block; font-size: 12px; font-weight: 800; color: #6B6355; margin: 14px 0 6px; }
	.opt { font-weight: 600; color: #B5A98F; margin-left: 4px; }
	.in { width: 100%; box-sizing: border-box; font-family: inherit; font-size: 13.5px; border: 1px solid var(--border); border-radius: 9px; padding: 8px 11px; color: #27272A; background: #fff; }
	.in:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(245,120,50,.12); }
	textarea.in { resize: vertical; }
	.ta { position: relative; }
	.hits { position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 5; background: #fff; border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow-lg); max-height: 260px; overflow: auto; padding: 4px; }
	.hit { display: flex; align-items: baseline; gap: 10px; width: 100%; text-align: left; border: 0; background: none; font-family: inherit; font-size: 13px; color: #27272A; padding: 7px 9px; border-radius: 7px; cursor: pointer; }
	.hit:hover:not(:disabled) { background: #FFF5D2; }
	.hit:disabled { opacity: .45; cursor: default; }
	.hl { font-weight: 700; }
	.hh { font-size: 11.5px; color: #9A8A6A; margin-left: auto; white-space: nowrap; }
	.picked { display: flex; align-items: center; gap: 10px; border: 1px solid var(--border); border-radius: 9px; padding: 8px 11px; background: #FBFAF7; }
	.pname { font-weight: 700; color: #18181B; flex: 1; }
	.link { border: 0; background: none; color: var(--accent); font-weight: 700; font-size: 12.5px; cursor: pointer; font-family: inherit; }
	.pub-toggle { display: inline-flex; flex-wrap: wrap; border: 1px solid var(--border); border-radius: 100px; overflow: hidden; }
	.pub-toggle button { border: none; background: #fff; color: #71717A; font-size: 12px; font-weight: 700; font-family: inherit; padding: 6px 13px; cursor: pointer; white-space: nowrap; }
	.pub-toggle button.active { background: var(--accent); color: #fff; }
	.edit-chips { margin-bottom: 8px; }
	.x { border: 0; background: none; color: inherit; opacity: .6; cursor: pointer; font-size: 14px; line-height: 1; padding: 0 0 0 2px; }
	.x:hover { opacity: 1; }
	.dates { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	.help { font-size: 12px; color: #9A8A6A; margin: 6px 0 0; }
	.warn-box { margin-top: 14px; font-size: 12.5px; font-weight: 600; color: #B4611A; background: #FDEBD2; border-radius: 9px; padding: 9px 12px; }
	.err-box { margin-top: 14px; font-size: 12.5px; font-weight: 600; color: #C4381B; background: #FDECEC; border-radius: 9px; padding: 9px 12px; }
	.actions { display: flex; align-items: center; gap: 8px; margin-top: 20px; }
	.grow { flex: 1; }
	.actions button { font-family: inherit; font-size: 13px; font-weight: 700; border-radius: 8px; padding: 8px 14px; cursor: pointer; border: 1px solid transparent; }
	.primary { background: var(--accent); color: #fff; }
	.primary:hover:not(:disabled) { background: var(--accent-hover); }
	.ghost { background: #fff; color: #524431; border-color: var(--border) !important; }
	.ghost:hover:not(:disabled) { background: #FAF6EE; }
	.danger { background: #fff; color: #C4381B; border-color: #F3C7C0 !important; }
	.danger:hover:not(:disabled) { background: #FDECEC; }
	.actions button:disabled { opacity: .5; cursor: default; }

	@media (max-width: 720px) {
		colgroup { display: none; }
		.dates { grid-template-columns: 1fr; }
	}
</style>
