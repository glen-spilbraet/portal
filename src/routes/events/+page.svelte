<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { goto } from '$app/navigation';

	let { data } = $props();
	let busy = $state(false);

	async function newEvent() {
		if (busy) return;
		busy = true;
		try {
			const res = await fetch('/api/events', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: 'Untitled event', status: 'planned' })
			});
			const body = await res.json();
			if (!res.ok) throw new Error(body.message ?? 'Failed');
			await goto(`/events/${body.id}`);
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
		} finally {
			busy = false;
		}
	}

	function fmtDate(d) {
		if (!d) return '—';
		try { return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
		catch { return d; }
	}
	function fmtWhen(e) {
		if (!e.event_date) return '—';
		if (e.end_date && e.end_date !== e.event_date) return `${fmtDate(e.event_date)} – ${fmtDate(e.end_date)}`;
		return fmtDate(e.event_date);
	}

	// ── Filters ────────────────────────────────────────────────────────────────
	let fStatus = $state('notdone');   // notdone (default) · done · all
	let fType = $state('');            // type_id or ''
	let fAssets = $state('all');       // all · missing · has
	let fText = $state('');
	const isDefault = $derived(fStatus === 'notdone' && !fType && fAssets === 'all' && !fText.trim());

	const typeOpts = $derived.by(() => {
		const seen = new Map();
		for (const e of data.events) if (e.type_id && e.type_name && !seen.has(e.type_id)) seen.set(e.type_id, e.type_name);
		return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
	});

	const filtered = $derived.by(() => {
		const q = fText.trim().toLowerCase();
		return data.events.filter((e) => {
			if (fStatus === 'notdone' && e.status === 'done') return false;
			if (fStatus === 'done' && e.status !== 'done') return false;
			if (fType && e.type_id !== fType) return false;
			if (fAssets === 'missing' && (e.asset_count ?? 0) > 0) return false;
			if (fAssets === 'has' && (e.asset_count ?? 0) === 0) return false;
			if (q && !`${e.title ?? ''} ${e.venue_name ?? ''}`.toLowerCase().includes(q)) return false;
			return true;
		});
	});
	function clearFilters() { fStatus = 'notdone'; fType = ''; fAssets = 'all'; fText = ''; }
</script>

<svelte:head><title>Events — Product Portal</title></svelte:head>

<div class="page">
	<AppNav active="events" user={data.user} />

	<main>
		<div class="page-header">
			<div>
				<h1 class="page-title">Events</h1>
				<p class="page-sub">Track events, venues and participants — and share product info & material with venues.</p>
			</div>
			<button class="btn primary" onclick={newEvent} disabled={busy}>+ New event</button>
		</div>

		{#if data.events.length === 0}
			<p class="empty">No events yet. Click “New event” to create one.</p>
		{:else}
			<div class="filters">
				<div class="seg-ctrl" role="group" aria-label="Status filter">
					<button class:active={fStatus === 'notdone'} onclick={() => (fStatus = 'notdone')}>Not done</button>
					<button class:active={fStatus === 'done'} onclick={() => (fStatus = 'done')}>Done</button>
					<button class:active={fStatus === 'all'} onclick={() => (fStatus = 'all')}>All</button>
				</div>
				<select class="f-sel" bind:value={fType} aria-label="Filter by type">
					<option value="">All types</option>
					{#each typeOpts as t}<option value={t.id}>{t.name}</option>{/each}
				</select>
				<select class="f-sel" bind:value={fAssets} aria-label="Filter by assets">
					<option value="all">Any assets</option>
					<option value="missing">Missing assets</option>
					<option value="has">Has assets</option>
				</select>
				<input class="f-search" type="search" bind:value={fText} placeholder="Search event or venue…" />
				{#if !isDefault}
					<span class="f-count">{filtered.length}</span>
					<button class="clear-btn" onclick={clearFilters}>Clear</button>
				{/if}
			</div>

			{#if filtered.length === 0}
				<p class="empty">No events match the filters. <button class="link-btn" onclick={clearFilters}>Clear filters</button></p>
			{:else}
			<table class="tbl">
				<colgroup>
					<col class="c-date" />
					<col class="c-event" />
					<col class="c-venue" />
					<col class="c-type" />
					<col class="c-status" />
					<col class="c-part" />
					<col class="c-skus" />
					<col class="c-assets" />
				</colgroup>
				<thead>
					<tr><th>Date</th><th>Event</th><th>Venue</th><th>Type</th><th>Status</th><th class="num">Participants</th><th class="num">SKUs</th><th class="num">Assets</th></tr>
				</thead>
				<tbody>
					{#each filtered as e (e.id)}
						<tr class="clickable" onclick={() => goto(`/events/${e.id}`)}>
							<td class="date-cell">{fmtWhen(e)}</td>
							<td class="strong">{e.title || 'Untitled event'}</td>
							<td>{e.venue_name ?? '—'}</td>
							<td>{e.type_name ?? '—'}</td>
							<td><span class="status {e.status}">{e.status}</span></td>
							<td class="num">{e.participants_actual ?? e.participants_expected ?? '—'}</td>
							<td class="num">{e.sku_count}</td>
							<td class="num">{e.asset_count}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{/if}
		{/if}
	</main>
</div>

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; }
	main { flex: 1; max-width: 1000px; margin: 0 auto; width: 100%; padding: 32px 28px 80px; }
	.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
	.page-title { font-size: 18px; font-weight: 700; color: #18181B; margin: 0 0 2px; }
	.page-sub { font-size: 13px; color: #A1A1AA; margin: 0; max-width: 560px; }

	.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid var(--border); border-radius: 10px; background: white; font-size: 13px; font-weight: 600; font-family: inherit; color: #18181B; cursor: pointer; }
	.btn:hover:not(:disabled) { background: #FAFAFA; }
	.btn:disabled { opacity: 0.5; cursor: default; }
	.btn.primary { background: #F57832; color: white; border-color: #F57832; }
	.btn.primary:hover:not(:disabled) { background: #e26a26; }

	.tbl { width: 100%; table-layout: fixed; border-collapse: collapse; background: white; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; font-size: 13px; }
	/* Fixed column widths so they never shift between filtered views; the Event
	   column takes the remaining space and wraps to multiple lines. */
	.c-date { width: 116px; }
	.date-cell { white-space: normal; word-break: normal; color: #52525B; }
	.c-event { width: auto; }
	.c-venue { width: 140px; }
	.c-type { width: 118px; }
	.c-status { width: 108px; }
	.c-part { width: 104px; }
	.c-skus { width: 66px; }
	.c-assets { width: 78px; }
	.tbl td, .tbl th { overflow: hidden; text-overflow: ellipsis; }
	.tbl td.strong { white-space: normal; word-break: break-word; }
	.tbl th { text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #A1A1AA; padding: 10px 14px; border-bottom: 1px solid var(--border); background: #FAFAFA; }
	.tbl td { padding: 12px 14px; border-bottom: 1px solid var(--border); color: #18181B; }
	.tbl tbody tr:last-child td { border-bottom: none; }
	.tbl tr.clickable { cursor: pointer; }
	.tbl tr.clickable:hover td { background: #FAFAFA; }
	.num { text-align: right; }
	.strong { font-weight: 600; }
	.empty { color: #A1A1AA; font-size: 13px; padding: 20px 0; }
	.nowrap { white-space: nowrap; }
	.link-btn { background: none; border: none; color: #F57832; font: inherit; font-weight: 600; cursor: pointer; padding: 0; text-decoration: underline; }

	.filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
	.seg-ctrl { display: inline-flex; border: 1px solid var(--border); border-radius: 9px; overflow: hidden; background: white; }
	.seg-ctrl button { font-family: inherit; font-size: 12.5px; font-weight: 600; color: #52525B; background: white; border: none; padding: 7px 12px; cursor: pointer; }
	.seg-ctrl button + button { border-left: 1px solid var(--border); }
	.seg-ctrl button:hover { background: #FAFAFA; }
	.seg-ctrl button.active { background: #F57832; color: white; }
	.f-sel, .f-search { font-family: inherit; font-size: 13px; color: #18181B; border: 1px solid var(--border); border-radius: 9px; padding: 7px 10px; background: white; }
	.f-sel:focus, .f-search:focus { outline: none; border-color: #F57832; }
	.f-search { flex: 1; min-width: 160px; }
	.f-count { font-size: 12px; font-weight: 700; color: #A1A1AA; }
	.clear-btn { font-family: inherit; font-size: 12.5px; font-weight: 600; color: #52525B; background: white; border: 1px solid var(--border); border-radius: 9px; padding: 7px 12px; cursor: pointer; }
	.clear-btn:hover { background: #FAFAFA; }

	.status { font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 100px; text-transform: capitalize; }
	.status.planned { background: #FEF9C3; color: #a16207; }
	.status.confirmed { background: #DBEAFE; color: #1d4ed8; }
	.status.done { background: #F0FDF4; color: #16a34a; }
	.status.cancelled { background: #FEF2F2; color: #dc2626; }
</style>
