<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	// ── Tracked sources (customers / groups with custom prices) ────────────────
	let newType = $state('customer');
	let newRef = $state('');
	let newName = $state('');
	let addingSource = $state(false);
	let sourceMsg = $state('');
	let busySource = $state(null); // id being re-synced/removed

	async function addSource() {
		const ref = newRef.trim();
		if (!ref || addingSource) return;
		addingSource = true; sourceMsg = '';
		try {
			const res = await fetch('/api/price-sync/sources', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type: newType, ref, name: newName.trim() }),
			});
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Could not add source');
			if (d.scan && d.scan.ok === false) sourceMsg = `Added, but scan failed: ${d.scan.error}`;
			newRef = ''; newName = '';
			await invalidateAll();
		} catch (e) { sourceMsg = e.message; } finally { addingSource = false; }
	}

	async function resyncSource(id) {
		busySource = id;
		try {
			const res = await fetch(`/api/price-sync/sources/${id}`, { method: 'POST' });
			if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? 'Scan failed');
			await invalidateAll();
		} catch (e) { alert(e.message); } finally { busySource = null; }
	}

	async function removeSource(id, name) {
		if (!confirm(`Remove "${name || id}" from sync? Cached prices will be deleted.`)) return;
		busySource = id;
		try {
			await fetch(`/api/price-sync/sources/${id}`, { method: 'DELETE' });
			await invalidateAll();
		} finally { busySource = null; }
	}

	let dealId = $state('');
	let apply = $state(false);
	let running = $state(false);
	let result = $state(null);
	let runError = $state('');

	async function run() {
		if (!dealId.trim() || running) return;
		if (apply && !confirm('Apply prices: this WRITES to the HubSpot deal. Continue?')) return;
		running = true; runError = ''; result = null;
		try {
			const res = await fetch('/api/price-sync/run', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ deal_id: dealId.trim(), apply }),
			});
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Run failed');
			result = d;
			await invalidateAll();
		} catch (e) { runError = e.message; } finally { running = false; }
	}

	const dtFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
	function ftime(ts) { return ts ? dtFmt.format(new Date(ts * 1000)) : '—'; }
	function parse(j) { try { return JSON.parse(j || '[]'); } catch { return []; } }
	function money(v, cur) { return v == null ? '—' : `${Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${cur ? ' ' + cur : ''}`; }
	const STATUS = {
		ok: { label: 'OK', tone: 'accent' },
		skipped_imported: { label: 'Skipped (imported)', tone: 'muted' },
		no_customer: { label: 'No customer / rackbeat_id', tone: 'warn' },
		error: { label: 'Error', tone: 'danger' },
	};
	const ACTION = {
		updated: { label: 'Updated', tone: 'ok' },
		update: { label: 'Will update', tone: 'change' },
		match: { label: 'Already correct', tone: 'muted' },
		no_custom: { label: 'No custom price', tone: 'muted' },
		no_price: { label: 'Not found for customer', tone: 'warn' },
	};
	let expanded = $state(null);
</script>

<svelte:head><title>Price Sync · Orders · Product Portal</title></svelte:head>

<AppNav active="price-sync" user={data.user} />

<main class="wrap">
	<div class="head"><h1>Price Sync</h1><p class="sub">Cache of customers' & groups' custom prices from Rackbeat — the foundation for the HubSpot price sync and catalogues.</p></div>

	<!-- Foundation: tracked sources -->
	<section class="card">
		<h2>Synced customers &amp; groups</h2>
		<p class="hint">Add a customer (Rackbeat customer id) or customer group (group number) that has custom prices. The system scans Rackbeat and caches the custom prices locally.</p>
		<div class="run-row">
			<select class="in" bind:value={newType}>
				<option value="customer">Customer</option>
				<option value="group">Customer group</option>
			</select>
			<input class="in" placeholder={newType === 'group' ? 'Group number (e.g. 231)' : 'Customer id (e.g. 928893361)'} bind:value={newRef} onkeydown={(e) => e.key === 'Enter' && addSource()} />
			<input class="in" placeholder="Name (optional — fetched otherwise)" bind:value={newName} />
			<button class="btn primary" onclick={addSource} disabled={addingSource || !newRef.trim()}>{addingSource ? 'Scanning…' : 'Add & scan'}</button>
		</div>
		{#if sourceMsg}<p class="err">{sourceMsg}</p>{/if}

		{#if data.sources.length}
			<div class="table-card" style="margin-top:14px">
				<table>
					<thead><tr><th>Name</th><th>Type</th><th>Ref</th><th>Currency</th><th class="num">Custom prices</th><th class="num">Scanned</th><th>Last synced</th><th>Status</th><th></th></tr></thead>
					<tbody>
						{#each data.sources as s (s.id)}
							<tr>
								<td>{s.name || '—'}</td>
								<td class="muted">{s.type === 'group' ? 'Group' : 'Customer'}</td>
								<td class="mono">{s.ref}</td>
								<td class="muted">{s.currency || '—'}</td>
								<td class="num"><b>{s.product_count ?? '—'}</b></td>
								<td class="num muted">{s.scanned_count ?? '—'}</td>
								<td class="nowrap muted">{s.last_synced_at ? s.last_synced_at.replace('T', ' ').slice(0, 16) : '—'}</td>
								<td><span class="pill sm {s.status === 'ok' ? 'ok' : s.status === 'error' ? 'danger' : 'muted'}">{s.status ?? '—'}</span>{#if s.error}<div class="err" style="margin:2px 0 0">{s.error}</div>{/if}</td>
								<td class="actions">
									<button class="link" disabled={busySource === s.id} onclick={() => resyncSource(s.id)}>{busySource === s.id ? '…' : 'Re-sync'}</button>
									<button class="link danger" disabled={busySource === s.id} onclick={() => removeSource(s.id, s.name)}>Remove</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<p class="hint" style="margin-top:8px">No sources added yet.</p>
		{/if}
	</section>

	<section class="card">
		<h2>Run on deal</h2>
		<p class="hint">Enter a HubSpot deal id. Without "Apply" it is a preview (no writes).</p>
		<div class="run-row">
			<input class="in" placeholder="HubSpot deal id" bind:value={dealId} onkeydown={(e) => e.key === 'Enter' && run()} />
			<label class="chk"><input type="checkbox" bind:checked={apply} /> Apply (write to HubSpot)</label>
			<button class="btn primary" onclick={run} disabled={running || !dealId.trim()}>{running ? 'Running…' : (apply ? 'Apply prices' : 'Preview')}</button>
		</div>
		{#if runError}<p class="err">{runError}</p>{/if}

		{#if result}
			<div class="result">
				<div class="res-head">
					<span class="pill {STATUS[result.status]?.tone ?? 'muted'}">{STATUS[result.status]?.label ?? result.status}</span>
					{#if result.applied}<span class="pill ok">Written to HubSpot</span>{:else if result.status === 'ok'}<span class="pill change">Preview</span>{/if}
					{#if result.changed_count != null}<span class="pill muted">{result.changed_count} {result.applied ? 'updated' : 'to update'}</span>{/if}
				</div>
				<div class="res-meta">
					<span><b>Deal:</b> {result.deal_name ?? '—'}</span>
					<span><b>Customer:</b> {result.company_name ?? '—'} ({result.customer_ref ?? '—'})</span>
					{#if result.currency}<span><b>Currency:</b> {result.currency}</span>{/if}
				</div>
				{#if result.error}<p class="err">{result.error}</p>{/if}
				{#if result.lines?.length}
					<table class="li">
						<thead><tr><th>SKU</th><th>Product</th><th class="num">Qty</th><th class="num">Current</th><th class="num">Customer price</th><th>Action</th></tr></thead>
						<tbody>
							{#each result.lines as l}
								<tr class:change={l.action === 'update'} class:done={l.action === 'updated'}>
									<td class="mono">{l.sku}</td><td>{l.name}</td>
									<td class="num">{l.quantity}</td>
									<td class="num">{money(l.current_price, result.currency)}</td>
									<td class="num">{l.is_custom ? money(l.customer_price, result.currency) : '—'}</td>
									<td><span class="pill sm {ACTION[l.action]?.tone ?? 'muted'}">{ACTION[l.action]?.label ?? l.action}</span></td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		{/if}
	</section>

	<section class="card">
		<h2>Log</h2>
		{#if !data.logs.length}
			<p class="hint">No runs yet.</p>
		{:else}
			<div class="table-card">
				<table>
					<thead><tr><th>Time</th><th>User</th><th>Deal</th><th>Customer</th><th>Status</th><th>Applied</th><th class="num">Updated</th><th></th></tr></thead>
					<tbody>
						{#each data.logs as l (l.id)}
							{@const lines = parse(l.lines)}
							<tr>
								<td class="nowrap">{ftime(l.created_at)}</td>
								<td class="muted">{l.user_email ?? '—'}</td>
								<td>{l.deal_name || l.deal_id || '—'}</td>
								<td>{l.company_name || l.customer_ref || '—'}</td>
								<td><span class="pill sm {STATUS[l.status]?.tone ?? 'muted'}">{STATUS[l.status]?.label ?? l.status}</span></td>
								<td>{l.applied ? '✓' : 'preview'}</td>
								<td class="num">{l.changed_count ?? 0}</td>
								<td class="actions">{#if lines.length}<button class="link" onclick={() => expanded = expanded === l.id ? null : l.id}>{expanded === l.id ? 'Hide' : 'Details'}</button>{/if}</td>
							</tr>
							{#if expanded === l.id}
								<tr class="detail-row"><td colspan="8">
									<table class="li">
										<thead><tr><th>SKU</th><th>Product</th><th class="num">Qty</th><th class="num">Current</th><th class="num">Customer price</th><th>Action</th></tr></thead>
										<tbody>
											{#each lines as l2}
												<tr class:change={l2.action === 'update'} class:done={l2.action === 'updated'}>
													<td class="mono">{l2.sku}</td><td>{l2.name}</td><td class="num">{l2.quantity}</td>
													<td class="num">{money(l2.current_price, l.currency)}</td>
													<td class="num">{l2.is_custom ? money(l2.customer_price, l.currency) : '—'}</td>
													<td><span class="pill sm {ACTION[l2.action]?.tone ?? 'muted'}">{ACTION[l2.action]?.label ?? l2.action}</span></td>
												</tr>
											{/each}
										</tbody>
									</table>
									{#if l.error}<p class="err">{l.error}</p>{/if}
								</td></tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</main>

<style>
	.wrap { max-width: 1040px; margin: 0 auto; padding: 22px 28px 64px; }
	.head { margin-bottom: 16px; }
	.head h1 { font-size: 20px; font-weight: 800; color: #18181B; margin: 0; }
	.sub { color: #98876e; font-size: 13px; margin: 4px 0 0; }
	.card { background: #fff; border: 1px solid var(--border); border-radius: 14px; padding: 18px 20px; margin-bottom: 16px; }
	.card h2 { font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; color: #A88B52; margin: 0 0 4px; }
	.hint { font-size: 12px; color: #98876e; margin: 0 0 12px; }
	.btn { font-family: inherit; font-size: 13px; font-weight: 700; padding: 9px 15px; border-radius: 9px; border: 1px solid var(--border); background: #fff; color: #524431; cursor: pointer; }
	.btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
	.btn:disabled { opacity: 0.6; cursor: default; }
	.in { font-family: inherit; font-size: 13px; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; color: #18181B; min-width: 200px; }
	.in:focus { outline: none; border-color: var(--accent); }
	.chk { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #524431; white-space: nowrap; }
	.chk input { width: 15px; height: 15px; accent-color: var(--accent); }
	.run-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
	.err { color: #C4381B; font-size: 13px; margin: 10px 0 0; }

	.result { margin-top: 16px; border-top: 1px solid #F1EADB; padding-top: 14px; }
	.res-head { display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
	.res-meta { display: flex; gap: 22px; font-size: 13px; color: #524431; flex-wrap: wrap; margin-bottom: 10px; }
	.pill { display: inline-block; font-size: 11px; font-weight: 800; padding: 3px 9px; border-radius: 100px; }
	.pill.sm { font-size: 10px; padding: 2px 7px; }
	.pill.accent { background: #FDEEE4; color: #B15A12; } .pill.muted { background: #F1EADB; color: #8A7550; }
	.pill.warn { background: #FBF0D6; color: #9A6B00; } .pill.danger { background: #FCE4DE; color: #C4381B; }
	.pill.ok { background: #E9F7EC; color: #1E7A34; } .pill.change { background: #FDECD8; color: #C05621; }

	.table-card { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
	table { width: 100%; border-collapse: collapse; font-size: 13px; }
	th { text-align: left; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; color: #A88B52; padding: 9px 12px; background: #FBF7EF; border-bottom: 1px solid var(--border); }
	th.num { text-align: right; }
	td { padding: 9px 12px; border-bottom: 1px solid #F1EADB; color: #18181B; }
	td.num { text-align: right; font-variant-numeric: tabular-nums; }
	td.muted { color: #98876e; } .nowrap { white-space: nowrap; } .mono { font-family: ui-monospace, monospace; font-size: 12px; }
	.actions { text-align: right; }
	.link { background: none; border: none; font-family: inherit; font-size: 12px; font-weight: 700; color: #B15A12; cursor: pointer; padding: 0 0 0 10px; }
	.link.danger { color: #C4381B; }
	.link:disabled { opacity: 0.5; cursor: default; }
	.detail-row td { background: #FBF7EF; padding: 8px 12px; }
	.li { margin: 0; } .li th { background: #fff; }
	tr.change td { background: #FDECD8; } tr.done td { background: #E9F7EC; }
</style>
