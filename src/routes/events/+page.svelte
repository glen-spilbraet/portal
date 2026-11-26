<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { goto } from '$app/navigation';
	import CountrySelect from '$lib/components/CountrySelect.svelte';

	let { data } = $props();
	// ── New-event modal ─────────────────────────────────────────────────────────
	const NEW = '__new__';
	let showNew = $state(false);
	let busy = $state(false);
	let nf = $state(blankNew());
	function blankNew() {
		return { title: '', venue_id: '', type_id: '', event_date: '', end_date: '', multi: false, start_time: '', end_time: '',
			venue_name: '', venue_city: '', venue_country: 'Denmark', type_name: '' };
	}
	function openNew() { nf = blankNew(); showNew = true; }
	function closeNew() { if (!busy) showNew = false; }
	const canCreate = $derived(
		!!nf.title.trim() && !!nf.event_date &&
		(nf.venue_id !== NEW || !!nf.venue_name.trim()) &&
		(nf.type_id !== NEW || !!nf.type_name.trim())
	);

	async function post(url, body) {
		const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		const out = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(out.message ?? 'Failed');
		return out;
	}

	async function createEvent() {
		if (busy || !canCreate) return;
		busy = true;
		try {
			let venue_id = nf.venue_id || null;
			if (venue_id === NEW) venue_id = (await post('/api/events/venues', { name: nf.venue_name.trim(), city: nf.venue_city.trim() || null, country: nf.venue_country || null })).id;
			let type_id = nf.type_id || null;
			if (type_id === NEW) type_id = (await post('/api/events/types', { name: nf.type_name.trim() })).id;
			const { id } = await post('/api/events', {
				title: nf.title.trim(), venue_id, type_id, status: 'planned',
				event_date: nf.event_date, end_date: nf.multi && nf.end_date && nf.end_date !== nf.event_date ? nf.end_date : null,
				start_time: nf.start_time || null, end_time: nf.end_time || null,
			});
			await goto(`/events/${id}`);
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
			busy = false;
		}
	}

	const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	function parts(d) {
		const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? '');
		return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
	}
	// Compact range: "20 Nov 2026", "20–22 Nov 2026", "30 Nov – 1 Dec 2026", "30 Dec 2026 – 2 Jan 2027"
	function fmtWhen(e) {
		const a = parts(e.event_date);
		if (!a) return e.event_date || '—';
		const b = e.end_date && e.end_date !== e.event_date ? parts(e.end_date) : null;
		if (!b) return `${a.d} ${MON[a.m]} ${a.y}`;
		if (a.y !== b.y) return `${a.d} ${MON[a.m]} ${a.y} – ${b.d} ${MON[b.m]} ${b.y}`;
		if (a.m !== b.m) return `${a.d} ${MON[a.m]} – ${b.d} ${MON[b.m]} ${b.y}`;
		return `${a.d}–${b.d} ${MON[a.m]} ${a.y}`;
	}

	// ── Filters ────────────────────────────────────────────────────────────────
	let fStatus = $state('notdone');   // notdone (default, excludes done + cancelled) · done · cancelled · all
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
			if (fStatus === 'notdone' && (e.status === 'done' || e.status === 'cancelled')) return false;
			if (fStatus === 'done' && e.status !== 'done') return false;
			if (fStatus === 'cancelled' && e.status !== 'cancelled') return false;
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
			<button class="btn primary" onclick={openNew}>+ New event</button>
		</div>

		{#if data.events.length === 0}
			<p class="empty">No events yet.</p>
		{:else}
			<div class="filters">
				<div class="seg-ctrl" role="group" aria-label="Status filter">
					<button class:active={fStatus === 'notdone'} onclick={() => (fStatus = 'notdone')}>Open</button>
					<button class:active={fStatus === 'done'} onclick={() => (fStatus = 'done')}>Done</button>
					<button class:active={fStatus === 'cancelled'} onclick={() => (fStatus = 'cancelled')}>Cancelled</button>
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
				</colgroup>
				<thead>
					<tr><th>Date</th><th>Event</th><th>Venue</th><th>Type</th><th>Status</th><th class="num">Participants</th><th class="num">SKUs</th></tr>
				</thead>
				<tbody>
					{#each filtered as e (e.id)}
						{@const when = fmtWhen(e)}
						{@const title = e.title || 'Untitled event'}
						<tr class="clickable" onclick={() => goto(`/events/${e.id}`)}>
							<td class="date-cell" title={when}>{when}</td>
							<td class="strong" title={title}>{title}</td>
							<td title={e.venue_name ?? ''}>{e.venue_name ?? '—'}</td>
							<td title={e.type_name ?? ''}>{e.type_name ?? '—'}</td>
							<td><span class="status {e.status}">{e.status}</span></td>
							<td class="num">{e.participants_actual ?? e.participants_expected ?? '—'}</td>
							<td class="num">{e.sku_count}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{/if}
		{/if}
	</main>
</div>

{#if showNew}
	<div class="modal-overlay" onclick={closeNew} role="presentation">
		<form class="modal" onclick={(e) => e.stopPropagation()} onsubmit={(e) => { e.preventDefault(); createEvent(); }} role="dialog" aria-modal="true" aria-label="New event">
			<button type="button" class="modal-x" onclick={closeNew} aria-label="Close">✕</button>
			<h3 class="modal-title">New event</h3>

			<div class="m-grid">
				<label class="fld span2"><span>Title</span>
					<!-- svelte-ignore a11y_autofocus -->
					<input bind:value={nf.title} autofocus placeholder="e.g. Puslespilsturnering hos …" />
				</label>

				<label class="fld"><span>Venue</span>
					<select bind:value={nf.venue_id}>
						<option value="">—</option>
						{#each data.venues as v (v.id)}<option value={v.id}>{v.name}{v.city ? ` · ${v.city}` : ''}</option>{/each}
						<option value={NEW}>+ New venue…</option>
					</select>
				</label>
				<label class="fld"><span>Type</span>
					<select bind:value={nf.type_id}>
						<option value="">—</option>
						{#each data.types as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
						<option value={NEW}>+ New type…</option>
					</select>
				</label>

				{#if nf.venue_id === NEW}
					<div class="new-box span2">
						<div class="new-head">New venue</div>
						<div class="new-grid">
							<label class="fld"><span>Name</span><input bind:value={nf.venue_name} /></label>
							<label class="fld"><span>City</span><input bind:value={nf.venue_city} /></label>
							<label class="fld"><span>Country</span><CountrySelect bind:value={nf.venue_country} /></label>
						</div>
					</div>
				{/if}
				{#if nf.type_id === NEW}
					<div class="new-box span2">
						<div class="new-head">New type</div>
						<label class="fld"><span>Name</span><input bind:value={nf.type_name} placeholder="e.g. Event - Tournament" /></label>
					</div>
				{/if}

				<div class="fld span2">
					<div class="when-head">
						<span>When</span>
						<label class="multi-chk"><input type="checkbox" bind:checked={nf.multi} /> Multi-day</label>
					</div>
					<div class="combo">
						<div class="seg"><small>{nf.multi ? 'Start date' : 'Date'}</small><input type="date" bind:value={nf.event_date} /></div>
						{#if nf.multi}
							<div class="seg"><small>End date</small><input type="date" min={nf.event_date || undefined} bind:value={nf.end_date} /></div>
						{/if}
						<div class="seg"><small>Start</small><input type="time" bind:value={nf.start_time} /></div>
						<div class="seg"><small>End</small><input type="time" bind:value={nf.end_time} /></div>
					</div>
				</div>
			</div>

			<div class="modal-foot">
				<button type="button" class="btn" onclick={closeNew} disabled={busy}>Cancel</button>
				<button type="submit" class="btn primary" disabled={busy || !canCreate}>{busy ? 'Creating…' : 'Create event'}</button>
			</div>
		</form>
	</div>
{/if}

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') closeNew(); }} />

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; }
	main { flex: 1; max-width: 1200px; margin: 0 auto; width: 100%; padding: 32px 28px 80px; }
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
	   column takes the remaining space. Every cell stays on one line and long
	   values get an ellipsis (full text in the title tooltip). */
	.c-date { width: 150px; }
	.date-cell { color: #52525B; }
	.c-event { width: auto; }
	.c-venue { width: 180px; }
	.c-type { width: 170px; }
	.c-status { width: 104px; }
	.c-part { width: 118px; }
	.c-skus { width: 64px; }
	.tbl td, .tbl th { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
	/* New-event modal */
	.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 50; }
	.modal { position: relative; background: white; border-radius: 16px; padding: 24px; max-width: 600px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.25); box-sizing: border-box; }
	.modal-x { position: absolute; top: 14px; right: 14px; width: 32px; height: 32px; border: none; background: #F4F4F5; border-radius: 8px; font-size: 15px; color: #52525B; cursor: pointer; }
	.modal-title { font-size: 18px; font-weight: 700; margin: 0 0 18px; }
	.modal-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
	.m-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	.span2 { grid-column: 1 / -1; }
	.fld { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
	.fld > span { font-size: 12px; font-weight: 600; color: #71717A; }
	.modal input, .modal select { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; font-family: inherit; color: #18181B; background: white; outline: none; }
	.modal input:focus, .modal select:focus { border-color: #F57832; }
	.new-box { border: 1px dashed #F5B48C; background: #FFF8F3; border-radius: 10px; padding: 10px 12px 12px; }
	.new-head { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #c2551b; margin-bottom: 8px; }
	.new-grid { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 8px; }
	.when-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
	.when-head > span { font-size: 12px; font-weight: 600; color: #71717A; }
	.multi-chk { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: #71717A; cursor: pointer; }
	.modal .multi-chk input { width: 14px; height: 14px; padding: 0; accent-color: #F57832; }
	.combo { display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
	.combo .seg { display: flex; flex-direction: column; flex: 1; min-width: 0; }
	.combo .seg + .seg { border-left: 1px solid var(--border); }
	.combo .seg small { font-size: 11px; font-weight: 600; color: #A1A1AA; padding: 6px 10px 0; }
	.modal .combo .seg input { border: none; border-radius: 0; padding: 4px 10px 8px; }
	.combo .seg:focus-within { background: #FAFAFA; }
	@media (max-width: 560px) { .m-grid, .new-grid { grid-template-columns: 1fr; } }
</style>
