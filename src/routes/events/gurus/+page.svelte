<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import CountrySelect from '$lib/components/CountrySelect.svelte';
	import { invalidateAll, goto } from '$app/navigation';

	let { data } = $props();
	let busy = $state(false);

	// ── Events & performance modal ───────────────────────────────────────────────
	/** @type {any} */
	let perfGuru = $state(null);
	/** @type {any[] | null} */
	let perfRows = $state(null);
	let perfErr = $state('');
	async function openPerf(g) {
		perfGuru = g; perfRows = null; perfErr = '';
		try {
			const res = await fetch(`/api/events/gurus/${g.id}/events`);
			if (!res.ok) throw new Error('Could not load events');
			const rows = await res.json();
			if (perfGuru?.id === g.id) perfRows = rows;
		} catch (e) { perfErr = e instanceof Error ? e.message : String(e); }
	}
	function closePerf() { perfGuru = null; }
	const today = new Date().toISOString().slice(0, 10);
	const isUpcoming = (r) => (r.end_date || r.event_date || '') >= today && r.status !== 'done';
	const perfTotals = $derived.by(() => {
		const rows = perfRows ?? [];
		const att = rows.filter((r) => r.participants_actual != null);
		const attendees = att.reduce((n, r) => n + r.participants_actual, 0);
		const tb = rows.filter((r) => r.tombola_id);
		return {
			events: rows.length,
			past: rows.filter((r) => !isUpcoming(r)).length,
			attendees, avg: att.length ? Math.round(attendees / att.length) : null,
			media: rows.reduce((n, r) => n + r.media_count, 0),
			good: rows.reduce((n, r) => n + r.media_good, 0),
			semi: rows.reduce((n, r) => n + r.media_semi, 0),
			bad: rows.reduce((n, r) => n + r.media_bad, 0),
			signups: tb.reduce((n, r) => n + r.tombola_entries, 0),
			rated: rows.filter((r) => r.guru_rating != null).length,
			ratingAvg: (() => { const x = rows.filter((r) => r.guru_rating != null); return x.length ? x.reduce((n, r) => n + r.guru_rating, 0) / x.length : null; })(),
			tombolas: tb.length,
		};
	});
	const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	function dp(d) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? ''); return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null; }
	function fmtWhen(r) {
		const a = dp(r.event_date); if (!a) return '—';
		const b = r.end_date && r.end_date !== r.event_date ? dp(r.end_date) : null;
		if (!b) return `${a.d} ${MON[a.m]} ${a.y}`;
		if (a.y !== b.y) return `${a.d} ${MON[a.m]} ${a.y} – ${b.d} ${MON[b.m]} ${b.y}`;
		if (a.m !== b.m) return `${a.d} ${MON[a.m]} – ${b.d} ${MON[b.m]} ${b.y}`;
		return `${a.d}–${b.d} ${MON[a.m]} ${a.y}`;
	}

	// ── Create / edit modal ──────────────────────────────────────────────────────
	const blank = () => ({ name: '', phone: '', email: '', zip: '', city: '', country: '', notes: '' });
	let modalOpen = $state(false);
	let mode = $state('create'); // 'create' | 'edit'
	let editId = $state(null);
	let form = $state(blank());

	function openCreate() { mode = 'create'; editId = null; form = blank(); modalOpen = true; }
	function openEdit(g) {
		mode = 'edit'; editId = g.id;
		form = { name: g.name ?? '', phone: g.phone ?? '', email: g.email ?? '', zip: g.zip ?? '', city: g.city ?? '', country: g.country ?? '', notes: g.notes ?? '' };
		modalOpen = true;
	}
	function closeModal() { modalOpen = false; }

	async function save() {
		if (!form.name.trim() || busy) return;
		busy = true;
		try {
			const url = mode === 'edit' ? `/api/events/gurus/${editId}` : '/api/events/gurus';
			const res = await fetch(url, {
				method: mode === 'edit' ? 'PUT' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form)
			});
			if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Failed');
			modalOpen = false;
			await invalidateAll();
		} catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { busy = false; }
	}

	// ── Card actions ─────────────────────────────────────────────────────────────
	async function patchGuru(id, patch) {
		await fetch(`/api/events/gurus/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
		await invalidateAll();
	}

	async function deleteGuru(id) {
		if (!confirm('Delete this guru?')) return;
		await fetch(`/api/events/gurus/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}

	async function uploadPhoto(e, id) {
		const file = e.currentTarget.files?.[0];
		if (!file) return;
		busy = true;
		try {
			const fd = new FormData(); fd.append('file', file);
			const res = await fetch(`/api/events/gurus/${id}/image`, { method: 'POST', body: fd });
			if (!res.ok) throw new Error('Upload failed');
			await invalidateAll();
		} catch (err) { alert(err instanceof Error ? err.message : String(err)); } finally { busy = false; e.target.value = ''; }
	}
</script>

<svelte:head><title>Game Gurus — Product Portal</title></svelte:head>

<div class="page">
	<AppNav active="events-gurus" user={data.user} />

	<main>
		<div class="page-header">
			<div>
				<h1 class="page-title">Game Gurus</h1>
				<p class="page-sub">The people we hire to run events. Attach them to events and rate them per event.</p>
			</div>
			<button class="btn primary" onclick={openCreate}>+ Add guru</button>
		</div>

		{#if data.gurus.length === 0}
			<p class="empty">No gurus yet. Click “Add guru” to create one.</p>
		{/if}

		<div class="guru-grid">
			{#each data.gurus as g (g.id)}
				<div class="guru">
					<div class="guru-top">
						<label class="avatar" title="Upload photo">
							{#if g.image_key}<img src="/api/img/{g.image_key}" alt={g.name} />{:else}<span class="avatar-ph">{g.name?.[0]?.toUpperCase() ?? '?'}</span>{/if}
							<input type="file" hidden accept="image/*" onchange={(e) => uploadPhoto(e, g.id)} />
							<span class="avatar-ov">
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
							</span>
						</label>
						<div class="guru-id">
							<span class="guru-name">{g.name}</span>
							<span class="muted">{[[g.zip, g.city].filter(Boolean).join(' '), g.country].filter(Boolean).join(', ') || 'No location'}</span>
						</div>
					</div>

					<div class="guru-contact">
						{#if g.phone}
							<span class="ci">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
								{g.phone}
							</span>
						{/if}
						{#if g.email}
							<span class="ci">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
								{g.email}
							</span>
						{/if}
					</div>
					<div class="guru-bottom">
						{#if g.rating_count}
							<div class="avg" title="Average of {g.rating_count} rated event{g.rating_count > 1 ? 's' : ''}">
								<span class="stars-ro" style="--pct:{(g.rating_avg / 5) * 100}%" aria-hidden="true">★★★★★</span>
								<b>{g.rating_avg.toFixed(1)}</b><span class="muted">· {g.rating_count}</span>
							</div>
						{:else}
							<span class="muted">Not rated yet</span>
						{/if}
						<div class="row-actions">
							<button class="chip chip-btn" onclick={() => openPerf(g)} disabled={!g.event_count} title={g.event_count ? "Events & performance" : undefined}>{g.event_count} {g.event_count === 1 ? 'event' : 'events'}</button>
							<button class="btn sm" onclick={() => openEdit(g)}>Edit</button>
							<button class="btn sm danger" onclick={() => deleteGuru(g.id)}>Delete</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	</main>
</div>

{#if modalOpen}
	<div class="modal-overlay" onclick={closeModal} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Guru">
			<button class="modal-x" onclick={closeModal} aria-label="Close">✕</button>
			<h3 class="modal-title">{mode === 'edit' ? 'Edit guru' : 'Add guru'}</h3>
			<div class="grid">
				<label class="fld span2"><span>Name *</span><input bind:value={form.name} /></label>
				<label class="fld"><span>Phone</span><input bind:value={form.phone} /></label>
				<label class="fld"><span>Email</span><input bind:value={form.email} /></label>
				<label class="fld"><span>Zip</span><input bind:value={form.zip} /></label>
				<label class="fld"><span>City</span><input bind:value={form.city} /></label>
				<label class="fld span2"><span>Country</span><CountrySelect bind:value={form.country} /></label>
				<label class="fld span2"><span>Notes (internal)</span><textarea rows="2" bind:value={form.notes}></textarea></label>
			</div>
			<div class="modal-foot">
				<button class="btn" onclick={closeModal}>Cancel</button>
				<button class="btn primary" onclick={save} disabled={busy || !form.name.trim()}>{mode === 'edit' ? 'Save' : 'Add guru'}</button>
			</div>
		</div>
	</div>
{/if}

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') { closeModal(); closePerf(); } }} />

{#if perfGuru}
	<div class="modal-overlay" onclick={closePerf} role="presentation">
		<div class="modal perf" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Events for {perfGuru.name}">
			<button class="modal-x" onclick={closePerf} aria-label="Close">✕</button>
			<div class="perf-head">
				<div class="avatar sm">{#if perfGuru.image_key}<img src="/api/img/{perfGuru.image_key}" alt="" />{:else}<span class="avatar-ph">{perfGuru.name?.[0]?.toUpperCase() ?? '?'}</span>{/if}</div>
				<div class="perf-id">
					<h3 class="modal-title">{perfGuru.name}</h3>
					<span class="muted">Events &amp; performance</span>
				</div>
			</div>

			{#if perfErr}
				<p class="empty">{perfErr}</p>
			{:else if perfRows === null}
				<p class="empty">Loading…</p>
			{:else if perfRows.length === 0}
				<p class="empty">No events yet.</p>
			{:else}
				{@const t = perfTotals}
				<div class="tiles">
					<div class="tile"><span class="t-label">Rating</span>
						{#if t.ratingAvg != null}<span class="t-val">{t.ratingAvg.toFixed(1)}<span class="t-of">/5</span></span><span class="t-sub">{t.rated} of {t.events} rated</span>
						{:else}<span class="t-val dim">—</span><span class="t-sub">Not rated yet</span>{/if}
					</div>
					<div class="tile"><span class="t-label">Events</span><span class="t-val">{t.events}</span><span class="t-sub">{t.past} held · {t.events - t.past} upcoming</span></div>
					<div class="tile"><span class="t-label">Attendees</span><span class="t-val">{t.attendees}</span><span class="t-sub">{t.avg != null ? `Ø ${t.avg} per event` : 'None recorded'}</span></div>
					<div class="tile"><span class="t-label">Photos &amp; video</span><span class="t-val">{t.media}</span>
						<span class="t-sub rcs">{#if t.good}<span class="rc good" title="Good">{t.good}</span>{/if}{#if t.semi}<span class="rc semi" title="Semi">{t.semi}</span>{/if}{#if t.bad}<span class="rc bad" title="Bad">{t.bad}</span>{/if}{#if !t.good && !t.semi && !t.bad}Not rated{/if}</span>
					</div>
					<div class="tile"><span class="t-label">Tombola sign-ups</span><span class="t-val">{t.signups}</span><span class="t-sub">{t.tombolas} of {t.events} events</span></div>
				</div>

				<div class="perf-table-wrap">
					<table class="perf-table">
						<colgroup><col style="width:130px" /><col /><col style="width:96px" /><col style="width:96px" /><col style="width:130px" /><col style="width:120px" /></colgroup>
						<thead><tr><th>Date</th><th>Event</th><th>Rating</th><th class="num">Attended</th><th>Photos</th><th class="num">Tombola</th></tr></thead>
						<tbody>
							{#each perfRows as r (r.id)}
								{@const up = isUpcoming(r)}
								<tr class="clickable" class:upcoming={up} onclick={() => goto(`/events/${r.id}`)}>
									<td class="dim" title={fmtWhen(r)}>{fmtWhen(r)}</td>
									<td>
										<div class="ev-cell">
											<span class="ev-title" title={r.title}>{r.title || 'Untitled event'}</span>
											<span class="ev-sub" title={[r.venue_name, r.type_name].filter(Boolean).join(' · ')}>{[r.venue_name, r.type_name].filter(Boolean).join(' · ') || '—'}</span>
										</div>
									</td>
									<td>
										{#if r.guru_rating != null}<span class="stars-ro sm" style="--pct:{(r.guru_rating / 5) * 100}%" title="{r.guru_rating} / 5">★★★★★</span>
										{:else}<span class="dim">—</span>{/if}
									</td>
									<td class="num">
										{#if r.participants_actual != null}<b>{r.participants_actual}</b>{#if r.participants_expected != null}<span class="dim"> / {r.participants_expected}</span>{/if}
										{:else if up}<span class="tag-up">Upcoming</span>
										{:else}<span class="dim">—</span>{/if}
									</td>
									<td>
										{#if r.media_count}
											<span class="rcs"><b>{r.media_count}</b>{#if r.media_good}<span class="rc good" title="Good">{r.media_good}</span>{/if}{#if r.media_semi}<span class="rc semi" title="Semi">{r.media_semi}</span>{/if}{#if r.media_bad}<span class="rc bad" title="Bad">{r.media_bad}</span>{/if}</span>
										{:else}<span class="dim">None</span>{/if}
									</td>
									<td class="num">
										{#if r.tombola_id}<b>{r.tombola_entries}</b> <span class="dim">sign-ups</span>
										{:else}<span class="dim">No tombola</span>{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; }
	main { flex: 1; max-width: 1200px; margin: 0 auto; width: 100%; padding: 32px 28px 80px; }
	.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
	.page-title { font-size: 18px; font-weight: 700; color: #18181B; margin: 0 0 2px; }
	.page-sub { font-size: 13px; color: #A1A1AA; margin: 0; max-width: 620px; }

	.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid var(--border); border-radius: 10px; background: white; font-size: 13px; font-weight: 600; font-family: inherit; color: #18181B; cursor: pointer; }
	.btn:hover:not(:disabled) { background: #FAFAFA; }
	.btn:disabled { opacity: 0.5; cursor: default; }
	.btn.primary { background: #F57832; color: white; border-color: #F57832; }
	.btn.primary:hover:not(:disabled) { background: #e26a26; }
	.btn.sm { padding: 5px 10px; font-size: 12px; }
	.btn.danger { color: #dc2626; }
	.empty { color: #A1A1AA; font-size: 13px; padding: 8px 0; }
	.muted { color: #A1A1AA; font-size: 12px; }

	.guru-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
	.guru { background: white; border: 1px solid var(--border); border-radius: 12px; padding: 14px; }
	.guru-top { display: flex; align-items: center; gap: 12px; }
	.avatar { position: relative; width: 48px; height: 48px; border-radius: 50%; overflow: hidden; background: #F4F4F5; flex-shrink: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; }
	.avatar img { width: 100%; height: 100%; object-fit: cover; }
	.avatar-ph { font-size: 18px; font-weight: 700; color: #A1A1AA; }
	.avatar-ov { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.45); color: #fff; opacity: 0; transition: opacity 0.15s; }
	.avatar:hover .avatar-ov { opacity: 1; }
	.guru-id { flex: 1; min-width: 0; display: flex; flex-direction: column; }
	.guru-name { font-weight: 700; font-size: 14px; color: #18181B; }

	.guru-contact { display: flex; flex-wrap: wrap; gap: 14px; margin: 12px 0 0; font-size: 12px; color: #52525B; }
	.ci { display: inline-flex; align-items: center; gap: 6px; }
	.ci svg { width: 14px; height: 14px; color: #A1A1AA; flex-shrink: 0; }
	.guru-bottom { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
	.row-actions { display: flex; align-items: center; gap: 6px; }
	.chip { font-size: 11px; font-weight: 600; color: #71717A; background: #F4F4F5; padding: 3px 9px; border-radius: 100px; }

	/* Modal */
	.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 50; }
	.modal { position: relative; background: white; border-radius: 16px; padding: 24px; max-width: 560px; width: 100%; max-height: 85vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
	.modal-x { position: absolute; top: 14px; right: 14px; width: 32px; height: 32px; border: none; background: #F4F4F5; border-radius: 8px; font-size: 15px; color: #52525B; cursor: pointer; }
	.modal-title { font-size: 18px; font-weight: 700; margin: 0 0 16px; padding-right: 40px; }
	.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	.fld { display: flex; flex-direction: column; gap: 4px; }
	.fld.span2 { grid-column: 1 / -1; }
	.fld span { font-size: 12px; font-weight: 600; color: #71717A; }
	input, textarea { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; font-family: inherit; color: #18181B; background: white; outline: none; }
	input:focus, textarea:focus { border-color: #A1A1AA; }
	textarea { resize: vertical; }
	.modal-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
	/* Events & performance modal */
	.chip-btn { border: none; font-family: inherit; cursor: pointer; }
	.chip-btn:hover:not(:disabled) { background: #FFF4ED; color: #c2551b; }
	.chip-btn:disabled { cursor: default; }
	.modal.perf { max-width: 960px; }
	.t-of { font-size: 13px; font-weight: 600; color: #A1A1AA; margin-left: 2px; }
	/* read-only stars: gold fill clipped to --pct */
	.stars-ro { display: inline-block; font-size: 17px; letter-spacing: 1px; line-height: 1; background: linear-gradient(90deg, #F5A623 var(--pct), #E4E4E7 var(--pct)); -webkit-background-clip: text; background-clip: text; color: transparent; }
	.stars-ro.sm { font-size: 14px; }
	.avg { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #18181B; }
	.perf-head { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; padding-right: 40px; }
	.perf-head .modal-title { margin: 0; }
	.perf-id { display: flex; flex-direction: column; min-width: 0; }
	.avatar.sm { width: 44px; height: 44px; cursor: default; }
	.tiles { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-bottom: 16px; }
	.tile { display: flex; flex-direction: column; gap: 3px; padding: 12px 14px; border: 1px solid #F0F0F1; background: #FAFAFA; border-radius: 12px; min-width: 0; }
	.t-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #A1A1AA; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.t-val { font-size: 22px; font-weight: 800; color: #18181B; line-height: 1.15; font-variant-numeric: tabular-nums; }
	.t-sub { font-size: 12px; color: #71717A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.rcs { display: inline-flex; align-items: center; gap: 8px; }
	.rc { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; color: #52525B; }
	.rc::before { content: ''; width: 7px; height: 7px; border-radius: 50%; }
	.rc.good::before { background: #16a34a; } .rc.semi::before { background: #f59e0b; } .rc.bad::before { background: #dc2626; }
	.perf-table-wrap { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
	.perf-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 13px; }
	.perf-table th { text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #A1A1AA; padding: 9px 12px; background: #FAFAFA; border-bottom: 1px solid var(--border); white-space: nowrap; }
	.perf-table td { padding: 10px 12px; border-bottom: 1px solid #F4F4F5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #18181B; }
	.perf-table tbody tr:last-child td { border-bottom: none; }
	.perf-table .num { text-align: right; }
	.perf-table tr.clickable { cursor: pointer; }
	.perf-table tr.clickable:hover td { background: #FAFAFA; }
	.ev-cell { display: flex; flex-direction: column; min-width: 0; }
	.ev-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
	.ev-sub { font-size: 12px; color: #A1A1AA; overflow: hidden; text-overflow: ellipsis; }
	.dim { color: #A1A1AA; }
	.tag-up { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 100px; background: #DBEAFE; color: #1d4ed8; }
	@media (max-width: 760px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
