<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	let rows = $state(data.prefixes.map((p) => ({ ...p, saved: false, saving: false, _saved: p.publisher ?? '' })));
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
		if ((row.publisher ?? '').trim() === (row._saved ?? '').trim()) return; // no change → no save/flash
		row.saving = true; row.saved = false;
		try {
			const res = await fetch('/api/admin/publisher-map', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prefix: row.prefix, publisher: row.publisher }),
			});
			if (!res.ok) throw new Error('save failed');
			row._saved = row.publisher;
			row.saved = true;
			setTimeout(() => (row.saved = false), 800);
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

	// ── Publisher registry ────────────────────────────────────────────────────
	import { invalidateAll } from '$app/navigation';
	let newPublisher = $state('');
	async function addPublisher() {
		const name = newPublisher.trim();
		if (!name) return;
		const res = await fetch('/api/admin/publishers', {
			method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
		});
		if (res.ok) { newPublisher = ''; await invalidateAll(); }
		else alert('Could not add publisher');
	}
	async function deletePublisher(name) {
		if (!confirm(`Remove "${name}" from the publisher list? (existing SKU mappings stay)`)) return;
		const res = await fetch(`/api/admin/publishers/${encodeURIComponent(name)}`, { method: 'DELETE' });
		if (res.ok) await invalidateAll();
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
								class:unmapped={!row.publisher.trim()}
								class:saved={row.saved && !!row.publisher.trim()}
								bind:value={row.publisher}
								onkeydown={(e) => e.key === 'Enter' && savePrefix(row)}
								onblur={() => savePrefix(row)}
							/>
						</td>
					</tr>
				{/each}
				{#if filtered.length === 0}<tr><td colspan="4" class="empty">No prefixes.</td></tr>{/if}
			</tbody>
		</table>
	</div>

	<h2 class="sec">Publishers <span class="sec-hint">(the mapped / "secondary" publishers — open one to map SKUs to it)</span></h2>
	<div class="card">
		<div class="ov-add">
			<input class="ov-in" placeholder="New publisher (e.g. Magilano)" bind:value={newPublisher} onkeydown={(e) => e.key === 'Enter' && addPublisher()} />
			<button class="btn-sm" onclick={addPublisher} disabled={!newPublisher.trim()}>Add publisher</button>
		</div>
		{#if data.publishers.length}
			<table class="ov-table">
				<thead>
					<tr><th>Publisher</th><th class="num">Mapped SKUs</th><th class="num">Prefixes</th><th></th></tr>
				</thead>
				<tbody>
					{#each data.publishers as p (p.name)}
						<tr>
							<td class="pfx"><a class="pub-link" href="/admin/publishers/{encodeURIComponent(p.name)}">{p.name}</a></td>
							<td class="num">{p.mapped_count}</td>
							<td class="num">{p.prefix_count}</td>
							<td class="num">
								<a class="btn-sm map-btn" href="/admin/publishers/{encodeURIComponent(p.name)}">Map SKUs</a>
								<button class="btn-del" onclick={() => deletePublisher(p.name)}>Remove</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<p class="empty">No publishers yet.</p>
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
	td.pub { vertical-align: middle; }
	.pub-input {
		display: block; width: 100%; box-sizing: border-box; height: 34px;
		padding: 6px 10px; border: 1px solid var(--border); border-radius: 8px;
		font-size: 13px; line-height: 20px; font-family: inherit; outline: none; background: #fff;
		field-sizing: fixed;
		transition: background-color 0.6s ease, border-color 0.6s ease;
	}
	.pub-input:focus { border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,0.12); }
	/* Just saved → flash green, then fades back to white via the transition. */
	.pub-input.saved { background: #EAF7EF; border-color: #86efac; transition: none; }
	/* Empty (unmapped) → light red so gaps stand out. */
	.pub-input.unmapped { background: #FDECEC; border-color: #f6c9c4; }
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
	.pub-link { color: #7B3803; font-weight: 800; text-decoration: none; }
	.pub-link:hover { text-decoration: underline; }
	.map-btn { display: inline-block; text-decoration: none; margin-right: 8px; }
	.ov-table thead th { text-align: left; background: #FBEFCB; color: #7B3803; font-weight: 800; padding: 10px 18px; }
	.ov-table th.num { text-align: right; }
</style>
