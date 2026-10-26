<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	let file = $state(null);
	let busy = $state(false);
	let err = $state('');
	let plan = $state(null);          // dry-run result
	let applied = $state(null);       // { done, total, created, updated, errors }

	const fmt = (n) => (n ?? 0).toLocaleString('da-DK');

	async function dryRun() {
		if (!file || busy) return;
		busy = true; err = ''; plan = null; applied = null;
		try {
			const fd = new FormData(); fd.append('file', file);
			const res = await fetch('/api/admin/product-import', { method: 'POST', body: fd });
			if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || `Dry-run failed (${res.status})`);
			plan = await res.json();
		} catch (e) { err = e.message; }
		busy = false;
	}

	async function apply() {
		if (!plan || busy) return;
		const s = plan.summary;
		if (!confirm(`Apply to PRODUCTION?\n\n• ${fmt(s.create)} new sheets\n• ${fmt(s.update)} existing updated\n• ${fmt(s.publishedChanges)} published-market changes\n• ${fmt(s.categoryChanges)} category changes\n\nPL is never touched. Continue?`)) return;
		busy = true; err = '';
		const items = plan.items;
		const CHUNK = 200;
		applied = { done: 0, total: items.length, created: 0, updated: 0, errors: [] };
		try {
			for (let i = 0; i < items.length; i += CHUNK) {
				const res = await fetch('/api/admin/product-import/apply', {
					method: 'POST', headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ items: items.slice(i, i + CHUNK) })
				});
				if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || `Apply failed at row ${i} (${res.status})`);
				const r = await res.json();
				applied = {
					done: Math.min(i + CHUNK, items.length), total: items.length,
					created: applied.created + r.created, updated: applied.updated + r.updated,
					errors: [...applied.errors, ...r.errors]
				};
			}
		} catch (e) { err = e.message; }
		busy = false;
	}

	const unmappedList = (obj) => Object.entries(obj ?? {}).sort((a, b) => b[1] - a[1]);
</script>

<svelte:head><title>Product Import — Admin</title></svelte:head>
<AppNav active="product-import" user={data.user} />

<main class="page">
	<div class="head">
		<h1>Product Import</h1>
		<p>One-time migration from the shop CSV. Syncs SKU, name (new only), published markets (DK/SE/NO/INT — <strong>PL never touched</strong>), Game Type + Type categories, and preorder/restock dates. Everything else is ignored.</p>
	</div>

	<div class="card up">
		<input type="file" accept=".csv,text/csv" onchange={(e) => { file = e.currentTarget.files?.[0] ?? null; plan = null; applied = null; }} />
		<button class="btn" disabled={!file || busy} onclick={dryRun}>{busy && !applied ? 'Analysing…' : 'Dry-run'}</button>
		<span class="fname">{file?.name ?? 'No file chosen'}</span>
	</div>

	{#if err}<div class="err">{err}</div>{/if}

	{#if plan}
		{@const s = plan.summary}
		<div class="grid">
			<div class="stat"><span class="n">{fmt(s.totalRows)}</span><span class="l">CSV rows</span></div>
			<div class="stat good"><span class="n">{fmt(s.create)}</span><span class="l">New sheets</span></div>
			<div class="stat"><span class="n">{fmt(s.update)}</span><span class="l">Existing updated</span></div>
			<div class="stat"><span class="n">{fmt(s.publishedChanges)}</span><span class="l">Published changes</span></div>
			<div class="stat"><span class="n">{fmt(s.categoryChanges)}</span><span class="l">Category changes</span></div>
			<div class="stat"><span class="n">{fmt(s.dateChanges)}</span><span class="l">With dates</span></div>
			<div class="stat warn"><span class="n">{fmt(s.notMirroredCount)}</span><span class="l">Publish not mirrored (licence)</span></div>
		</div>

		<div class="cols">
			<div class="card">
				<h2>Unmapped categories (skipped)</h2>
				<p class="hint">These CSV values have no matching Portal category and are ignored.</p>
				<div class="sub">Spiltype → Game Type</div>
				{#if unmappedList(plan.reports.unmappedCategories.Spiltype).length}
					<ul>{#each unmappedList(plan.reports.unmappedCategories.Spiltype) as [t, n]}<li><span>{t}</span><b>{fmt(n)}</b></li>{/each}</ul>
				{:else}<p class="none">All mapped ✓</p>{/if}
				<div class="sub">Typen → Type</div>
				{#if unmappedList(plan.reports.unmappedCategories.Typen).length}
					<ul>{#each unmappedList(plan.reports.unmappedCategories.Typen) as [t, n]}<li><span>{t}</span><b>{fmt(n)}</b></li>{/each}</ul>
				{:else}<p class="none">All mapped ✓</p>{/if}
			</div>

			<div class="card">
				<h2>Publish not mirrored</h2>
				<p class="hint">CSV wants these markets published, but the product's publisher isn't licensed — left unpublished (no override).</p>
				{#if plan.reports.notMirrored.length}
					<ul class="scroll">{#each plan.reports.notMirrored as r}<li><span>{r.sku}</span><b>{r.markets.join(', ')}</b></li>{/each}</ul>
					{#if plan.reports.notMirroredTruncated}<p class="none">+ {fmt(plan.reports.notMirroredTruncated)} more…</p>{/if}
				{:else}<p class="none">None — everything mirrors ✓</p>{/if}
			</div>

			<div class="card">
				<h2>Date samples</h2>
				<p class="hint">Parsed to Europe/Copenhagen date (UTC-aware).</p>
				{#if plan.reports.dateSamples.length}
					<ul>{#each plan.reports.dateSamples as d}<li><span>{d.sku}</span><b>pre {d.preorder ?? '–'} · re {d.restock ?? '–'}</b></li>{/each}</ul>
				{:else}<p class="none">No dates in file.</p>{/if}
			</div>
		</div>

		<div class="apply-bar">
			<button class="btn apply" disabled={busy} onclick={apply}>{busy && applied ? `Applying… ${fmt(applied.done)}/${fmt(applied.total)}` : 'Apply to production'}</button>
			{#if applied}
				<span class="prog">Created {fmt(applied.created)} · Updated {fmt(applied.updated)} · Errors {fmt(applied.errors.length)}</span>
			{/if}
		</div>

		{#if applied?.errors?.length}
			<div class="card errbox">
				<h2>Errors ({fmt(applied.errors.length)})</h2>
				<ul class="scroll">{#each applied.errors.slice(0, 100) as e}<li><span>{e.sku}</span><b>{e.error}</b></li>{/each}</ul>
			</div>
		{/if}
		{#if applied && applied.done >= applied.total && !applied.errors.length && !busy}
			<div class="done">✓ Import complete — {fmt(applied.created)} created, {fmt(applied.updated)} updated.</div>
		{/if}
	{/if}
</main>

<style>
	.page { max-width: 1120px; margin: 0 auto; padding: 32px 24px 80px; }
	.head h1 { font-size: 22px; font-weight: 800; color: #18181B; margin: 0 0 6px; }
	.head p { font-size: 13px; color: #71717A; margin: 0 0 20px; line-height: 1.6; max-width: 820px; }
	.card { background: #fff; border: 1px solid var(--border, #E4E4E7); border-radius: 14px; padding: 16px 18px; }
	.up { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
	.up .fname { font-size: 12.5px; color: #71717A; }
	.btn { background: #F57832; color: #fff; border: none; border-radius: 9px; padding: 9px 16px; font-size: 13px; font-weight: 700; font-family: inherit; cursor: pointer; }
	.btn:disabled { opacity: 0.55; cursor: default; }
	.btn.apply { background: #15803D; }
	.err { margin-top: 14px; background: #FEF2F2; border: 1px solid #FECACA; color: #B91C1C; border-radius: 10px; padding: 10px 14px; font-size: 13px; font-weight: 600; }
	.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 18px 0; }
	.stat { background: #fff; border: 1px solid var(--border, #E4E4E7); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; }
	.stat .n { font-size: 22px; font-weight: 800; color: #18181B; }
	.stat .l { font-size: 11px; font-weight: 600; color: #8a7550; }
	.stat.good .n { color: #15803D; } .stat.warn .n { color: #B45309; }
	.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; margin-bottom: 18px; }
	.card h2 { font-size: 14px; font-weight: 800; color: #18181B; margin: 0 0 4px; }
	.hint { font-size: 11.5px; color: #A1A1AA; margin: 0 0 10px; line-height: 1.4; }
	.sub { font-size: 11px; font-weight: 700; color: #8a7550; text-transform: uppercase; letter-spacing: 0.3px; margin: 10px 0 4px; }
	.card ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
	.card ul.scroll { max-height: 260px; overflow: auto; }
	.card li { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; padding: 3px 0; border-bottom: 1px solid #F5F0E4; }
	.card li span { color: #27272A; } .card li b { color: #8a7550; font-weight: 700; white-space: nowrap; }
	.none { font-size: 12px; color: #A1A1AA; margin: 4px 0 0; }
	.apply-bar { display: flex; align-items: center; gap: 14px; }
	.prog { font-size: 13px; font-weight: 600; color: #52525B; }
	.errbox { margin-top: 14px; border-color: #FECACA; }
	.done { margin-top: 14px; background: #EAF7EE; border: 1px solid #BBE7C6; color: #15803D; border-radius: 10px; padding: 12px 16px; font-size: 14px; font-weight: 700; }
</style>
