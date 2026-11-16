<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { invalidateAll, goto } from '$app/navigation';

	let { data } = $props();

	// Editable form seeded from the loaded event.
	let form = $state({ ...data.event });
	$effect(() => { form = { ...data.event }; }); // re-seed when data reloads

	let saving = $state(false);
	let savedFlash = $state(false);

	async function save() {
		if (saving) return;
		saving = true;
		try {
			const res = await fetch(`/api/events/${data.event.id}`, {
				method: 'PUT', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: form.title, venue_id: form.venue_id || null, type_id: form.type_id || null,
					event_date: form.event_date, end_date: form.end_date || null, start_time: form.start_time, end_time: form.end_time,
					entry_fee: form.entry_fee === '' ? null : form.entry_fee,
					entry_fee_currency: form.entry_fee_currency || 'DKK',
					participants_expected: form.participants_expected === '' ? null : form.participants_expected,
					participants_actual: form.participants_actual === '' ? null : form.participants_actual,
					status: form.status, notes: form.notes,
				})
			});
			if (!res.ok) throw new Error('Failed to save');
			await invalidateAll();
			savedFlash = true; setTimeout(() => (savedFlash = false), 1500);
		} catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { saving = false; }
	}

	async function removeEvent() {
		if (!confirm('Delete this event? This cannot be undone.')) return;
		await fetch(`/api/events/${data.event.id}`, { method: 'DELETE' });
		await goto('/events');
	}

	// ── SKU picker ──────────────────────────────────────────────────────────────
	let skus = $state([...data.event.skus]);
	$effect(() => { skus = [...data.event.skus]; });
	let skuQuery = $state('');
	/** @type {{sku:string,name:string}[]} */
	let skuResults = $state([]);
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let skuTimer;

	function searchSku() {
		clearTimeout(skuTimer);
		const q = skuQuery.trim();
		if (q.length < 2) { skuResults = []; return; }
		skuTimer = setTimeout(async () => {
			const res = await fetch(`/api/events/products?q=${encodeURIComponent(q)}`);
			skuResults = res.ok ? await res.json() : [];
		}, 200);
	}

	async function saveSkus() {
		const res = await fetch(`/api/events/${data.event.id}/skus`, {
			method: 'PUT', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ skus })
		});
		if (!res.ok) { alert('Failed to save SKUs'); return; }
		await invalidateAll();
	}
	async function addSku(sku) {
		if (!skus.includes(sku)) { skus = [...skus, sku]; await saveSkus(); }
		skuQuery = ''; skuResults = [];
	}
	async function removeSku(sku) { skus = skus.filter((s) => s !== sku); await saveSkus(); }

	// ── People (contacts + gurus) for this event ──────────────────────────────────
	const attachedContactIds = $derived(new Set(data.eventContacts.map((c) => c.id)));
	const availableContacts = $derived(data.venueContacts.filter((c) => !attachedContactIds.has(c.id)));
	const attachedGuruIds = $derived(new Set(data.eventGurus.map((g) => g.id)));
	const availableGurus = $derived(data.gurus.filter((g) => !attachedGuruIds.has(g.id)));

	const people = $derived([
		...data.eventContacts.map((c) => ({
			kind: 'contact', id: c.id, name: c.name || '—',
			sub: c.role || '', inFlow: !!c.event_flow,
		})),
		...data.eventGurus.map((g) => ({
			kind: 'guru', id: g.id, name: g.name,
			sub: [[g.zip, g.city].filter(Boolean).join(' '), g.country].filter(Boolean).join(', '),
			inFlow: !!g.event_flow, status: g.status, image_key: g.image_key, proposalUrl: g.proposalUrl,
		})),
	]);

	async function toggleFlow(row) {
		const base = row.kind === 'contact' ? 'contacts' : 'gurus';
		await fetch(`/api/events/${data.event.id}/${base}/${row.id}`, {
			method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ in_email_flow: !row.inFlow })
		});
		await invalidateAll();
	}
	async function removePerson(row) {
		if (row.kind === 'guru' && !confirm('Remove this guru from the event?')) return;
		const base = row.kind === 'contact' ? 'contacts' : 'gurus';
		await fetch(`/api/events/${data.event.id}/${base}/${row.id}`, { method: 'DELETE' });
		await invalidateAll();
	}
	async function setGuruStatus(id, status) {
		await fetch(`/api/events/${data.event.id}/gurus/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
		await invalidateAll();
	}
	let copiedGuru = $state(null);
	function copyProposal(row) { navigator.clipboard?.writeText(row.proposalUrl); copiedGuru = row.id; setTimeout(() => (copiedGuru = null), 1500); }

	// Add-people modal
	let addMode = $state(null); // 'contact' | 'guru' | null
	/** @type {string[]} */
	let picks = $state([]);
	let addingPeople = $state(false);
	function openAdd(mode) { addMode = mode; picks = []; }
	function closeAdd() { addMode = null; picks = []; }
	function togglePick(id) { picks = picks.includes(id) ? picks.filter((x) => x !== id) : [...picks, id]; }
	async function confirmAdd() {
		if (!picks.length || addingPeople) return;
		addingPeople = true;
		try {
			const url = addMode === 'contact' ? `/api/events/${data.event.id}/contacts` : `/api/events/${data.event.id}/gurus`;
			const payload = addMode === 'contact' ? { contactIds: picks } : { guruIds: picks };
			const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
			if (!res.ok) throw new Error('Failed');
			await invalidateAll();
			closeAdd();
		} catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { addingPeople = false; }
	}

	// ── Assets ────────────────────────────────────────────────────────────────
	let uploading = $state(false);
	async function upload(e, category) {
		const files = Array.from(e.currentTarget.files ?? []);
		if (!files.length) return;
		uploading = true;
		try {
			for (const file of files) {
				const fd = new FormData();
				fd.append('file', file);
				fd.append('category', category);
				const res = await fetch(`/api/events/${data.event.id}/assets`, { method: 'POST', body: fd });
				if (!res.ok) throw new Error(`Upload failed: ${file.name}`);
			}
			await invalidateAll();
		} catch (err) { alert(err instanceof Error ? err.message : String(err)); } finally { uploading = false; e.target.value = ''; }
	}
	async function deleteAsset(id) {
		if (!confirm('Delete this file?')) return;
		await fetch(`/api/events/assets/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}

	// ── Photo product tags ──────────────────────────────────────────────────────
	/** sku → { name, box } for products linked to this event */
	const productBySku = $derived(Object.fromEntries(data.products.map((p) => [p.sku, p])));
	const skuLabel = (sku) => productBySku[sku]?.name ?? sku;

	/** @type {any} */
	let tagAsset = $state(null);
	/** @type {string[]} */
	let tagSkus = $state([]);
	let tagQuery = $state('');
	/** @type {{sku:string,name:string}[]} */
	let tagOthers = $state([]);
	let tagSaving = $state(false);
	/** @type {any} */
	let tagTimer;

	function openTags(a) { tagAsset = a; tagSkus = [...(a.skus ?? [])]; tagQuery = ''; tagOthers = []; }
	function closeTags() { tagAsset = null; }

	// Default: the event's own products, filtered locally by the query.
	const tagEventMatches = $derived.by(() => {
		const q = tagQuery.trim().toLowerCase();
		return data.products.filter((p) => !q || p.sku.toLowerCase().includes(q) || (p.name ?? '').toLowerCase().includes(q));
	});

	// Also search all sales sheets (2+ chars); products already on the event are listed above instead.
	function searchTagOthers() {
		clearTimeout(tagTimer);
		const q = tagQuery.trim();
		if (q.length < 2) { tagOthers = []; return; }
		tagTimer = setTimeout(async () => {
			const res = await fetch(`/api/events/products?q=${encodeURIComponent(q)}`);
			const rows = res.ok ? await res.json() : [];
			if (tagQuery.trim() === q) tagOthers = rows.filter((r) => !productBySku[r.sku]);
		}, 250);
	}

	async function toggleTag(sku) {
		const next = tagSkus.includes(sku) ? tagSkus.filter((s) => s !== sku) : [...tagSkus, sku];
		const prev = tagSkus;
		tagSkus = next;
		tagSaving = true;
		try {
			const res = await fetch(`/api/events/assets/${tagAsset.id}/skus`, {
				method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skus: next })
			});
			if (!res.ok) throw new Error('Failed to save tags');
			const out = await res.json();
			await invalidateAll(); // refresh photo tags (and products if a new one got mapped)
			if (out.mapped?.length) tagOthers = tagOthers.filter((r) => !out.mapped.includes(r.sku));
		} catch (err) { tagSkus = prev; alert(err instanceof Error ? err.message : String(err)); }
		finally { tagSaving = false; }
	}

	// ── Photo rating (internal) ─────────────────────────────────────────────────
	const RATINGS = [
		{ v: 'good', label: 'Good' },
		{ v: 'semi', label: 'Semi' },
		{ v: 'bad', label: 'Bad' },
	];
	const ratingLabel = (v) => RATINGS.find((r) => r.v === v)?.label ?? 'Rate';
	/** asset id whose rating menu is open */
	let rateOpen = $state(/** @type {string|null} */ (null));
	/** optimistic ratings while saving: id → rating */
	let rateLocal = $state(/** @type {Record<string, string|null>} */ ({}));

	async function setRating(a, v) {
		const current = a.id in rateLocal ? rateLocal[a.id] : a.rating;
		const next = current === v ? null : v; // picking the current rating (or Clear) unsets it
		rateLocal = { ...rateLocal, [a.id]: next };
		rateOpen = null;
		const res = await fetch(`/api/events/assets/${a.id}`, {
			method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: next })
		});
		if (!res.ok) alert('Failed to save rating');
		await invalidateAll();
		const { [a.id]: _, ...rest } = rateLocal; rateLocal = rest;
	}

	// ── Share link ──────────────────────────────────────────────────────────────
	let copied = $state(false);
	function copyLink() {
		navigator.clipboard?.writeText(data.shareUrl);
		copied = true; setTimeout(() => (copied = false), 1500);
	}

	const media = $derived(data.event.assets.filter((a) => a.category === 'media'));
	const marketing = $derived(data.event.assets.filter((a) => a.category === 'marketing'));

	function fmtLog(ts) {
		if (!ts) return '';
		try { return new Date(ts.replace(' ', 'T') + 'Z').toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
		catch { return ts; }
	}
</script>

<svelte:head><title>{form.title || 'Event'} — Product Portal</title></svelte:head>

<div class="page">
	<AppNav active="events" user={data.user} />

	<main>
		<div class="page-header">
			<a class="back-link" href="/events">← Events</a>
			<div class="header-actions">
				{#if savedFlash}<span class="flash">Saved ✓</span>{/if}
				<button class="btn danger" onclick={removeEvent}>Delete event</button>
				<button class="btn primary" onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
			</div>
		</div>

		<!-- Details -->
		<div class="card">
			<h2 class="card-title">Details</h2>
			<div class="form-grid">
				<label class="fld span2"><span>Title</span><input bind:value={form.title} /></label>
				<label class="fld"><span>Venue</span>
					<select bind:value={form.venue_id}>
						<option value={null}>—</option>
						{#each data.venues as v}<option value={v.id}>{v.name}</option>{/each}
					</select>
				</label>
				<label class="fld"><span>Type</span>
					<select bind:value={form.type_id}>
						<option value={null}>—</option>
						{#each data.types as t}<option value={t.id}>{t.name}</option>{/each}
					</select>
				</label>
				<div class="fld span2">
					<div class="when-head">
						<span>When</span>
						<label class="multi-chk"><input type="checkbox" checked={!!form.end_date} onchange={(e) => { form.end_date = e.currentTarget.checked ? (form.end_date || form.event_date || '') : ''; }} /> Multi-day</label>
					</div>
					<div class="combo">
						<div class="seg seg-grow"><small>{form.end_date ? 'Start date' : 'Date'}</small><input type="date" bind:value={form.event_date} /></div>
						{#if !!form.end_date}
							<div class="seg seg-grow"><small>End date</small><input type="date" min={form.event_date || undefined} bind:value={form.end_date} /></div>
						{/if}
						<div class="seg"><small>Start</small><input type="time" bind:value={form.start_time} /></div>
						<div class="seg"><small>End</small><input type="time" bind:value={form.end_time} /></div>
					</div>
				</div>
				<label class="fld"><span>Status</span>
					<select bind:value={form.status}>
						<option value="planned">Planned</option>
						<option value="confirmed">Confirmed</option>
						<option value="done">Done</option>
						<option value="cancelled">Cancelled</option>
					</select>
				</label>
				<label class="fld"><span>Entry fee</span>
					<div class="fee">
						<input type="number" step="0.01" bind:value={form.entry_fee} />
						<select bind:value={form.entry_fee_currency}>
							<option value="DKK">DKK</option>
							<option value="SEK">SEK</option>
							<option value="NOK">NOK</option>
							<option value="EUR">EUR</option>
							<option value="USD">USD</option>
						</select>
					</div>
				</label>
				<div class="fld span2"><span>Participants</span>
					<div class="combo">
						<div class="seg seg-grow"><small>Expected</small><input type="number" min="0" placeholder="—" bind:value={form.participants_expected} /></div>
						<div class="seg seg-grow"><small>Attended</small><input type="number" min="0" placeholder="—" bind:value={form.participants_actual} /></div>
					</div>
				</div>
				<label class="fld span2"><span>Notes</span><textarea rows="2" bind:value={form.notes}></textarea></label>
			</div>
		</div>

		<!-- Products -->
		<div class="card">
			<h2 class="card-title">Products at this event</h2>
			<div class="sku-search">
				<input placeholder="Search SKU or product name…" bind:value={skuQuery} oninput={searchSku} />
				{#if skuResults.length > 0}
					<div class="sku-dropdown">
						{#each skuResults as r}
							<button class="sku-opt" onclick={() => addSku(r.sku)}><b>{r.sku}</b> {r.name}</button>
						{/each}
					</div>
				{/if}
			</div>

			{#if data.products.length === 0}
				<p class="empty">No products selected yet.</p>
			{:else}
				<div class="prod-grid">
					{#each data.products as p (p.sku)}
						<div class="prod">
							<div class="prod-thumb">
								{#if p.images?.box}<img src={p.images.box} alt={p.name} />{/if}
								{#if data.badges[p.sku]?.length}
									<div class="badge-row">
										{#each data.badges[p.sku] as b}<img class="badge" src="/api/img/{b.image_key}" alt={b.kind} title="{b.kind}{b.media ? ' · ' + b.media : ''}" />{/each}
									</div>
								{/if}
							</div>
							<div class="prod-info">
								<span class="prod-name">{p.name}</span>
								<span class="muted">{p.sku}</span>
							</div>
							<button class="link-del" onclick={() => removeSku(p.sku)}>✕</button>
						</div>
					{/each}
				</div>
			{/if}
			<p class="hint">Selected products (and any award/nominee badges) are shown to the venue automatically on the share page.</p>
		</div>

		<!-- People (contacts + gurus) -->
		<div class="card">
			<div class="card-head">
				<h2 class="card-title">People for this event <span class="muted">· contacts & gurus</span></h2>
				<div class="head-btns">
					<button class="btn sm" onclick={() => openAdd('contact')}>+ Add contact</button>
					<button class="btn sm" onclick={() => openAdd('guru')}>+ Add guru</button>
				</div>
			</div>

			{#if people.length === 0}
				<p class="empty">No one added yet. Use “Add contact” or “Add guru”.</p>
			{:else}
				<table class="people-table">
					<thead><tr><th>Name</th><th>Type</th><th>Emails</th><th>Status</th><th></th></tr></thead>
					<tbody>
						{#each people as row (row.kind + row.id)}
							<tr>
								<td>
									<div class="p-name">
										<span class="p-avatar">
											{#if row.kind === 'guru' && row.image_key}<img src="/api/img/{row.image_key}" alt={row.name} />
											{:else}{row.name?.[0]?.toUpperCase() ?? '?'}{/if}
										</span>
										<span class="p-id"><span class="strong">{row.name}</span>{#if row.sub}<span class="muted">{row.sub}</span>{/if}</span>
									</div>
								</td>
								<td><span class="type-badge {row.kind}">{row.kind === 'guru' ? 'Guru' : 'Contact'}</span></td>
								<td><button class="flow-pill {row.inFlow ? 'on' : 'off'}" onclick={() => toggleFlow(row)}>{row.inFlow ? 'Gets mail' : 'No mail'}</button></td>
								<td>{#if row.kind === 'guru'}<span class="gstatus {row.status}">{row.status}</span>{:else}<span class="muted">—</span>{/if}</td>
								<td class="actions-cell">
									<div class="p-actions">
										{#if row.kind === 'guru'}
											<button class="btn xs" onclick={() => copyProposal(row)}>{copiedGuru === row.id ? 'Copied ✓' : 'Invite'}</button>
											{#if row.status !== 'confirmed'}<button class="btn xs" onclick={() => setGuruStatus(row.id, 'confirmed')}>Confirm</button>{/if}
										{/if}
										<button class="btn xs danger" onclick={() => removePerson(row)}>✕</button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>

		<!-- Venue share link -->
		<div class="card">
			<h2 class="card-title">Venue share link</h2>
			<p class="hint">Send this link to the venue — no login needed. They can view product info & material and upload their own photos/video.</p>
			<div class="share-row">
				<input class="share-input" readonly value={data.shareUrl} />
				<button class="btn share-btn" onclick={copyLink}>{copied ? 'Copied ✓' : 'Copy'}</button>
				<a class="btn share-btn" href={data.shareUrl} target="_blank" rel="noopener">Open</a>
			</div>
		</div>

		<!-- Marketing assets (we share TO the venue) -->
		<div class="card">
			<h2 class="card-title">Marketing material <span class="muted">· shared with the venue</span></h2>
			{@render assetList(marketing, false)}
			<label class="btn sm upload">{uploading ? 'Uploading…' : '+ Upload material'}<input type="file" hidden multiple onchange={(e) => upload(e, 'marketing')} disabled={uploading} /></label>
		</div>

		<!-- Event media (photos/video — ours + venue's) -->
		<div class="card">
			<h2 class="card-title">Event photos & video</h2>
			{@render assetList(media, true)}
			<label class="btn sm upload">{uploading ? 'Uploading…' : '+ Upload media'}<input type="file" hidden multiple accept="image/*,video/*" onchange={(e) => upload(e, 'media')} disabled={uploading} /></label>
		</div>

		<!-- Participant change log -->
		{#if data.participantLog.length > 0}
			<div class="card">
				<h2 class="card-title">Participant change log</h2>
				<table class="log-table">
					<thead><tr><th>When</th><th>Field</th><th>Change</th><th>By</th></tr></thead>
					<tbody>
						{#each data.participantLog as l (l.id)}
							<tr>
								<td>{fmtLog(l.created_at)}</td>
								<td class="cap">{l.field}</td>
								<td>{l.old_value ?? '—'} → <strong>{l.new_value ?? '—'}</strong></td>
								<td>{l.source === 'venue' ? 'Venue' : (l.actor || 'Internal')}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</main>
</div>

{#if addMode}
	<div class="modal-overlay" onclick={closeAdd} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add people">
			<button class="modal-x" onclick={closeAdd} aria-label="Close">✕</button>
			<h3 class="modal-title">{addMode === 'contact' ? 'Add contacts' : 'Add gurus'}</h3>
			{#if addMode === 'contact'}
				{#if !data.event.venue_id}
					<p class="empty">Pick a venue and save first — contacts come from the venue.</p>
				{:else if availableContacts.length === 0}
					<p class="empty">No more contacts on this venue. Add them under <a href="/events/venues">Venues</a>.</p>
				{:else}
					<div class="pick-list">
						{#each availableContacts as c (c.id)}
							<label class="pick"><input type="checkbox" checked={picks.includes(c.id)} onchange={() => togglePick(c.id)} /> <span class="strong">{c.name || '—'}</span> <span class="muted">{[c.role, c.email].filter(Boolean).join(' · ')}</span></label>
						{/each}
					</div>
				{/if}
			{:else}
				{#if availableGurus.length === 0}
					<p class="empty">No more gurus. Add them under <a href="/events/gurus">Gurus</a>.</p>
				{:else}
					<div class="pick-list">
						{#each availableGurus as g (g.id)}
							<label class="pick"><input type="checkbox" checked={picks.includes(g.id)} onchange={() => togglePick(g.id)} /> <span class="strong">{g.name}</span> <span class="muted">{[[g.zip, g.city].filter(Boolean).join(' '), g.country].filter(Boolean).join(', ')}</span></label>
						{/each}
					</div>
				{/if}
			{/if}
			<div class="modal-foot">
				<button class="btn" onclick={closeAdd}>Cancel</button>
				<button class="btn primary" onclick={confirmAdd} disabled={addingPeople || picks.length === 0}>Add {picks.length || ''}</button>
			</div>
		</div>
	</div>
{/if}

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') { closeAdd(); closeTags(); rateOpen = null; } }} onclick={() => (rateOpen = null)} />

{#if tagAsset}
	<div class="modal-overlay" onclick={closeTags} role="presentation">
		<div class="modal tag-modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Tag products">
			<button class="modal-x" onclick={closeTags} aria-label="Close">✕</button>
			<h3 class="modal-title">Products on this {tagAsset.kind === 'video' ? 'video' : 'photo'}</h3>
			<div class="tag-preview">
				{#if tagAsset.kind === 'image'}<img src="/api/img/{tagAsset.r2_key}" alt={tagAsset.filename} />
				{:else}<video src="/api/img/{tagAsset.r2_key}" controls><track kind="captions" /></video>{/if}
			</div>

			<div class="ptags sel">
				{#if tagSkus.length === 0}<span class="muted">No products tagged yet.</span>{/if}
				{#each tagSkus as sku (sku)}
					<span class="ptag on" title={sku}>{skuLabel(sku)} <button onclick={() => toggleTag(sku)} disabled={tagSaving} aria-label="Remove {sku}">✕</button></span>
				{/each}
			</div>

			<input class="tag-search" placeholder="Filter event products, or search all sheets…" bind:value={tagQuery} oninput={searchTagOthers} />

			<div class="tag-sec">At this event</div>
			{#if data.products.length === 0}
				<p class="empty">No products on this event yet — search all sheets above.</p>
			{:else if tagEventMatches.length === 0}
				<p class="empty">No event products match.</p>
			{:else}
				<div class="pick-list">
					{#each tagEventMatches as p (p.sku)}
						<label class="pick"><input type="checkbox" checked={tagSkus.includes(p.sku)} onchange={() => toggleTag(p.sku)} disabled={tagSaving} /> <span class="strong">{p.name}</span> <span class="muted">{p.sku}</span></label>
					{/each}
				</div>
			{/if}

			{#if tagQuery.trim().length >= 2}
				<div class="tag-sec">All sheets <span class="muted">· picking one also adds it to the event</span></div>
				{#if tagOthers.length === 0}
					<p class="empty">No other products match.</p>
				{:else}
					<div class="pick-list">
						{#each tagOthers as r (r.sku)}
							<label class="pick"><input type="checkbox" checked={tagSkus.includes(r.sku)} onchange={() => toggleTag(r.sku)} disabled={tagSaving} /> <span class="strong">{r.name}</span> <span class="muted">{r.sku}</span></label>
						{/each}
					</div>
				{/if}
			{/if}

			<div class="modal-foot">
				<span class="muted save-state">{tagSaving ? 'Saving…' : 'Saved automatically'}</span>
				<button class="btn" onclick={closeTags}>Done</button>
			</div>
		</div>
	</div>
{/if}

{#snippet assetList(assets, showSource)}
	{#if assets.length === 0}
		<p class="empty">Nothing uploaded yet.</p>
	{:else}
		<div class="asset-grid">
			{#each assets as a (a.id)}
				{@const n = a.skus?.length ?? 0}
				{@const taggable = showSource && (a.kind === 'image' || a.kind === 'video')}
				<div class="asset" class:is-video={a.kind === 'video'} title={a.filename}>
					{#if a.kind === 'image'}
						<a class="thumb" href="/api/img/{a.r2_key}" target="_blank" rel="noopener"><img src="/api/img/{a.r2_key}" alt={a.filename} loading="lazy" /></a>
					{:else if a.kind === 'video'}
						<video class="thumb" src="/api/img/{a.r2_key}" controls preload="metadata"><track kind="captions" /></video>
					{:else}
						<a class="thumb file-tile" href="/api/img/{a.r2_key}" target="_blank" rel="noopener"><span>📄</span><span class="file-name">{a.filename ?? 'file'}</span></a>
					{/if}

					{#if showSource && a.source === 'venue'}<span class="ov-badge">Venue</span>{/if}

					{#if taggable}
						<button
							class="tag-bubble" class:empty={n === 0}
							onclick={() => openTags(a)}
							title={n ? (a.skus ?? []).map(skuLabel).join('\n') : 'Tag products on this photo'}
							aria-label={n ? `${n} products tagged — edit` : 'Tag products'}
						>
							<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M8 1.5 14 4.75v6.5L8 14.5 2 11.25v-6.5L8 1.5Z M2.3 4.9 8 8l5.7-3.1 M8 8v6.3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
							{n ? n : 'Tag'}
						</button>
					{/if}

					{#if taggable}
						{@const r = a.id in rateLocal ? rateLocal[a.id] : a.rating}
						<div class="rate-wrap" class:open={rateOpen === a.id}>
							<button
								class="rate-pill {r ?? 'none'}"
								onclick={(e) => { e.stopPropagation(); rateOpen = rateOpen === a.id ? null : a.id; }}
								aria-haspopup="menu" aria-expanded={rateOpen === a.id}
								aria-label={r ? `Rated ${ratingLabel(r)} — change` : 'Rate photo'}
							>{#if r}<span class="dot"></span>{/if}{ratingLabel(r)}</button>
							{#if rateOpen === a.id}
								<div class="rate-menu" role="menu" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
									{#each RATINGS as opt (opt.v)}
										<button role="menuitemradio" aria-checked={r === opt.v} class="rate-opt {opt.v}" class:sel={r === opt.v} onclick={() => setRating(a, opt.v)}>
											<span class="dot"></span>{opt.label}
										</button>
									{/each}
									{#if r}<button role="menuitem" class="rate-opt clear" onclick={() => setRating(a, r)}>Clear</button>{/if}
								</div>
							{/if}
						</div>
					{/if}

					<button class="ov-del" onclick={() => deleteAsset(a.id)} aria-label="Delete {a.filename ?? 'file'}">✕</button>
				</div>
			{/each}
		</div>
	{/if}
{/snippet}

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; }
	main { flex: 1; max-width: 1200px; margin: 0 auto; width: 100%; padding: 24px 28px 80px; }
	.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
	.back-link { font-size: 13px; font-weight: 600; color: #71717A; text-decoration: none; }
	.back-link:hover { color: #18181B; }
	.header-actions { display: flex; align-items: center; gap: 10px; }
	.flash { font-size: 12px; color: #16a34a; font-weight: 600; }

	.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid var(--border); border-radius: 10px; background: white; font-size: 13px; font-weight: 600; font-family: inherit; color: #18181B; cursor: pointer; text-decoration: none; }
	.btn:hover:not(:disabled) { background: #FAFAFA; }
	.btn:disabled { opacity: 0.5; cursor: default; }
	.btn.primary { background: #F57832; color: white; border-color: #F57832; }
	.btn.primary:hover:not(:disabled) { background: #e26a26; }
	.btn.sm { padding: 5px 10px; font-size: 12px; }
	.btn.danger { color: #dc2626; }
	.btn.upload { margin-top: 12px; }

	.card { background: white; border: 1px solid var(--border); border-radius: 14px; padding: 18px; margin-bottom: 16px; }
	.card-title { font-size: 14px; font-weight: 700; color: #18181B; margin: 0 0 14px; }
	.muted { color: #A1A1AA; font-weight: 500; font-size: 12px; }
	.empty { color: #A1A1AA; font-size: 13px; padding: 8px 0; }
	.hint { font-size: 12px; color: #A1A1AA; margin: 10px 0 0; }

	.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	.fld { display: flex; flex-direction: column; gap: 4px; }
	.fld span { font-size: 12px; font-weight: 600; color: #71717A; }
	.fld.span2 { grid-column: 1 / -1; }
	input, select, textarea { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; font-family: inherit; color: #18181B; background: white; outline: none; }
	input:focus, select:focus, textarea:focus { border-color: #A1A1AA; }
	textarea { resize: vertical; }
	select {
		appearance: none;
		-webkit-appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10' fill='none'%3E%3Cpath d='M2 3.5l3 3 3-3' stroke='%2371717A' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 12px center;
		padding-right: 32px;
	}
	.fee { display: flex; gap: 6px; }
	.fee input { flex: 1; }
	.fee select { width: auto; }

	/* Integrated multi-field ("combo") — several inputs in one bordered box */
	.when-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 4px; }
	.multi-chk { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: #71717A; cursor: pointer; text-transform: none; }
	.multi-chk input { width: 14px; height: 14px; accent-color: #F57832; cursor: pointer; }
	.combo { display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: white; }
	.combo .seg { display: flex; flex-direction: column; min-width: 0; flex: 1; }
	.combo .seg-grow { flex: 1.4; }
	.combo .seg + .seg { border-left: 1px solid var(--border); }
	.combo .seg small { font-size: 11px; font-weight: 600; color: #A1A1AA; padding: 6px 10px 0; }
	.combo .seg input { border: none; border-radius: 0; padding: 4px 10px 8px; background: transparent; }
	.combo .seg input:focus { border: none; box-shadow: none; }
	.combo .seg:focus-within { background: #FAFAFA; }

	.sku-search { position: relative; max-width: 420px; }
	.sku-dropdown { position: absolute; z-index: 5; left: 0; right: 0; background: white; border: 1px solid var(--border); border-radius: 8px; margin-top: 4px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); overflow: hidden; }
	.sku-opt { display: block; width: 100%; text-align: left; padding: 8px 10px; border: none; background: white; font-size: 13px; cursor: pointer; }
	.sku-opt:hover { background: #FAFAFA; }

	.prod-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; margin-top: 14px; }
	.prod { position: relative; border: 1px solid var(--border); border-radius: 10px; padding: 10px; }
	.prod-thumb { position: relative; aspect-ratio: 1; background: #FAFAFA; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
	.prod-thumb img { width: 100%; height: 100%; object-fit: contain; }
	.badge-row { position: absolute; bottom: 4px; right: 4px; display: flex; gap: 3px; }
	.badge { width: 30px; height: 30px; object-fit: contain; }
	.prod-info { display: flex; flex-direction: column; margin-top: 8px; }
	.prod-name { font-size: 12px; font-weight: 600; color: #18181B; line-height: 1.3; }
	.link-del { position: absolute; top: 6px; right: 6px; background: rgba(255,255,255,0.9); border: 1px solid var(--border); border-radius: 6px; width: 22px; height: 22px; color: #71717A; cursor: pointer; }
	.link-del:hover { color: #dc2626; }

	.share-row { display: flex; gap: 8px; align-items: center; }
	.share-input { font-family: monospace; font-size: 12px; }
	.share-btn { flex-shrink: 0; min-width: 84px; justify-content: center; white-space: nowrap; }

	.asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
	.asset { position: relative; border-radius: 12px; overflow: hidden; background: #F4F4F5; aspect-ratio: 1; }
	.asset .thumb { display: block; width: 100%; height: 100%; object-fit: cover; }
	.asset img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .25s ease; }
	.asset:hover img { transform: scale(1.03); }
	.file-tile { display: flex; flex-direction: column; gap: 6px; align-items: center; justify-content: center; text-align: center; font-size: 22px; color: #52525B; text-decoration: none; padding: 12px; box-sizing: border-box; }
	.file-name { font-size: 12px; overflow-wrap: anywhere; }
	/* overlays */
	.ov-badge { position: absolute; top: 8px; left: 8px; font-size: 10px; font-weight: 700; letter-spacing: .02em; padding: 3px 8px; border-radius: 100px; background: rgba(255,255,255,0.92); color: #4338ca; backdrop-filter: blur(6px); pointer-events: none; }
	.ov-del { position: absolute; top: 8px; right: 8px; width: 26px; height: 26px; border-radius: 100px; border: none; background: rgba(24,24,27,0.55); color: white; font-size: 11px; cursor: pointer; backdrop-filter: blur(6px); opacity: 0; transition: opacity .15s ease, background .15s ease; }
	.ov-del:hover { background: #dc2626; }
	.asset:hover .ov-del, .ov-del:focus-visible { opacity: 1; }
	@media (hover: none) { .ov-del { opacity: 1; } }
	.tag-bubble { position: absolute; left: 8px; bottom: 8px; display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px; border-radius: 100px; border: 1px solid transparent; background: rgba(255,255,255,0.95); color: #18181B; font-family: inherit; font-size: 12px; font-weight: 600; line-height: 1; cursor: pointer; backdrop-filter: blur(6px); box-shadow: 0 2px 8px rgba(0,0,0,0.15); transition: transform .12s ease; }
	.tag-bubble:hover { transform: translateY(-1px); }
	.tag-bubble svg { color: #F57832; }
	.tag-bubble.empty { background: rgba(24,24,27,0.35); color: white; border: 1px dashed rgba(255,255,255,0.85); box-shadow: none; }
	.tag-bubble.empty svg { color: white; }
	.tag-bubble.empty:hover { background: rgba(24,24,27,0.55); }
	/* rating pill — bottom-right */
	.rate-wrap { position: absolute; right: 8px; bottom: 8px; }
	.rate-pill { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 100px; font-family: inherit; font-size: 12px; font-weight: 600; line-height: 1; cursor: pointer; backdrop-filter: blur(6px); border: 1px solid transparent; background: rgba(255,255,255,0.95); color: #18181B; box-shadow: 0 2px 8px rgba(0,0,0,0.15); transition: transform .12s ease; }
	.rate-pill:hover { transform: translateY(-1px); }
	.rate-pill.none { background: rgba(24,24,27,0.35); color: white; border: 1px dashed rgba(255,255,255,0.85); box-shadow: none; }
	.rate-pill.none:hover { background: rgba(24,24,27,0.55); }
	.dot { width: 7px; height: 7px; border-radius: 100px; background: currentColor; flex: none; }
	.rate-pill.good .dot, .rate-opt.good .dot { background: #16a34a; }
	.rate-pill.semi .dot, .rate-opt.semi .dot { background: #f59e0b; }
	.rate-pill.bad  .dot, .rate-opt.bad  .dot { background: #dc2626; }
	.rate-menu { position: absolute; right: 0; bottom: calc(100% + 6px); z-index: 10; min-width: 118px; padding: 4px; background: white; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.18); display: flex; flex-direction: column; }
	.rate-opt { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 10px; border: none; border-radius: 8px; background: none; font-family: inherit; font-size: 13px; font-weight: 500; color: #18181B; cursor: pointer; text-align: left; }
	.rate-opt:hover { background: #F4F4F5; }
	.rate-opt.sel { font-weight: 700; background: #FAFAFA; }
	.rate-opt.clear { color: #71717A; font-size: 12px; border-top: 1px solid #F4F4F5; border-radius: 0 0 8px 8px; margin-top: 2px; }
	/* video: native controls own the bottom edge — bubble goes top-left (below a Venue badge) */
	.is-video .tag-bubble { bottom: auto; top: 8px; }
	.is-video .ov-badge + .tag-bubble { top: 36px; }
	.is-video .rate-wrap { bottom: auto; top: 8px; right: 42px; }
	.is-video .rate-menu { bottom: auto; top: calc(100% + 6px); }
	.ptags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
	.ptag { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 100px; background: #FFF4ED; color: #c2551b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.ptag.on { font-size: 12px; padding: 3px 4px 3px 9px; }
	.ptag.on button { border: none; background: none; color: inherit; cursor: pointer; font-size: 11px; padding: 0 3px; }
	.tag-modal { max-width: 600px; }
	.tag-preview { background: #FAFAFA; border-radius: 10px; overflow: hidden; margin-bottom: 12px; }
	.tag-preview img, .tag-preview video { display: block; width: 100%; max-height: 300px; object-fit: contain; }
	.ptags.sel { margin: 0 0 12px; min-height: 22px; align-items: center; }
	.tag-search { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; font-family: inherit; }
	.tag-sec { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #71717A; margin: 14px 0 6px; }
	.save-state { margin-right: auto; align-self: center; }

	.contact-picks { display: flex; flex-direction: column; gap: 6px; }
	.contact-pick { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 10px; cursor: pointer; }
	.contact-pick input { width: auto; }
	.cp-name { font-weight: 600; }

	.log-table { width: 100%; border-collapse: collapse; font-size: 13px; }
	.log-table th { text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #A1A1AA; padding: 8px 10px; border-bottom: 1px solid var(--border); }
	.log-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); color: #18181B; }
	.log-table tbody tr:last-child td { border-bottom: none; }
	.cap { text-transform: capitalize; }

	.guru-rows { display: flex; flex-direction: column; gap: 8px; }
	.guru-row { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 10px; }
	.gr-avatar { width: 36px; height: 36px; border-radius: 50%; overflow: hidden; background: #F4F4F5; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #A1A1AA; font-size: 14px; }
	.gr-avatar img { width: 100%; height: 100%; object-fit: cover; }
	.gr-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
	.gr-name { font-weight: 600; font-size: 13px; }
	.gstatus { font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 100px; text-transform: capitalize; }
	.gstatus.invited { background: #FEF9C3; color: #a16207; }
	.gstatus.accepted { background: #F0FDF4; color: #16a34a; }
	.gstatus.declined { background: #FEF2F2; color: #dc2626; }
	.gstatus.confirmed { background: #DBEAFE; color: #1d4ed8; }
	.gr-actions { display: flex; align-items: center; gap: 6px; }
	.guru-add { margin-top: 14px; border-top: 1px dashed var(--border); padding-top: 14px; }
	.ga-title { font-size: 13px; font-weight: 700; color: #18181B; margin-bottom: 8px; }
	.ga-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
	.ga-pick { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; }
	.ga-pick input { width: auto; }

	/* People table (contacts + gurus) */
	.strong { font-weight: 600; }
	.card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
	.card-head .card-title { margin: 0; }
	.head-btns { display: flex; gap: 8px; }
	.btn.xs { padding: 4px 8px; font-size: 11px; }
	.people-table { width: 100%; border-collapse: collapse; font-size: 13px; }
	.people-table th { text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #A1A1AA; padding: 8px 10px; border-bottom: 1px solid var(--border); }
	.people-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
	.people-table tbody tr:last-child td { border-bottom: none; }
	.p-name { display: flex; align-items: center; gap: 10px; }
	.p-avatar { width: 30px; height: 30px; border-radius: 50%; overflow: hidden; background: #F4F4F5; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; color: #A1A1AA; flex-shrink: 0; }
	.p-avatar img { width: 100%; height: 100%; object-fit: cover; }
	.p-id { display: flex; flex-direction: column; min-width: 0; }
	/* All pills share identical metrics */
	.type-badge, .gstatus, .flow-pill { display: inline-block; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 100px; border: none; line-height: 1.35; text-transform: capitalize; }
	.type-badge.contact { background: #EEF2FF; color: #4338ca; }
	.type-badge.guru { background: #FCE7F3; color: #be185d; }
	.flow-pill { cursor: pointer; white-space: nowrap; font-family: inherit; }
	.flow-pill.on { background: #E9F7EC; color: #16a34a; }
	.flow-pill.off { background: #F4F4F5; color: #A1A1AA; }
	.actions-cell { text-align: right; }
	.p-actions { display: flex; gap: 6px; justify-content: flex-end; }

	/* Add-people modal */
	.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 50; }
	.modal { position: relative; background: white; border-radius: 16px; padding: 24px; max-width: 520px; width: 100%; max-height: 85vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
	.modal-x { position: absolute; top: 14px; right: 14px; width: 32px; height: 32px; border: none; background: #F4F4F5; border-radius: 8px; font-size: 15px; color: #52525B; cursor: pointer; }
	.modal-title { font-size: 18px; font-weight: 700; margin: 0 0 16px; padding-right: 40px; }
	.pick-list { display: flex; flex-direction: column; gap: 6px; }
	.pick { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; }
	.pick input { width: auto; }
	.modal-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
</style>
