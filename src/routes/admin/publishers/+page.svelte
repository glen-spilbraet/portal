<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	let rows = $state(data.prefixes.map((p) => ({ ...p, saved: false, saving: false })));
	let overrides = $state([...data.overrides]);
	let search = $state('');
	let resolving = $state(false);
	let resolvedMsg = $state('');

	const numFmt = new Intl.NumberFormat('da-DK');
	const dkkFmt = (n) => numFmt.format(Math.round(n ?? 0)) + ' kr';

	const filtered = $derived(
		search.trim()
			? rows.filter((r) => r.prefix.toLowerCase().includes(search.trim().toLowerCase()) || (r.publisher ?? '').toLowerCase().includes(search.trim().toLowerCase()))
			: rows
	);
	const mappedCount = $derived(rows.filter((r) => r.publisher.trim()).length);

	async function savePrefix(row) {
		row.saving = true; row.saved = false;
		try {
			const res = await fetch('/api/admin/publisher-map', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prefix: row.prefix, publisher: row.publisher }),
			});
			if (!res.ok) throw new Error('save failed');
			row.saved = true;
			setTimeout(() => (row.saved = false), 1500);
		} catch {
			alert(`Could not save ${row.prefix}`);
		} finally {
			row.saving = false;
		}
	}

	async function resolveAll() {
		if (!confirm('Apply the current mapping to all line items? (~3s)')) return;
		resolving = true; resolvedMsg = '';
		try {
			const res = await fetch('/api/admin/publisher-map', {
				method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'resolve' }),
			});
			if (!res.ok) throw new Error('failed');
			resolvedMsg = 'Applied to all line items ✓';
		} catch {
			resolvedMsg = 'Failed — try again';
		} finally {
			resolving = false;
		}
	}

	// ── Overrides (per-SKU, e.g. SBDK) ────────────────────────────────────────
	let newSku = $state('');
	let newPub = $state('');
	async function addOverride() {
		const sku = newSku.trim(); const publisher = newPub.trim();
		if (!sku || !publisher) return;
		const res = await fetch('/api/admin/publisher-map', {
			method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'override', sku, publisher }),
		});
		if (res.ok) { overrides = [...overrides.filter((o) => o.sku !== sku), { sku, publisher }].sort((a, b) => a.sku.localeCompare(b.sku)); newSku = ''; newPub = ''; }
		else alert('Could not add override');
	}
	async function removeOverride(sku) {
		const res = await fetch('/api/admin/publisher-map', {
			method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'override', sku, publisher: '' }),
		});
		if (res.ok) overrides = overrides.filter((o) => o.sku !== sku);
	}
</script>

<svelte:head><title>Publisher Mapping — Admin</title></svelte:head>

<AppNav active="publishers" user={data.user} />

<main class="page">
	<div class="page-header">
		<div>
			<h1 class="page-title">Publisher Mapping</h1>
			<p class="page-sub">Map SKU prefixes to publishers. Unmapped prefixes show as their code. <strong>{mappedCount}</strong> of {rows.length} mapped.</p>
		</div>
		<button class="btn-primary" onclick={resolveAll} disabled={resolving}>{resolving ? 'Applying…' : 'Apply to line items'}</button>
	</div>
	{#if resolvedMsg}<p class="resolved">{resolvedMsg}</p>{/if}

	<div class="toolbar">
		<input class="search" placeholder="Search prefix or publisher…" bind:value={search} />
	</div>

	<div class="card">
		<table>
			<thead>
				<tr><th>Prefix</th><th class="num">Lines</th><th class="num">Revenue (DKK)</th><th>Publisher</th></tr>
			</thead>
			<tbody>
				{#each filtered as row (row.prefix)}
					<tr>
						<td class="pfx">{row.prefix}</td>
						<td class="num">{numFmt.format(row.lines)}</td>
						<td class="num">{dkkFmt(row.dkk)}</td>
						<td class="pub">
							<input
								class="pub-input"
								placeholder={row.prefix}
								bind:value={row.publisher}
								onkeydown={(e) => e.key === 'Enter' && savePrefix(row)}
								onblur={() => savePrefix(row)}
							/>
							{#if row.saving}<span class="tag">…</span>{:else if row.saved}<span class="tag ok">✓</span>{/if}
						</td>
					</tr>
				{/each}
				{#if filtered.length === 0}<tr><td colspan="4" class="empty">No prefixes.</td></tr>{/if}
			</tbody>
		</table>
	</div>

	<h2 class="sec">Per-SKU overrides <span class="sec-hint">(e.g. SBDK titles that belong to a specific publisher)</span></h2>
	<div class="card">
		<div class="ov-add">
			<input class="ov-in" placeholder="SKU (e.g. SBDK9584)" bind:value={newSku} />
			<input class="ov-in" placeholder="Publisher" bind:value={newPub} onkeydown={(e) => e.key === 'Enter' && addOverride()} />
			<button class="btn-sm" onclick={addOverride} disabled={!newSku.trim() || !newPub.trim()}>Add</button>
		</div>
		{#if overrides.length}
			<table class="ov-table">
				<tbody>
					{#each overrides as o (o.sku)}
						<tr><td class="pfx">{o.sku}</td><td>{o.publisher}</td><td class="num"><button class="btn-del" onclick={() => removeOverride(o.sku)}>Remove</button></td></tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<p class="empty">No overrides yet.</p>
		{/if}
	</div>
</main>

<style>
	.page { max-width: 900px; margin: 0 auto; padding: 40px 28px 80px; }
	.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
	.page-title { font-size: 26px; font-weight: 800; color: #18181B; letter-spacing: -0.5px; margin: 0 0 4px; }
	.page-sub { font-size: 14px; color: #A89060; font-weight: 500; margin: 0; }
	.page-sub strong { color: #7B3803; }
	.resolved { font-size: 13px; font-weight: 700; color: #15803D; margin: 0 0 12px; }
	.toolbar { margin-bottom: 12px; }
	.search { width: 100%; max-width: 320px; padding: 9px 14px; border: 1px solid var(--border); border-radius: 9px; font-size: 14px; font-family: inherit; outline: none; background: #FFFBF0; }
	.search:focus { border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,0.12); background: #fff; }
	.card { background: #fff; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; margin-bottom: 28px; }
	table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
	thead th { text-align: left; background: #FBEFCB; color: #7B3803; font-weight: 800; padding: 11px 18px; border-bottom: 1px solid var(--border); }
	th.num, td.num { text-align: right; }
	tbody td { padding: 9px 18px; border-bottom: 1px solid #F5EDD8; color: #3f3a33; vertical-align: middle; }
	tbody tr:nth-child(even) td { background: #FFFBEF; }
	td.pfx { font-weight: 800; color: #18181B; font-variant-numeric: tabular-nums; }
	td.num { font-variant-numeric: tabular-nums; }
	td.pub { display: flex; align-items: center; gap: 8px; }
	.pub-input { flex: 1; padding: 6px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; font-family: inherit; outline: none; background: #fff; }
	.pub-input:focus { border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,0.12); }
	.tag { font-size: 12px; color: #A1A1AA; width: 14px; }
	.tag.ok { color: #16a34a; font-weight: 800; }
	.btn-primary { padding: 9px 18px; background: #F57832; color: #fff; border: none; border-radius: 9px; font-size: 14px; font-weight: 700; font-family: inherit; cursor: pointer; white-space: nowrap; }
	.btn-primary:hover:not(:disabled) { background: #E06820; }
	.btn-primary:disabled { opacity: 0.55; cursor: default; }
	.sec { font-size: 15px; font-weight: 800; color: #18181B; margin: 0 0 10px; }
	.sec-hint { font-size: 12px; font-weight: 500; color: #A1A1AA; }
	.ov-add { display: flex; gap: 8px; padding: 14px 18px; border-bottom: 1px solid #F5EDD8; flex-wrap: wrap; }
	.ov-in { padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; font-family: inherit; outline: none; }
	.ov-in:focus { border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,0.12); }
	.btn-sm { padding: 8px 16px; background: #F57832; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; font-family: inherit; cursor: pointer; }
	.btn-sm:disabled { opacity: 0.5; cursor: default; }
	.ov-table td { border-bottom: 1px solid #F5EDD8; }
	.btn-del { border: 1px solid #fecaca; color: #dc2626; background: none; border-radius: 7px; padding: 4px 10px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; }
	.btn-del:hover { background: #FEF2F2; }
	.empty { text-align: center; color: #A1A1AA; padding: 20px; }
</style>
