<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	let query = $state('');
	/** @type {{sku:string,name:string,prefix:string,override_pub:string|null,dkk:number,from_catalog:number}[]} */
	let results = $state([]);
	let hi = $state(0);
	let navigated = $state(false); // true once the user has arrowed into the list (then Space toggles)
	/** @type {HTMLInputElement | null} */
	let searchEl = $state(null);
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer;
	/** Selected rows to map, keyed by SKU (persists across searches). @type {Record<string, any>} */
	let picks = $state({});
	/** @type {any[] | null} rows being confirmed */
	let confirmList = $state(null);
	let busy = $state(false);

	const pickCount = $derived(Object.keys(picks).length);

	function runSearch() {
		clearTimeout(timer);
		navigated = false;
		const q = query.trim();
		if (q.length < 2) { results = []; hi = 0; return; }
		timer = setTimeout(async () => {
			const res = await fetch(`/api/admin/publishers?q=${encodeURIComponent(q)}`);
			results = res.ok ? await res.json() : [];
			hi = 0;
		}, 160);
	}

	function togglePick(row) {
		const next = { ...picks };
		if (next[row.sku]) delete next[row.sku]; else next[row.sku] = row;
		picks = next;
	}

	function onSearchKey(e) {
		if (confirmList) return; // popup handles its own keys
		if (e.key === 'ArrowDown') { e.preventDefault(); navigated = true; hi = Math.min(hi + 1, results.length - 1); }
		else if (e.key === 'ArrowUp') { e.preventDefault(); navigated = true; hi = Math.max(hi - 1, 0); }
		else if (e.key === ' ' && navigated && results[hi]) { e.preventDefault(); togglePick(results[hi]); }
		else if (e.key === 'Enter') {
			e.preventDefault();
			if (pickCount > 0) { confirmList = Object.values(picks); e.stopPropagation(); }
			else if (results[hi]) { confirmList = [results[hi]]; e.stopPropagation(); }
		}
	}

	function refocus() { setTimeout(() => searchEl?.focus(), 0); }
	function cancelConfirm() { confirmList = null; refocus(); }

	async function confirmMap() {
		if (!confirmList || busy) return;
		busy = true;
		try {
			for (const row of confirmList) {
				const res = await fetch('/api/admin/publishers/map', {
					method: 'POST', headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ sku: row.sku, publisher: data.name })
				});
				if (!res.ok) throw new Error(`Failed on ${row.sku}`);
			}
			confirmList = null; picks = {}; query = ''; results = []; hi = 0; navigated = false;
			await invalidateAll();
			refocus();
		} catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { busy = false; }
	}

	async function unmap(sku) {
		await fetch('/api/admin/publishers/map', {
			method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku, remove: true })
		});
		await invalidateAll();
	}

	function current(r) { return r.override_pub || r.prefix || '—'; }
	const swaps = $derived(/** @type {any[]} */ (confirmList ?? []).filter((/** @type {any} */ r) => r.override_pub && r.override_pub !== data.name));
</script>

<svelte:head><title>Map SKUs — {data.name}</title></svelte:head>
<svelte:window onkeydown={(e) => {
	if (!confirmList) return;
	if (e.key === 'Escape') cancelConfirm();
	else if (e.key === 'Enter') { e.preventDefault(); confirmMap(); }
}} />

<AppNav active="publishers" user={data.user} />

<main class="page">
	<a class="back" href="/admin/publishers">← Publishers</a>
	<h1 class="page-title">Map SKUs → <span class="pub">{data.name}</span></h1>
	<p class="page-sub">Search a SKU or product name. <kbd>↑</kbd>/<kbd>↓</kbd> to move, <kbd>Space</kbd> to tick several, <kbd>Enter</kbd> to map {pickCount > 0 ? `the ${pickCount} ticked` : 'the highlighted one'} to <strong>{data.name}</strong>. Unmapped SKUs show first.</p>

	<div class="search-wrap">
		<input class="search" bind:this={searchEl} bind:value={query} oninput={runSearch} onkeydown={onSearchKey}
			placeholder="Search SKU or product name…" autofocus />
		{#if results.length > 0}
			<div class="results">
				{#each results as r, i (r.sku)}
					<button class="res" class:hi={i === hi} class:picked={!!picks[r.sku]} onmouseenter={() => (hi = i)} onclick={() => togglePick(r)}>
						<span class="check" class:on={!!picks[r.sku]}>{picks[r.sku] ? '✓' : ''}</span>
						<span class="r-sku">{r.sku}</span>
						<span class="r-name">{r.name || '—'}{#if !r.from_catalog}<span class="raw" title="No product sheet for this SKU — raw line text">raw</span>{/if}</span>
						<span class="r-cur">→ {current(r)}</span>
					</button>
				{/each}
			</div>
		{:else if query.trim().length >= 2}
			<div class="results"><div class="res empty">No matching SKUs.</div></div>
		{/if}
	</div>

	{#if pickCount > 0}
		<div class="selbar">
			<span><strong>{pickCount}</strong> ticked</span>
			<div class="selbar-actions">
				<button class="btn-ghost" onclick={() => (picks = {})}>Clear</button>
				<button class="btn-primary" onclick={() => (confirmList = Object.values(picks))}>Map {pickCount} → {data.name}</button>
			</div>
		</div>
	{/if}

	<h2 class="sec">Currently mapped to {data.name} <span class="sec-hint">({data.mappings.length})</span></h2>
	<div class="card">
		{#if data.mappings.length}
			<table>
				<tbody>
					{#each data.mappings as m (m.sku)}
						<tr><td class="pfx">{m.sku}</td><td>{m.name || '—'}</td><td class="num"><button class="btn-del" onclick={() => unmap(m.sku)}>Unmap</button></td></tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<p class="empty">No SKUs mapped to {data.name} yet.</p>
		{/if}
	</div>
</main>

{#if confirmList}
	<div class="modal-overlay" onclick={cancelConfirm} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
			<h3 class="modal-title">Map {confirmList.length} SKU{confirmList.length === 1 ? '' : 's'} to <span class="pub">{data.name}</span>?</h3>
			<div class="conf-list">
				{#each confirmList as r}
					<div class="conf-row"><span class="mono">{r.sku}</span> <span class="conf-name">{r.name}</span></div>
				{/each}
			</div>
			{#if swaps.length}
				<div class="warn">⚠ {swaps.length} {swaps.length === 1 ? 'is' : 'are'} already mapped elsewhere and will be moved:
					<ul>{#each swaps as s}<li>{s.sku} — from <strong>{s.override_pub}</strong></li>{/each}</ul>
				</div>
			{/if}
			<div class="modal-foot">
				<button class="btn-ghost" onclick={cancelConfirm}>Cancel</button>
				<button class="btn-primary" onclick={confirmMap} disabled={busy}>{busy ? 'Mapping…' : `Map ${confirmList.length}`}</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.page { max-width: 760px; margin: 0 auto; padding: 32px 28px 80px; }
	.back { font-size: 13px; font-weight: 600; color: #71717A; text-decoration: none; }
	.back:hover { color: #18181B; }
	.page-title { font-size: 24px; font-weight: 800; color: #18181B; letter-spacing: -0.5px; margin: 10px 0 4px; }
	.pub { color: #7B3803; }
	.page-sub { font-size: 14px; color: #A89060; font-weight: 500; margin: 0 0 20px; }
	kbd { background: #F4F4F5; border: 1px solid var(--border); border-radius: 5px; padding: 1px 6px; font-size: 12px; font-family: inherit; }

	.search-wrap { position: relative; margin-bottom: 14px; }
	.search { width: 100%; box-sizing: border-box; padding: 12px 16px; border: 1px solid var(--border); border-radius: 12px; font-size: 15px; font-family: inherit; outline: none; background: #FFFBF0; }
	.search:focus { border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,0.12); background: #fff; }
	.results { position: absolute; left: 0; right: 0; margin-top: 6px; background: #fff; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; box-shadow: 0 16px 40px rgba(0,0,0,0.1); z-index: 10; max-height: 70vh; overflow-y: auto; }
	.res { display: grid; grid-template-columns: 22px 110px 1fr auto; gap: 12px; align-items: center; width: 100%; text-align: left; border: none; background: #fff; padding: 10px 14px; cursor: pointer; font-family: inherit; font-size: 13px; border-bottom: 1px solid #F5EDD8; }
	.res:last-child { border-bottom: none; }
	.res.hi { background: #FFF3E2; }
	.res.picked { background: #EAF7EF; }
	.res.hi.picked { background: #DCF2E4; }
	.check { width: 18px; height: 18px; border: 1px solid #D4D4D8; border-radius: 5px; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; color: #16a34a; }
	.check.on { background: #E9F7EC; border-color: #86efac; }
	.res .r-sku { font-weight: 800; color: #18181B; font-variant-numeric: tabular-nums; }
	.res .r-name { color: #3f3a33; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.res .r-cur { color: #A1A1AA; font-size: 12px; white-space: nowrap; }
	.res.empty { display: block; text-align: center; color: #A1A1AA; cursor: default; }
	.raw { display: inline-block; margin-left: 8px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; color: #A16207; background: #FEF9C3; border-radius: 5px; padding: 1px 5px; vertical-align: middle; }

	.selbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #EAF7EF; border: 1px solid #bbf7d0; border-radius: 12px; padding: 10px 16px; font-size: 14px; color: #166534; margin-bottom: 20px; }
	.selbar-actions { display: flex; gap: 8px; }

	.sec { font-size: 15px; font-weight: 800; color: #18181B; margin: 0 0 10px; }
	.sec-hint { font-size: 12px; font-weight: 500; color: #A1A1AA; }
	.card { background: #fff; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
	table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
	tbody td { padding: 9px 18px; border-bottom: 1px solid #F5EDD8; color: #3f3a33; }
	tbody tr:last-child td { border-bottom: none; }
	td.pfx { font-weight: 800; color: #18181B; }
	td.num { text-align: right; }
	.btn-del { border: 1px solid #fecaca; color: #dc2626; background: none; border-radius: 7px; padding: 4px 10px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; }
	.btn-del:hover { background: #FEF2F2; }
	.empty { text-align: center; color: #A1A1AA; padding: 20px; }

	.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 50; }
	.modal { background: #fff; border-radius: 16px; padding: 24px; max-width: 480px; width: 100%; max-height: 80vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
	.modal-title { font-size: 16px; font-weight: 700; margin: 0 0 12px; line-height: 1.4; }
	.mono { font-variant-numeric: tabular-nums; font-weight: 700; }
	.conf-list { max-height: 220px; overflow-y: auto; border: 1px solid var(--border); border-radius: 10px; }
	.conf-row { display: flex; gap: 10px; padding: 6px 12px; font-size: 13px; border-bottom: 1px solid #F5EDD8; }
	.conf-row:last-child { border-bottom: none; }
	.conf-name { color: #52525B; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.warn { background: #FEF3C7; border: 1px solid #FDE68A; color: #92400E; border-radius: 10px; padding: 10px 12px; font-size: 13px; line-height: 1.5; margin-top: 14px; }
	.warn ul { margin: 6px 0 0; padding-left: 18px; }
	.modal-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
	.btn-ghost { padding: 9px 16px; background: #fff; border: 1px solid var(--border); border-radius: 9px; font-size: 14px; font-weight: 600; font-family: inherit; cursor: pointer; }
	.btn-primary { padding: 9px 18px; background: #F57832; color: #fff; border: none; border-radius: 9px; font-size: 14px; font-weight: 700; font-family: inherit; cursor: pointer; }
	.btn-primary:disabled { opacity: 0.55; cursor: default; }
</style>
