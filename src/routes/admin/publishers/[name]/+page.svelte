<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	const numFmt = new Intl.NumberFormat('da-DK');

	let query = $state('');
	/** @type {{sku:string,name:string,prefix:string,override_pub:string|null,dkk:number}[]} */
	let results = $state([]);
	let hi = $state(0);
	/** @type {HTMLInputElement | null} */
	let searchEl = $state(null);
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer;
	/** @type {any} */
	let confirmRow = $state(null);
	let busy = $state(false);

	function runSearch() {
		clearTimeout(timer);
		const q = query.trim();
		if (q.length < 2) { results = []; hi = 0; return; }
		timer = setTimeout(async () => {
			const res = await fetch(`/api/admin/publishers?q=${encodeURIComponent(q)}`);
			results = res.ok ? await res.json() : [];
			hi = 0;
		}, 160);
	}

	function onSearchKey(e) {
		if (confirmRow) return; // popup handles its own keys
		if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(hi + 1, results.length - 1); }
		else if (e.key === 'ArrowUp') { e.preventDefault(); hi = Math.max(hi - 1, 0); }
		else if (e.key === 'Enter') { e.preventDefault(); if (results[hi]) confirmRow = results[hi]; }
	}

	function cancelConfirm() { confirmRow = null; refocus(); }
	function refocus() { setTimeout(() => searchEl?.focus(), 0); }

	async function confirmMap() {
		if (!confirmRow || busy) return;
		busy = true;
		try {
			const res = await fetch('/api/admin/publishers/map', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sku: confirmRow.sku, publisher: data.name })
			});
			if (!res.ok) throw new Error('Failed');
			confirmRow = null;
			query = ''; results = []; hi = 0;
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
</script>

<svelte:head><title>Map SKUs — {data.name}</title></svelte:head>
<svelte:window onkeydown={(e) => {
	if (!confirmRow) return;
	if (e.key === 'Escape') cancelConfirm();
	else if (e.key === 'Enter') { e.preventDefault(); confirmMap(); }
}} />

<AppNav active="publishers" user={data.user} />

<main class="page">
	<a class="back" href="/admin/publishers">← Publishers</a>
	<h1 class="page-title">Map SKUs → <span class="pub">{data.name}</span></h1>
	<p class="page-sub">Search a SKU or product name, use ↑/↓ to pick, and press <kbd>Enter</kbd> to map it to <strong>{data.name}</strong>.</p>

	<div class="search-wrap">
		<input
			class="search"
			bind:this={searchEl}
			bind:value={query}
			oninput={runSearch}
			onkeydown={onSearchKey}
			placeholder="Search SKU or product name…"
			autofocus
		/>
		{#if results.length > 0}
			<div class="results">
				{#each results as r, i (r.sku)}
					<button class="res" class:hi={i === hi} onmouseenter={() => (hi = i)} onclick={() => (confirmRow = r)}>
						<span class="r-sku">{r.sku}</span>
						<span class="r-name">{r.name || '—'}</span>
						<span class="r-cur">→ {current(r)}</span>
					</button>
				{/each}
			</div>
		{:else if query.trim().length >= 2}
			<div class="results"><div class="res empty">No matching SKUs.</div></div>
		{/if}
	</div>

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

{#if confirmRow}
	<div class="modal-overlay" onclick={cancelConfirm} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
			<h3 class="modal-title">Map <span class="mono">{confirmRow.sku}</span> {confirmRow.name ? `“${confirmRow.name}”` : ''} to <span class="pub">{data.name}</span>?</h3>
			{#if confirmRow.override_pub && confirmRow.override_pub !== data.name}
				<div class="warn">⚠ <strong>{confirmRow.sku}</strong> is currently mapped to <strong>{confirmRow.override_pub}</strong> — mapping to <strong>{data.name}</strong> will replace it.</div>
			{/if}
			<div class="modal-foot">
				<button class="btn-ghost" onclick={cancelConfirm}>Cancel</button>
				<button class="btn-primary" onclick={confirmMap} disabled={busy}>{busy ? 'Mapping…' : 'Map it'}</button>
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

	.search-wrap { position: relative; margin-bottom: 28px; }
	.search { width: 100%; box-sizing: border-box; padding: 12px 16px; border: 1px solid var(--border); border-radius: 12px; font-size: 15px; font-family: inherit; outline: none; background: #FFFBF0; }
	.search:focus { border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,0.12); background: #fff; }
	.results { position: absolute; left: 0; right: 0; margin-top: 6px; background: #fff; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; box-shadow: 0 16px 40px rgba(0,0,0,0.1); z-index: 10; }
	.res { display: grid; grid-template-columns: 110px 1fr auto; gap: 12px; align-items: center; width: 100%; text-align: left; border: none; background: #fff; padding: 10px 14px; cursor: pointer; font-family: inherit; font-size: 13px; border-bottom: 1px solid #F5EDD8; }
	.res:last-child { border-bottom: none; }
	.res.hi { background: #FFF3E2; }
	.res .r-sku { font-weight: 800; color: #18181B; font-variant-numeric: tabular-nums; }
	.res .r-name { color: #3f3a33; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.res .r-cur { color: #A1A1AA; font-size: 12px; white-space: nowrap; }
	.res.empty { display: block; text-align: center; color: #A1A1AA; cursor: default; }

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
	.modal { background: #fff; border-radius: 16px; padding: 24px; max-width: 460px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
	.modal-title { font-size: 16px; font-weight: 700; margin: 0 0 12px; line-height: 1.4; }
	.mono { font-variant-numeric: tabular-nums; }
	.warn { background: #FEF3C7; border: 1px solid #FDE68A; color: #92400E; border-radius: 10px; padding: 10px 12px; font-size: 13px; line-height: 1.5; margin-bottom: 14px; }
	.modal-foot { display: flex; justify-content: flex-end; gap: 8px; }
	.btn-ghost { padding: 9px 16px; background: #fff; border: 1px solid var(--border); border-radius: 9px; font-size: 14px; font-weight: 600; font-family: inherit; cursor: pointer; }
	.btn-primary { padding: 9px 18px; background: #F57832; color: #fff; border: none; border-radius: 9px; font-size: 14px; font-weight: 700; font-family: inherit; cursor: pointer; }
	.btn-primary:disabled { opacity: 0.55; cursor: default; }
</style>
