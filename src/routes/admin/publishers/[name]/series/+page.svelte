<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	let newName = $state('');
	let creating = $state(false);
	let target = $state(null); // the series we're mapping products INTO
	let query = $state('');
	/** @type {any[]} */
	let results = $state([]);
	let busy = $state(false);
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer;
	/** @type {Record<string,string>} */
	let renaming = $state({});

	const targetSeries = $derived(data.series.find((s) => s.id === target) ?? null);

	async function api(body) {
		const res = await fetch('/api/admin/series', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message ?? 'Failed');
		return res.json();
	}

	async function createSeries() {
		const n = newName.trim();
		if (!n || creating) return;
		creating = true;
		try { const { id } = await api({ op: 'create', publisher: data.name, name: n }); newName = ''; await invalidateAll(); target = id; }
		catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { creating = false; }
	}
	async function saveRename(id) {
		const n = (renaming[id] ?? '').trim();
		if (!n) return;
		try { await api({ op: 'rename', id, name: n }); const r = { ...renaming }; delete r[id]; renaming = r; await invalidateAll(); }
		catch (e) { alert(e instanceof Error ? e.message : String(e)); }
	}
	async function removeSeries(id, name) {
		if (!confirm(`Delete series "${name}"?\n\nProducts mapped to it fall back to "Everything else".`)) return;
		try { await api({ op: 'delete', id }); if (target === id) target = null; await invalidateAll(); }
		catch (e) { alert(e instanceof Error ? e.message : String(e)); }
	}

	function runSearch() {
		clearTimeout(timer);
		const q = query.trim();
		if (q.length < 2) { results = []; return; }
		timer = setTimeout(async () => {
			const res = await fetch(`/api/admin/series?publisher=${encodeURIComponent(data.name)}&q=${encodeURIComponent(q)}`);
			const b = res.ok ? await res.json() : { results: [] };
			results = b.results ?? [];
		}, 160);
	}
	function patchRow(sku, patch) { results = results.map((r) => (r.sku === sku ? { ...r, ...patch } : r)); }
	async function assign(row) {
		if (!target || busy) return;
		busy = true;
		try { await api({ op: 'map', sku: row.sku, series_id: target }); patchRow(row.sku, { series_id: target, series_name: targetSeries?.name }); await invalidateAll(); }
		catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { busy = false; }
	}
	async function unassign(row) {
		busy = true;
		try { await api({ op: 'unmap', sku: row.sku }); patchRow(row.sku, { series_id: null, series_name: null }); await invalidateAll(); }
		catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { busy = false; }
	}
</script>

<svelte:head><title>Series — {data.name}</title></svelte:head>

<AppNav active="publishers" user={data.user} />

<main class="page">
	<a class="back" href="/admin/publishers/{encodeURIComponent(data.name)}">← Map SKUs</a>
	<h1 class="page-title">Series under <span class="pub">{data.name}</span></h1>
	<p class="page-sub">Create sub-series (e.g. EXIT, Catan) and map this publisher's products into them. Only products mapped to <strong>{data.name}</strong> can be added.</p>

	<!-- Series list + create -->
	<h2 class="sec">Series <span class="sec-hint">({data.series.length})</span></h2>
	<div class="create-row">
		<input class="mini" bind:value={newName} placeholder="New series name…" onkeydown={(e) => e.key === 'Enter' && createSeries()} />
		<button class="btn-primary" onclick={createSeries} disabled={!newName.trim() || creating}>{creating ? 'Adding…' : '+ Add series'}</button>
	</div>
	{#if data.series.length}
		<div class="card series-list">
			{#each data.series as s (s.id)}
				<div class="series-row" class:sel={target === s.id}>
					<button class="pick" onclick={() => (target = target === s.id ? null : s.id)} title="Select to map products into this series">
						<span class="dot" class:on={target === s.id}></span>
					</button>
					{#if renaming[s.id] != null}
						<input class="mini grow" bind:value={renaming[s.id]} onkeydown={(e) => e.key === 'Enter' && saveRename(s.id)} />
						<button class="btn-ghost sm" onclick={() => saveRename(s.id)}>Save</button>
						<button class="btn-ghost sm" onclick={() => { const r = { ...renaming }; delete r[s.id]; renaming = r; }}>✕</button>
					{:else}
						<span class="s-name">{s.name}</span>
						<span class="s-count">{s.mapped_count} product{s.mapped_count === 1 ? '' : 's'}</span>
						<button class="btn-ghost sm" onclick={() => (renaming = { ...renaming, [s.id]: s.name })}>Rename</button>
						<button class="btn-del sm" onclick={() => removeSeries(s.id, s.name)}>Delete</button>
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<p class="empty">No series yet — add one above.</p>
	{/if}

	<!-- Mapping -->
	<h2 class="sec map-head">Map products {#if targetSeries}→ <span class="pub">{targetSeries.name}</span>{/if}</h2>
	{#if !target}
		<p class="hint">Select a series above, then search a product to add it.</p>
	{:else}
		<input class="search" bind:value={query} oninput={runSearch} placeholder="Search SKU or product name within {data.name}…" />
		{#if results.length}
			<div class="card">
				<table>
					<tbody>
						{#each results as r (r.sku)}
							<tr>
								<td class="pfx">{r.sku}</td>
								<td class="nm">{r.name || '—'}</td>
								<td class="cur">{#if r.series_id}<span class="pill {r.series_id === target ? 'here' : 'other'}">{r.series_name ?? 'in a series'}</span>{/if}</td>
								<td class="num">
									{#if r.series_id === target}
										<button class="btn-del sm" onclick={() => unassign(r)} disabled={busy}>Remove</button>
									{:else}
										<button class="btn-primary sm" onclick={() => assign(r)} disabled={busy}>{r.series_id ? 'Move here' : 'Add'}</button>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else if query.trim().length >= 2}
			<p class="empty">No matching products in {data.name}.</p>
		{/if}
	{/if}
</main>

<style>
	.page { max-width: 760px; margin: 0 auto; padding: 32px 28px 80px; }
	.back { font-size: 13px; font-weight: 600; color: #71717A; text-decoration: none; }
	.back:hover { color: #18181B; }
	.page-title { font-size: 24px; font-weight: 800; color: #18181B; letter-spacing: -0.5px; margin: 10px 0 4px; }
	.pub { color: #7B3803; }
	.page-sub { font-size: 14px; color: #A89060; font-weight: 500; margin: 0 0 20px; }
	.sec { font-size: 15px; font-weight: 800; color: #18181B; margin: 24px 0 10px; }
	.sec.map-head { margin-top: 30px; }
	.sec-hint { font-size: 12px; font-weight: 500; color: #A1A1AA; }
	.hint { font-size: 13px; color: #A89060; margin: 0 0 12px; }
	.empty { text-align: center; color: #A1A1AA; padding: 18px; }

	.create-row { display: flex; gap: 8px; margin-bottom: 14px; }
	.mini { padding: 9px 12px; border: 1px solid var(--border); border-radius: 9px; font-size: 14px; font-family: inherit; outline: none; background: #FFFBF0; }
	.mini:focus { border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,0.12); background: #fff; }
	.mini.grow { flex: 1; }

	.card { background: #fff; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
	.series-list { display: flex; flex-direction: column; }
	.series-row { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid #F5EDD8; }
	.series-row:last-child { border-bottom: none; }
	.series-row.sel { background: #FFF3E2; }
	.pick { background: none; border: none; cursor: pointer; padding: 0; display: inline-flex; }
	.dot { width: 16px; height: 16px; border-radius: 50%; border: 2px solid #D4D4D8; display: inline-block; }
	.dot.on { border-color: #F57832; background: #F57832; box-shadow: inset 0 0 0 2px #fff; }
	.s-name { font-weight: 700; color: #18181B; }
	.s-count { font-size: 12px; color: #A1A1AA; margin-right: auto; }

	.search { width: 100%; box-sizing: border-box; padding: 12px 16px; border: 1px solid var(--border); border-radius: 12px; font-size: 15px; font-family: inherit; outline: none; background: #FFFBF0; margin-bottom: 12px; }
	.search:focus { border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,0.12); background: #fff; }
	table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
	tbody td { padding: 9px 14px; border-bottom: 1px solid #F5EDD8; color: #3f3a33; }
	tbody tr:last-child td { border-bottom: none; }
	td.pfx { font-weight: 800; color: #18181B; white-space: nowrap; }
	td.nm { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	td.num { text-align: right; white-space: nowrap; }
	.pill { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 100px; white-space: nowrap; }
	.pill.here { background: #E9F7EC; color: #16a34a; }
	.pill.other { background: #FEF3C7; color: #92400E; }

	.btn-primary { padding: 9px 16px; background: #F57832; color: #fff; border: none; border-radius: 9px; font-size: 14px; font-weight: 700; font-family: inherit; cursor: pointer; }
	.btn-primary:disabled { opacity: 0.55; cursor: default; }
	.btn-ghost { padding: 8px 14px; background: #fff; border: 1px solid var(--border); border-radius: 9px; font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer; color: #52525B; }
	.btn-del { border: 1px solid #fecaca; color: #dc2626; background: none; border-radius: 7px; padding: 6px 12px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
	.btn-del:hover { background: #FEF2F2; }
	.sm { padding: 5px 11px; font-size: 12px; border-radius: 7px; }
</style>
