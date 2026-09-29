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
					event_date: form.event_date, start_time: form.start_time, end_time: form.end_time,
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

	// ── Attached contacts ────────────────────────────────────────────────────────
	let contactIds = $state([...(data.event.contact_ids ?? [])]);
	$effect(() => { contactIds = [...(data.event.contact_ids ?? [])]; });

	async function toggleContact(id) {
		contactIds = contactIds.includes(id) ? contactIds.filter((c) => c !== id) : [...contactIds, id];
		const res = await fetch(`/api/events/${data.event.id}/contacts`, {
			method: 'PUT', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ contactIds })
		});
		if (!res.ok) { alert('Failed to save contacts'); await invalidateAll(); }
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

	// ── Share link ──────────────────────────────────────────────────────────────
	let copied = $state(false);
	function copyLink() {
		navigator.clipboard?.writeText(data.shareUrl);
		copied = true; setTimeout(() => (copied = false), 1500);
	}
	async function rotateToken() {
		if (!confirm('Generate a new venue link? The current link will stop working.')) return;
		await fetch(`/api/events/${data.event.id}/token`, { method: 'POST' });
		await invalidateAll();
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
				<label class="fld"><span>Date</span><input type="date" bind:value={form.event_date} /></label>
				<label class="fld"><span>Status</span>
					<select bind:value={form.status}>
						<option value="planned">Planned</option>
						<option value="confirmed">Confirmed</option>
						<option value="done">Done</option>
						<option value="cancelled">Cancelled</option>
					</select>
				</label>
				<label class="fld"><span>Start time</span><input type="time" bind:value={form.start_time} /></label>
				<label class="fld"><span>End time</span><input type="time" bind:value={form.end_time} /></label>
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
				<label class="fld"><span>Participants (expected)</span><input type="number" bind:value={form.participants_expected} /></label>
				<label class="fld"><span>Participants (actual)</span><input type="number" bind:value={form.participants_actual} /></label>
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

		<!-- Contacts for this event -->
		<div class="card">
			<h2 class="card-title">Contacts for this event <span class="muted">· for automated emails</span></h2>
			{#if !data.event.venue_id}
				<p class="empty">Pick a venue and save first — then its contacts appear here.</p>
			{:else if data.venueContacts.length === 0}
				<p class="empty">This venue has no contacts yet. Add them under <a href="/events/venues">Venues</a>.</p>
			{:else}
				<div class="contact-picks">
					{#each data.venueContacts as c (c.id)}
						<label class="contact-pick">
							<input type="checkbox" checked={contactIds.includes(c.id)} onchange={() => toggleContact(c.id)} />
							<span class="cp-name">{c.name || '—'}</span>
							{#if c.role}<span class="muted">· {c.role}</span>{/if}
							{#if c.email}<span class="muted">· {c.email}</span>{/if}
						</label>
					{/each}
				</div>
				<p class="hint">Checked contacts will receive the automated event emails (image & participant-count requests).</p>
			{/if}
		</div>

		<!-- Venue share link -->
		<div class="card">
			<h2 class="card-title">Venue share link</h2>
			<p class="hint">Send this link to the venue — no login needed. They can view product info & material and upload their own photos/video.</p>
			<div class="share-row">
				<input class="share-input" readonly value={data.shareUrl} />
				<button class="btn sm" onclick={copyLink}>{copied ? 'Copied ✓' : 'Copy'}</button>
				<a class="btn sm" href={data.shareUrl} target="_blank" rel="noopener">Open</a>
				<button class="btn sm danger" onclick={rotateToken}>New link</button>
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

{#snippet assetList(assets, showSource)}
	{#if assets.length === 0}
		<p class="empty">Nothing uploaded yet.</p>
	{:else}
		<div class="asset-grid">
			{#each assets as a (a.id)}
				<div class="asset">
					{#if a.kind === 'image'}
						<a href="/api/img/{a.r2_key}" target="_blank" rel="noopener"><img src="/api/img/{a.r2_key}" alt={a.filename} /></a>
					{:else if a.kind === 'video'}
						<video src="/api/img/{a.r2_key}" controls><track kind="captions" /></video>
					{:else}
						<a class="file-tile" href="/api/img/{a.r2_key}" target="_blank" rel="noopener">📄 {a.filename ?? 'file'}</a>
					{/if}
					<div class="asset-meta">
						<span class="asset-name" title={a.filename}>{a.filename ?? a.kind}</span>
						{#if showSource && a.source === 'venue'}<span class="tag venue">venue</span>{/if}
					</div>
					<button class="link-del asset-del" onclick={() => deleteAsset(a.id)}>✕</button>
				</div>
			{/each}
		</div>
	{/if}
{/snippet}

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; }
	main { flex: 1; max-width: 900px; margin: 0 auto; width: 100%; padding: 24px 28px 80px; }
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
	.fee { display: flex; gap: 6px; }
	.fee input { flex: 1; }
	.fee select { width: auto; }

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

	.asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; }
	.asset { position: relative; border: 1px solid var(--border); border-radius: 10px; padding: 8px; }
	.asset img, .asset video { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 6px; background: #FAFAFA; display: block; }
	.file-tile { display: flex; align-items: center; justify-content: center; text-align: center; aspect-ratio: 1; background: #FAFAFA; border-radius: 6px; font-size: 12px; color: #52525B; text-decoration: none; padding: 8px; }
	.asset-meta { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
	.asset-name { font-size: 11px; color: #71717A; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
	.tag { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 100px; }
	.tag.venue { background: #EEF2FF; color: #4338ca; }
	.asset-del { top: 4px; right: 4px; }

	.contact-picks { display: flex; flex-direction: column; gap: 6px; }
	.contact-pick { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 10px; cursor: pointer; }
	.contact-pick input { width: auto; }
	.cp-name { font-weight: 600; }

	.log-table { width: 100%; border-collapse: collapse; font-size: 13px; }
	.log-table th { text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #A1A1AA; padding: 8px 10px; border-bottom: 1px solid var(--border); }
	.log-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); color: #18181B; }
	.log-table tbody tr:last-child td { border-bottom: none; }
	.cap { text-transform: capitalize; }
</style>
