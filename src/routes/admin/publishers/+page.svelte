<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	const numFmt = new Intl.NumberFormat('da-DK');
	const dkkFmt = (n) => numFmt.format(Math.round(n ?? 0)) + ' kr';

	let search = $state('');
	let resolving = $state(false);
	let resolvedMsg = $state('');

	const filtered = $derived(
		search.trim()
			? data.publishers.filter((p) =>
				p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
				p.prefixes.some((x) => x.prefix.toLowerCase().includes(search.trim().toLowerCase())))
			: data.publishers
	);

	// ── Add publisher ───────────────────────────────────────────────────────────
	let addOpen = $state(false);
	let newPublisher = $state('');
	async function addPublisher() {
		const name = newPublisher.trim();
		if (!name) return;
		const res = await fetch('/api/admin/publishers', {
			method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
		});
		if (res.ok) { newPublisher = ''; addOpen = false; await invalidateAll(); } else alert('Could not add publisher');
	}
	async function deletePublisher(name) {
		if (!confirm(`Remove "${name}" from the publisher list? (its prefix & SKU mappings stay)`)) return;
		const res = await fetch(`/api/admin/publishers/${encodeURIComponent(name)}`, { method: 'DELETE' });
		if (res.ok) await invalidateAll();
	}

	// ── Prefix mapping ────────────────────────────────────────────────────────────
	async function setPrefix(prefix, publisher) {
		const res = await fetch('/api/admin/publisher-map', {
			method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix, publisher }),
		});
		if (!res.ok) { alert(`Could not update prefix ${prefix}`); return false; }
		await invalidateAll();
		return true;
	}

	// Edit-prefixes modal (for one publisher)
	let editName = $state(null);
	let newPrefix = $state('');
	const editPub = $derived(editName ? data.publishers.find((p) => p.name === editName) : null);
	function openEdit(name) { editName = name; newPrefix = ''; }
	function closeEdit() { editName = null; }
	async function addPrefix() {
		const pfx = newPrefix.trim().toUpperCase();
		if (!pfx || !editName) return;
		if (await setPrefix(pfx, editName)) newPrefix = '';
	}

	// ── Unmapped prefixes modal ────────────────────────────────────────────────────
	let unmappedOpen = $state(false);
	/** @type {Record<string,string>} */
	let assignVals = $state({});
	async function assignUnmapped(prefix) {
		const name = (assignVals[prefix] ?? '').trim();
		if (!name) return;
		if (!data.allNames.includes(name)) {
			await fetch('/api/admin/publishers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
		}
		await setPrefix(prefix, name);
		assignVals = { ...assignVals, [prefix]: '' };
	}

	async function resolveAll() {
		if (!confirm('Re-apply all mappings to every line item? (~3s)')) return;
		resolving = true; resolvedMsg = '';
		try {
			const res = await fetch('/api/admin/publisher-map', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'resolve' }) });
			if (!res.ok) throw new Error('failed');
			resolvedMsg = 'Applied to all line items ✓';
		} catch { resolvedMsg = 'Failed — try again'; } finally { resolving = false; }
	}
</script>

<svelte:head><title>Publishers — Admin</title></svelte:head>
<svelte:window onkeydown={(e) => { if (e.key === 'Escape') { closeEdit(); addOpen = false; unmappedOpen = false; } }} />

<AppNav active="publishers" user={data.user} />

<main class="page">
	<div class="page-header">
		<div>
			<h1 class="page-title">Publishers</h1>
			<p class="page-sub">All publishers and the SKU prefixes mapped to them. <strong>{data.unmapped.length}</strong> prefix{data.unmapped.length === 1 ? '' : 'es'} still unmapped.</p>
		</div>
		<div class="head-btns">
			<button class="btn-ghost" onclick={resolveAll} disabled={resolving}>{resolving ? 'Applying…' : 'Apply to line items'}</button>
			<button class="btn-primary" onclick={() => (addOpen = true)}>+ Add publisher</button>
		</div>
	</div>
	{#if resolvedMsg}<p class="resolved">{resolvedMsg}</p>{/if}

	<div class="toolbar">
		<input class="search" placeholder="Search publisher or prefix…" bind:value={search} />
		<button class="btn-chip" class:warn={data.unmapped.length > 0} onclick={() => (unmappedOpen = true)}>
			Unmapped prefixes <span class="count">{data.unmapped.length}</span>
		</button>
	</div>

	<div class="card">
		<table>
			<thead>
				<tr><th>Publisher</th><th>Prefixes</th><th class="num">Mapped SKUs</th><th class="num">Revenue</th><th></th></tr>
			</thead>
			<tbody>
				{#each filtered as p (p.name)}
					<tr>
						<td class="pub"><a href="/admin/publishers/{encodeURIComponent(p.name)}">{p.name}</a></td>
						<td class="prefixes">
							{#if p.prefixes.length}
								{#each p.prefixes as x}<span class="pfx-chip">{x.prefix}</span>{/each}
							{:else}
								<span class="none">— no prefix</span>
							{/if}
						</td>
						<td class="num">{p.mapped_count || '—'}</td>
						<td class="num">{p.dkk ? dkkFmt(p.dkk) : '—'}</td>
						<td class="actions">
							<div class="row-actions">
								<button class="btn-sm" onclick={() => openEdit(p.name)}>Prefixes</button>
								<a class="btn-sm" href="/admin/publishers/{encodeURIComponent(p.name)}">Map SKUs</a>
								<button class="btn-del" onclick={() => deletePublisher(p.name)}>Remove</button>
							</div>
						</td>
					</tr>
				{/each}
				{#if filtered.length === 0}<tr><td colspan="5" class="empty">No publishers.</td></tr>{/if}
			</tbody>
		</table>
	</div>
</main>

<!-- Add publisher modal -->
{#if addOpen}
	<div class="overlay" onclick={() => (addOpen = false)} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
			<h3 class="modal-title">Add publisher</h3>
			<input class="in" placeholder="Publisher name (e.g. Magilano)" bind:value={newPublisher} onkeydown={(e) => e.key === 'Enter' && addPublisher()} />
			<div class="modal-foot"><button class="btn-ghost" onclick={() => (addOpen = false)}>Cancel</button><button class="btn-primary" onclick={addPublisher} disabled={!newPublisher.trim()}>Add</button></div>
		</div>
	</div>
{/if}

<!-- Edit prefixes modal -->
{#if editPub}
	<div class="overlay" onclick={closeEdit} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
			<h3 class="modal-title">Prefixes → <span class="pub-name">{editPub.name}</span></h3>
			<p class="modal-sub">SKU prefixes that count as this publisher under the SKU-publisher view.</p>
			<div class="chips">
				{#each editPub.prefixes as x (x.prefix)}
					<span class="pfx-chip big">{x.prefix}<button class="chip-x" onclick={() => setPrefix(x.prefix, '')} title="Unmap">✕</button></span>
				{:else}
					<span class="none">No prefixes yet.</span>
				{/each}
			</div>
			<div class="add-row">
				<input class="in" placeholder="Add prefix (e.g. IEL)" bind:value={newPrefix} onkeydown={(e) => e.key === 'Enter' && addPrefix()} />
				<button class="btn-primary" onclick={addPrefix} disabled={!newPrefix.trim()}>Add</button>
			</div>
			<p class="hint">Adding a prefix already used elsewhere moves it to {editPub.name}.</p>
			<div class="modal-foot"><button class="btn-ghost" onclick={closeEdit}>Done</button></div>
		</div>
	</div>
{/if}

<!-- Unmapped prefixes modal -->
{#if unmappedOpen}
	<div class="overlay" onclick={() => (unmappedOpen = false)} role="presentation">
		<div class="modal wide" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
			<h3 class="modal-title">Unmapped prefixes</h3>
			<p class="modal-sub">Prefixes seen in sales with no publisher. Assign each to a publisher (type a new name to create it).</p>
			{#if data.unmapped.length === 0}
				<p class="empty">All prefixes are mapped 🎉</p>
			{:else}
				<datalist id="pub-names">{#each data.allNames as n}<option value={n}></option>{/each}</datalist>
				<table class="um-table">
					<thead><tr><th>Prefix</th><th class="num">Lines</th><th class="num">Revenue</th><th>Publisher</th></tr></thead>
					<tbody>
						{#each data.unmapped as u (u.prefix)}
							<tr>
								<td class="pfx">{u.prefix}</td>
								<td class="num">{numFmt.format(u.lines)}</td>
								<td class="num">{dkkFmt(u.dkk)}</td>
								<td class="assign">
									<input class="in sm" list="pub-names" placeholder="Publisher…" bind:value={assignVals[u.prefix]} onkeydown={(e) => e.key === 'Enter' && assignUnmapped(u.prefix)} />
									<button class="btn-sm" onclick={() => assignUnmapped(u.prefix)} disabled={!(assignVals[u.prefix] ?? '').trim()}>Assign</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
			<div class="modal-foot"><button class="btn-ghost" onclick={() => (unmappedOpen = false)}>Done</button></div>
		</div>
	</div>
{/if}

<style>
	.page { max-width: 940px; margin: 0 auto; padding: 40px 28px 80px; }
	.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
	.page-title { font-size: 26px; font-weight: 800; color: #18181B; letter-spacing: -0.5px; margin: 0 0 4px; }
	.page-sub { font-size: 14px; color: #A89060; font-weight: 500; margin: 0; }
	.page-sub strong { color: #7B3803; }
	.head-btns { display: flex; gap: 8px; }
	.resolved { font-size: 13px; font-weight: 700; color: #15803D; margin: 0 0 12px; }

	.toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; }
	.search { flex: 1; max-width: 340px; padding: 9px 14px; border: 1px solid var(--border); border-radius: 9px; font-size: 14px; font-family: inherit; outline: none; background: #FFFBF0; }
	.search:focus { border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,0.12); background: #fff; }
	.btn-chip { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border: 1px solid var(--border); border-radius: 100px; background: #fff; font-size: 13px; font-weight: 700; font-family: inherit; cursor: pointer; }
	.btn-chip.warn { border-color: #FDE68A; background: #FEF9C3; color: #92400E; }
	.btn-chip .count { background: #F57832; color: #fff; border-radius: 100px; padding: 1px 8px; font-size: 12px; }
	.btn-chip.warn .count { background: #D97706; }

	.card { background: #fff; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
	table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
	thead th { text-align: left; background: #FBEFCB; color: #7B3803; font-weight: 800; padding: 11px 18px; border-bottom: 1px solid var(--border); }
	th.num, td.num { text-align: right; }
	tbody td { padding: 10px 18px; border-bottom: 1px solid #F5EDD8; color: #3f3a33; vertical-align: middle; }
	tbody tr:last-child td { border-bottom: none; }
	td.pub a { font-weight: 800; color: #7B3803; text-decoration: none; }
	td.pub a:hover { text-decoration: underline; }
	.prefixes { display: flex; flex-wrap: wrap; gap: 4px; }
	.pfx-chip { font-size: 11px; font-weight: 800; color: #18181B; background: #F4F4F5; border-radius: 6px; padding: 2px 7px; font-variant-numeric: tabular-nums; }
	.none { color: #C4B998; font-size: 12px; font-style: italic; }
	.actions { text-align: right; }
	.row-actions { display: flex; gap: 6px; justify-content: flex-end; }
	.empty { text-align: center; color: #A1A1AA; padding: 20px; }

	.btn-primary { padding: 9px 16px; background: #F57832; color: #fff; border: none; border-radius: 9px; font-size: 14px; font-weight: 700; font-family: inherit; cursor: pointer; white-space: nowrap; }
	.btn-primary:disabled { opacity: 0.55; cursor: default; }
	.btn-ghost { padding: 9px 16px; background: #fff; border: 1px solid var(--border); border-radius: 9px; font-size: 14px; font-weight: 600; font-family: inherit; cursor: pointer; white-space: nowrap; }
	.btn-sm { padding: 5px 11px; background: #fff; border: 1px solid var(--border); border-radius: 8px; font-size: 12px; font-weight: 700; font-family: inherit; cursor: pointer; text-decoration: none; color: #18181B; }
	.btn-sm:hover { background: #FAFAFA; }
	.btn-del { padding: 5px 11px; border: 1px solid #fecaca; color: #dc2626; background: none; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; }
	.btn-del:hover { background: #FEF2F2; }

	.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 50; }
	.modal { background: #fff; border-radius: 16px; padding: 24px; max-width: 460px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
	.modal.wide { max-width: 640px; max-height: 85vh; overflow-y: auto; }
	.modal-title { font-size: 18px; font-weight: 800; margin: 0 0 4px; }
	.pub-name, .pub { color: #7B3803; }
	.modal-sub { font-size: 13px; color: #A1A1AA; margin: 0 0 16px; }
	.in { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid var(--border); border-radius: 9px; font-size: 14px; font-family: inherit; outline: none; }
	.in:focus { border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,0.12); }
	.in.sm { padding: 6px 10px; font-size: 13px; }
	.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
	.pfx-chip.big { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; padding: 4px 8px; }
	.chip-x { border: none; background: none; color: #A1A1AA; cursor: pointer; font-size: 12px; padding: 0; }
	.chip-x:hover { color: #dc2626; }
	.add-row { display: flex; gap: 8px; }
	.hint { font-size: 12px; color: #A1A1AA; margin: 10px 0 0; }
	.modal-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
	.um-table { width: 100%; border-collapse: collapse; font-size: 13px; }
	.um-table th { text-align: left; color: #A1A1AA; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; padding: 6px 8px; border-bottom: 1px solid var(--border); }
	.um-table td { padding: 7px 8px; border-bottom: 1px solid #F5EDD8; }
	.um-table td.pfx { font-weight: 800; }
	.assign { display: flex; gap: 6px; }
	.assign .in { max-width: 180px; }
</style>
