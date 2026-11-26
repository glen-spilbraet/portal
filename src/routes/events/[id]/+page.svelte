<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import TombolaCard from '$lib/components/events/TombolaCard.svelte';
	import { invalidateAll, goto } from '$app/navigation';
	import { TENDER_LANG_NAME } from '$lib/guruTender.js';

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
			inFlow: !!g.event_flow, status: g.status, image_key: g.image_key, proposalUrl: g.proposalUrl, rating: g.event_rating ?? null, note: g.event_note ?? '', opening_id: g.opening_id, sent_at: g.sent_at,
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
	/** optimistic per-event guru ratings while saving: guruId → 1–5 | null */
	let guruRateLocal = $state(/** @type {Record<string, number|null>} */ ({}));
	async function rateGuru(row, r) {
		const current = row.id in guruRateLocal ? guruRateLocal[row.id] : row.rating;
		const next = current === r ? null : r; // click the current star again to clear
		guruRateLocal = { ...guruRateLocal, [row.id]: next };
		const res = await fetch(`/api/events/${data.event.id}/gurus/${row.id}`, {
			method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: next })
		});
		if (!res.ok) alert('Failed to save rating');
		await invalidateAll();
		const { [row.id]: _, ...rest } = guruRateLocal; guruRateLocal = rest;
	}
	// ── Guru tender: openings + send ────────────────────────────────────────────
	const BOOKED = (st) => st === 'accepted' || st === 'confirmed';
	const openingById = $derived(Object.fromEntries(data.openings.map((o) => [o.id, o])));
	const bookedBy = $derived.by(() => {
		/** @type {Record<string, any[]>} */
		const m = {};
		for (const g of data.eventGurus) if (g.opening_id && BOOKED(g.status)) (m[g.opening_id] ??= []).push(g);
		return m;
	});
	const tenderStats = $derived.by(() => {
		const slots = data.openings.reduce((n, o) => n + o.slots, 0);
		const filled = data.openings.reduce((n, o) => n + Math.min(o.filled, o.slots), 0);
		const gs = data.eventGurus;
		return {
			slots, filled,
			invited: gs.length,
			booked: gs.filter((g) => BOOKED(g.status)).length,
			declined: gs.filter((g) => g.status === 'declined').length,
			waiting: gs.filter((g) => g.status === 'invited').length,
		};
	});
	let openingBusy = $state(false);
	async function api(url, method, body) {
		const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
		const out = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(out.message ?? 'Failed');
		return out;
	}
	async function addOpening() {
		openingBusy = true;
		try { await api(`/api/events/${data.event.id}/openings`, 'POST', { slots: 1 }); await invalidateAll(); }
		catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { openingBusy = false; }
	}
	async function patchOpening(o, patch) {
		try { await api(`/api/events/${data.event.id}/openings/${o.id}`, 'PUT', patch); await invalidateAll(); }
		catch (e) { alert(e instanceof Error ? e.message : String(e)); }
	}
	async function removeOpening(o) {
		if ((bookedBy[o.id]?.length ?? 0) > 0 && !confirm('Gurus are booked on this opening. Remove it anyway? They stay on the event.')) return;
		try { await api(`/api/events/${data.event.id}/openings/${o.id}`, 'DELETE'); await invalidateAll(); }
		catch (e) { alert(e instanceof Error ? e.message : String(e)); }
	}

	// Send-tender picker
	let tenderOpen = $state(false);
	let tenderPicks = $state(/** @type {string[]} */ ([]));
	let tenderQuery = $state('');
	let tenderSending = $state(false);
	let tenderResult = $state('');
	const eventGuruById = $derived(Object.fromEntries(data.eventGurus.map((g) => [g.id, g])));
	const tenderCandidates = $derived.by(() => {
		const q = tenderQuery.trim().toLowerCase();
		return data.gurus
			.filter((g) => g.active !== 0)
			.filter((g) => !q || `${g.name} ${g.city ?? ''} ${g.zip ?? ''} ${g.country ?? ''}`.toLowerCase().includes(q));
	});
	const pickable = (g) => !!g.email && !BOOKED(eventGuruById[g.id]?.status);
	function openTender() {
		tenderQuery = ''; tenderResult = '';
		tenderPicks = [];
		tenderOpen = true;
	}
	function toggleTenderPick(id) { tenderPicks = tenderPicks.includes(id) ? tenderPicks.filter((x) => x !== id) : [...tenderPicks, id]; }
	function pickAllNew() {
		const ids = tenderCandidates.filter((g) => pickable(g) && !eventGuruById[g.id]).map((g) => g.id);
		tenderPicks = [...new Set([...tenderPicks, ...ids])];
	}
	async function sendTender() {
		if (!tenderPicks.length || tenderSending) return;
		tenderSending = true;
		try {
			const out = await api(`/api/events/${data.event.id}/tender`, 'POST', { guruIds: tenderPicks });
			await invalidateAll();
			tenderOpen = false;
			const skip = (out.skipped ?? []).map((x) => `${x.name ?? x.id} (${x.reason})`);
			tenderResult = `Sent to ${out.sent} guru${out.sent === 1 ? '' : 's'}` + (skip.length ? ` · skipped: ${skip.join(', ')}` : '');
			setTimeout(() => (tenderResult = ''), 8000);
		} catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { tenderSending = false; }
	}
	function ago(ts) {
		if (!ts) return '';
		const d = (Date.now() - new Date(ts.replace(' ', 'T') + 'Z').getTime()) / 86400000;
		return d < 1 ? 'today' : d < 2 ? 'yesterday' : `${Math.floor(d)} days ago`;
	}

	// Per-event internal note on a guru (icon next to the stars; popover to view/edit)
	let noteOpen = $state(/** @type {string|null} */ (null));
	let noteDraft = $state('');
	let noteSaving = $state(false);
	function openNote(row) { noteOpen = noteOpen === row.id ? null : row.id; noteDraft = row.note ?? ''; }
	async function saveNote(row) {
		noteSaving = true;
		try {
			const res = await fetch(`/api/events/${data.event.id}/gurus/${row.id}`, {
				method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: noteDraft })
			});
			if (!res.ok) throw new Error('Failed to save note');
			await invalidateAll();
			noteOpen = null;
		} catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { noteSaving = false; }
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

	// Thumbnails come from the image CDN (WebP, made once and stored); originals only on demand.
	const cdn = (key, w) => `https://img.spilbraet.dk/${key}?w=${w}`;
	const original = (key) => `/api/img/${key}`;

	const media = $derived(data.event.assets.filter((a) => a.category === 'media'));
	const marketing = $derived(data.event.assets.filter((a) => a.category === 'marketing'));

	// ── Photo viewer (big photo + rating/tag pane) ──────────────────────────────
	let viewId = $state(/** @type {string|null} */ (null));
	const viewable = $derived(media.filter((a) => a.kind === 'image' || a.kind === 'video'));
	const viewIndex = $derived(viewable.findIndex((a) => a.id === viewId));
	/** the asset open in the viewer (kept fresh across invalidateAll) */
	const tagAsset = $derived(viewIndex >= 0 ? viewable[viewIndex] : null);
	/** @type {string[]} */
	let tagSkus = $state([]);
	let tagQuery = $state('');
	/** @type {{sku:string,name:string}[]} */
	let tagOthers = $state([]);
	let tagSaving = $state(false);
	/** @type {any} */
	let tagTimer;

	function openViewer(a) { viewId = a.id; tagSkus = [...(a.skus ?? [])]; tagQuery = ''; tagOthers = []; rateOpen = null; }
	function closeViewer() { viewId = null; }
	function step(delta) {
		const next = viewable[viewIndex + delta];
		if (next) openViewer(next);
	}
	function viewerKeys(e) {
		if (!viewId) return;
		const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
		if (e.key === 'Escape') closeViewer();
		else if (!typing && e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
		else if (!typing && e.key === 'ArrowRight') { e.preventDefault(); step(1); }
	}
	async function deleteFromViewer(a) {
		if (!confirm('Delete this file?')) return;
		const next = viewable[viewIndex + 1] ?? viewable[viewIndex - 1] ?? null;
		await fetch(`/api/events/assets/${a.id}`, { method: 'DELETE' });
		if (next) openViewer(next); else closeViewer();
		await invalidateAll();
	}

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


	function fmtLog(ts) {
		if (!ts) return '';
		try { return new Date(ts.replace(' ', 'T') + 'Z').toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
		catch { return ts; }
	}
	// ── Header + section summaries ──────────────────────────────────────────────
	const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	function dparts(d) {
		const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? '');
		return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
	}
	function fmtWhen(e) {
		const a = dparts(e.event_date);
		if (!a) return '';
		const b = e.end_date && e.end_date !== e.event_date ? dparts(e.end_date) : null;
		let out;
		if (!b) out = `${a.d} ${MON[a.m]} ${a.y}`;
		else if (a.y !== b.y) out = `${a.d} ${MON[a.m]} ${a.y} – ${b.d} ${MON[b.m]} ${b.y}`;
		else if (a.m !== b.m) out = `${a.d} ${MON[a.m]} – ${b.d} ${MON[b.m]} ${b.y}`;
		else out = `${a.d}–${b.d} ${MON[a.m]} ${a.y}`;
		const t = [e.start_time, e.end_time].filter(Boolean).join('–');
		return t ? `${out}, ${t}` : out;
	}
	const venueName = $derived(data.venues.find((v) => v.id === form.venue_id)?.name ?? '');
	const typeName = $derived(data.types.find((t) => t.id === form.type_id)?.name ?? '');
	const boxImg = (p) => p.images?.box || p.images?.flat || null;
	const peopleSummary = $derived.by(() => {
		const c = people.filter((p) => p.kind === 'contact').length;
		const g = people.filter((p) => p.kind === 'guru').length;
		const mail = people.filter((p) => p.inFlow).length;
		return [c && `${c} contact${c > 1 ? 's' : ''}`, g && `${g} guru${g > 1 ? 's' : ''}`, `${mail} get${mail === 1 ? 's' : ''} mail`].filter(Boolean).join(' · ');
	});
	const tombolaWinners = $derived(data.tombolaEntries.filter((e) => e.won_at).length);
	function ratingCounts(list) {
		const out = { good: 0, semi: 0, bad: 0 };
		for (const a of list) if (a.rating && a.rating in out) out[a.rating]++;
		return out;
	}

	// ── Collapsible sections (remembered per browser) ───────────────────────────
	const SECTIONS = ['products', 'tender', 'people', 'tombola', 'marketing', 'media', 'log'];
	const LS_KEY = 'events.detail.collapsed';
	let collapsed = $state(/** @type {Record<string, boolean>} */ ({ log: true }));
	$effect(() => {
		try { const v = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null'); if (v && typeof v === 'object') collapsed = v; } catch {}
	});
	function persist() { try { localStorage.setItem(LS_KEY, JSON.stringify(collapsed)); } catch {} }
	function toggleSec(key) { collapsed = { ...collapsed, [key]: !collapsed[key] }; persist(); }
	const allOpen = $derived(SECTIONS.every((k) => !collapsed[k]));
	function toggleAll() {
		const close = allOpen;
		collapsed = Object.fromEntries(SECTIONS.map((k) => [k, close]));
		persist();
	}
</script>

<svelte:head><title>{form.title || 'Event'} — Product Portal</title></svelte:head>

<div class="page">
	<AppNav active="events" user={data.user} />

	<main>
		<div class="page-header">
			<div class="head-main">
				<a class="back-link" href="/events">← Events</a>
				<div class="ev-title-row">
					<h1 class="ev-title" title={form.title}>{form.title || 'Untitled event'}</h1>
					<span class="status {form.status}">{form.status}</span>
				</div>
				<div class="ev-meta">
					{#each [fmtWhen(form), venueName, typeName].filter(Boolean) as m, i}{#if i}<span class="dotsep">·</span>{/if}<span>{m}</span>{/each}
				</div>
			</div>
			<div class="header-actions">
				{#if savedFlash}<span class="flash">Saved ✓</span>{/if}
				<button class="btn ghost" onclick={toggleAll}>{allOpen ? 'Collapse all' : 'Expand all'}</button>
				<button class="btn danger" onclick={removeEvent}>Delete</button>
				<button class="btn primary" onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
			</div>
		</div>

		<div class="layout">
			<!-- Left: details -->
			<aside class="left">
				<div class="card">
					<h2 class="card-title">Details</h2>
					<div class="form-grid">
						<label class="fld span2"><span>Title</span><input bind:value={form.title} /></label>
						<label class="fld span2"><span>Venue</span>
							<select bind:value={form.venue_id}>
								<option value={null}>—</option>
								{#each data.venues as v}<option value={v.id}>{v.name}</option>{/each}
							</select>
						</label>
						<label class="fld span2"><span>Type</span>
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
								<div class="seg"><small>{form.end_date ? 'Start date' : 'Date'}</small><input type="date" bind:value={form.event_date} /></div>
								{#if !!form.end_date}
									<div class="seg"><small>End date</small><input type="date" min={form.event_date || undefined} bind:value={form.end_date} /></div>
								{/if}
							</div>
							<div class="combo">
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
								<div class="seg"><small>Expected</small><input type="number" min="0" placeholder="—" bind:value={form.participants_expected} /></div>
								<div class="seg"><small>Attended</small><input type="number" min="0" placeholder="—" bind:value={form.participants_actual} /></div>
							</div>
						</div>
						<label class="fld span2"><span>Notes</span><textarea rows="3" bind:value={form.notes}></textarea></label>
					</div>
				</div>

				<div class="card">
					<h2 class="card-title">Venue share link <span class="info" title="Send this link to the venue — no login needed. They can view product info & material and upload their own photos/video.">ⓘ</span></h2>
					<input class="share-input" readonly value={data.shareUrl} onfocus={(e) => e.currentTarget.select()} />
					<div class="share-btns">
						<button class="btn sm" onclick={copyLink}>{copied ? 'Copied ✓' : 'Copy link'}</button>
						<a class="btn sm" href={data.shareUrl} target="_blank" rel="noopener">Open ↗</a>
					</div>
				</div>
			</aside>

			<!-- Right: collapsible sections -->
			<div class="right">
				{#snippet productsSum()}
					{#if data.products.length === 0}<span class="sum-empty">None yet</span>
					{:else}
						<span class="thumbs">
							{#each data.products.slice(0, 8) as p (p.sku)}<span class="mini contain" title="{p.name} · {p.sku}">{#if boxImg(p)}<img src={boxImg(p)} alt="" />{/if}</span>{/each}
						</span>
						{#if data.products.length > 8}<span class="sum-txt">+{data.products.length - 8}</span>{/if}
					{/if}
				{/snippet}
				{#snippet productsActions()}
					<div class="sku-search">
						<input placeholder="Add product…" bind:value={skuQuery} oninput={searchSku} />
						{#if skuResults.length > 0}
							<div class="sku-dropdown">
								{#each skuResults as r}
									<button class="sku-opt" onclick={() => addSku(r.sku)}><b>{r.sku}</b> {r.name}</button>
								{/each}
							</div>
						{/if}
					</div>
				{/snippet}
				{#snippet productsBody()}
					{#if data.products.length === 0}
						<p class="empty">No products selected yet.</p>
					{:else}
						<div class="prod-grid">
							{#each data.products as p (p.sku)}
								<div class="prod">
									<div class="prod-thumb">
										{#if boxImg(p)}<img src={boxImg(p)} alt={p.name} loading="lazy" />{/if}
									</div>
									<div class="prod-info">
										<span class="prod-name" title={p.name}>{p.name}</span>
										<span class="muted">{p.sku}</span>
									</div>
									<button class="link-del" onclick={() => removeSku(p.sku)} aria-label="Remove {p.sku}">✕</button>
								</div>
							{/each}
						</div>
					{/if}
				{/snippet}
				{@render section('products', 'Products', data.products.length, 'Selected products are shown to the venue automatically on the share page (with any award/nominee badges).', productsSum, productsActions, productsBody)}

				{#snippet tenderSum()}
					{#if data.openings.length === 0 && tenderStats.invited === 0}<span class="sum-empty">No openings</span>
					{:else}
						{#if tenderStats.slots}
							<span class="t-bar" title="{tenderStats.filled} of {tenderStats.slots} spots filled"><span style="width:{(tenderStats.filled / tenderStats.slots) * 100}%"></span></span>
							<span class="sum-txt"><b>{tenderStats.filled}/{tenderStats.slots}</b> filled</span>
						{/if}
						{#if tenderStats.invited}<span class="sum-txt">· {tenderStats.invited} invited · {tenderStats.waiting} waiting · {tenderStats.declined} declined</span>{/if}
					{/if}
				{/snippet}
				{#snippet tenderActions()}
					<button class="btn sm primary" onclick={openTender}>Send tender…</button>
				{/snippet}
				{#snippet tenderBody()}
					{#if tenderResult}<div class="t-flash">{tenderResult}</div>{/if}
					{#if data.openings.length === 0}
						<p class="empty">No openings — invited gurus just answer yes or no.</p>
					{:else}
						<div class="openings">
							{#each data.openings as o (o.id)}
								{@const booked = bookedBy[o.id] ?? []}
								<div class="op-row">
									<input class="op-label" value={o.label ?? ''} placeholder="Any game type (e.g. Strategi)" onchange={(e) => patchOpening(o, { label: e.currentTarget.value })} />
									<div class="stepper" role="group" aria-label="Gurus needed">
										<button onclick={() => patchOpening(o, { slots: o.slots - 1 })} disabled={o.slots <= 1} aria-label="Fewer">−</button>
										<span>{o.slots}</span>
										<button onclick={() => patchOpening(o, { slots: o.slots + 1 })} aria-label="More">+</button>
									</div>
									<div class="op-fill">
										<span class="op-dots">{#each Array(o.slots) as _, i}<span class="op-dot" class:on={i < o.filled}></span>{/each}</span>
										<span class="op-names" title={booked.map((g) => g.name).join(', ')}>{booked.length ? booked.map((g) => g.name.split(' ')[0]).join(', ') : 'Open'}</span>
									</div>
									<button class="op-del" onclick={() => removeOpening(o)} aria-label="Remove opening">✕</button>
								</div>
							{/each}
						</div>
					{/if}
					<div class="t-foot">
						<button class="btn sm" onclick={addOpening} disabled={openingBusy}>+ Add opening</button>
						{#if tenderStats.invited}
							<span class="t-chips">
								<span class="t-chip">{tenderStats.invited} invited</span>
								<span class="t-chip ok">{tenderStats.booked} booked</span>
								<span class="t-chip">{tenderStats.waiting} waiting</span>
								<span class="t-chip no">{tenderStats.declined} declined</span>
							</span>
						{/if}
					</div>
				{/snippet}
				{@render section('tender', 'Guru tender', data.openings.length ? `${tenderStats.filled}/${tenderStats.slots}` : null, 'Add openings (e.g. 2 × Strategi, 1 × Familie) and send the tender: each guru gets an e-mail with a personal link and takes a free spot — first come, first served. The language follows the venue country.', tenderSum, tenderActions, tenderBody)}

				{#snippet peopleSum()}
					{#if people.length === 0}<span class="sum-empty">No one added</span>
					{:else}
						<span class="avatars">
							{#each people.slice(0, 6) as row (row.kind + row.id)}
								<span class="av {row.kind}" title="{row.name} · {row.kind === 'guru' ? 'Guru' : 'Contact'}">{#if row.kind === 'guru' && row.image_key}<img src="/api/img/{row.image_key}" alt="" />{:else}{row.name?.[0]?.toUpperCase() ?? '?'}{/if}</span>
							{/each}
						</span>
						<span class="sum-txt">{peopleSummary}</span>
					{/if}
				{/snippet}
				{#snippet peopleActions()}
					<button class="btn sm" onclick={() => openAdd('contact')}>+ Contact</button>
					<button class="btn sm" onclick={() => openAdd('guru')}>+ Guru</button>
				{/snippet}
				{#snippet peopleBody()}
					{#if people.length === 0}
						<p class="empty">No one added yet.</p>
					{:else}
						<table class="people-table">
							<thead><tr><th>Name</th><th>Type</th><th>Emails</th><th>Status</th><th>Rating</th><th></th></tr></thead>
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
										<td>{#if row.kind === 'guru'}<span class="gstatus {row.status}">{row.status}</span>{#if row.opening_id && openingById[row.opening_id]}<span class="muted op-lbl"> · {openingById[row.opening_id].label || 'Guru'}</span>{/if}{:else}<span class="muted">—</span>{/if}</td>
										<td>
											{#if row.kind === 'guru'}
												{@const rv = row.id in guruRateLocal ? guruRateLocal[row.id] : row.rating}
												<div class="stars" role="radiogroup" aria-label="Rate {row.name} for this event">
													{#each [1, 2, 3, 4, 5] as n}
														<button class="star" class:on={(rv ?? 0) >= n} role="radio" aria-checked={rv === n} aria-label="{n} star{n > 1 ? 's' : ''}" title={rv === n ? 'Click again to clear' : `${n} / 5`} onclick={() => rateGuru(row, n)}>★</button>
													{/each}
												</div>
												<span class="note-wrap">
													<button class="note-btn" class:has={!!row.note} onclick={(e) => { e.stopPropagation(); openNote(row); }} aria-label={row.note ? 'View/edit note' : 'Add note'} title={row.note ? 'View/edit note' : 'Add note'} aria-expanded={noteOpen === row.id}>
														<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M2.5 3.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H7l-3 2.5v-2.5h-.5a1 1 0 0 1-1-1Z" fill={row.note ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
													</button>
													{#if noteOpen === row.id}
														<div class="note-pop" role="dialog" aria-label="Note on {row.name}" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => { if (e.key === 'Escape') noteOpen = null; if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNote(row); }}>
															<!-- svelte-ignore a11y_autofocus -->
															<textarea rows="4" bind:value={noteDraft} placeholder="Note on {row.name} at this event…" autofocus></textarea>
															<div class="note-foot">
																<button class="btn xs" onclick={() => (noteOpen = null)}>Cancel</button>
																<button class="btn xs primary" onclick={() => saveNote(row)} disabled={noteSaving || noteDraft.trim() === (row.note ?? '').trim()}>{noteSaving ? 'Saving…' : 'Save'}</button>
															</div>
														</div>
													{/if}
												</span>
											{/if}
										</td>
										<td class="actions-cell">
											<div class="p-actions">
												{#if row.kind === 'guru'}
													<button class="btn xs" onclick={() => copyProposal(row)}>{copiedGuru === row.id ? 'Copied ✓' : 'Invite'}</button>
													{#if row.status !== 'confirmed'}<button class="btn xs" onclick={() => setGuruStatus(row.id, 'confirmed')}>Confirm</button>{/if}
												{/if}
												<button class="btn xs danger" onclick={() => removePerson(row)} aria-label="Remove {row.name}">✕</button>
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				{/snippet}
				{@render section('people', 'People', people.length, 'Contacts from the venue and gurus.', peopleSum, peopleActions, peopleBody)}

				{#snippet tombolaSum()}
					{#if !data.tombola}<span class="sum-empty">Not set up</span>
					{:else}
						<span class="pill-sm" class:open={data.tombola.status === 'open'}>{data.tombola.status === 'open' ? 'Open' : 'Closed'}</span>
						<span class="sum-txt"><b>{data.tombolaEntries.length}</b> participants · <b>{tombolaWinners}</b> winners · <b>{data.tombolaShoutouts.length}</b> shoutouts</span>
					{/if}
				{/snippet}
				{#snippet tombolaBody()}
					<TombolaCard bare eventId={data.event.id} tombola={data.tombola} entries={data.tombolaEntries} shoutouts={data.tombolaShoutouts} />
				{/snippet}
				{@render section('tombola', 'Tombola', null, 'QR sign-up, big screen & prize draw. Participants are kept permanently — re-opening the board later picks up everyone who already joined. The same person can only win once.', tombolaSum, null, tombolaBody)}

				{#snippet marketingSum()}{@render assetSum(marketing, false)}{/snippet}
				{#snippet marketingActions()}
					<label class="btn sm upload">{uploading ? 'Uploading…' : '+ Upload'}<input type="file" hidden multiple onchange={(e) => upload(e, 'marketing')} disabled={uploading} /></label>
				{/snippet}
				{#snippet marketingBody()}{@render assetList(marketing, false)}{/snippet}
				{@render section('marketing', 'Marketing material', marketing.length, 'Shared with the venue on the share page.', marketingSum, marketingActions, marketingBody)}

				{#snippet mediaSum()}{@render assetSum(media, true)}{/snippet}
				{#snippet mediaActions()}
					<label class="btn sm upload">{uploading ? 'Uploading…' : '+ Upload'}<input type="file" hidden multiple accept="image/*,video/*" onchange={(e) => upload(e, 'media')} disabled={uploading} /></label>
				{/snippet}
				{#snippet mediaBody()}{@render assetList(media, true)}{/snippet}
				{@render section('media', 'Photos & video', media.length, 'Ours and the venue’s. Tag products and rate each photo.', mediaSum, mediaActions, mediaBody)}

				{#if data.participantLog.length > 0}
					{#snippet logSum()}
						<span class="sum-txt">Last: {fmtLog(data.participantLog[0].created_at)} · {data.participantLog[0].field} {data.participantLog[0].old_value ?? '—'} → <b>{data.participantLog[0].new_value ?? '—'}</b></span>
					{/snippet}
					{#snippet logBody()}
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
					{/snippet}
					{@render section('log', 'Participant change log', data.participantLog.length, null, logSum, null, logBody)}
				{/if}
			</div>
		</div>
	</main>
</div>

{#snippet section(key, title, count, info, summary, actions, body)}
	{@const open = !collapsed[key]}
	<section class="sec" class:open>
		<div class="sec-head">
			<button class="sec-toggle" onclick={() => toggleSec(key)} aria-expanded={open}>
				<svg class="chev" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
				<span class="sec-title">{title}</span>
				{#if count != null}<span class="sec-count">{count}</span>{/if}
			</button>
			{#if info}<span class="info" title={info}>ⓘ</span>{/if}
			{#if !open}<button class="sec-sum" onclick={() => toggleSec(key)} tabindex="-1">{@render summary()}</button>{:else}<span class="sec-spacer"></span>{/if}
			{#if actions}<div class="sec-actions">{@render actions()}</div>{/if}
		</div>
		{#if open}<div class="sec-body">{@render body()}</div>{/if}
	</section>
{/snippet}

{#snippet assetSum(assets, isMedia)}
	{#if assets.length === 0}<span class="sum-empty">Nothing uploaded</span>
	{:else}
		{@const imgs = assets.filter((a) => a.kind === 'image')}
		<span class="thumbs">
			{#each assets.slice(0, 8) as a (a.id)}
				<span class="mini" title={a.filename}>{#if a.kind === 'image'}<img src={cdn(a.r2_key, 300)} alt="" loading="lazy" />{:else if a.kind === 'video'}▶{:else}📄{/if}</span>
			{/each}
		</span>
		{#if assets.length > 8}<span class="sum-txt">+{assets.length - 8}</span>{/if}
		{#if isMedia}
			{@const rc = ratingCounts(assets)}
			{@const untagged = imgs.filter((a) => !(a.skus?.length)).length}
			{#if rc.good}<span class="rc good" title="Good">{rc.good}</span>{/if}
			{#if rc.semi}<span class="rc semi" title="Semi">{rc.semi}</span>{/if}
			{#if rc.bad}<span class="rc bad" title="Bad">{rc.bad}</span>{/if}
			{#if untagged}<span class="sum-txt">· {untagged} untagged</span>{/if}
		{/if}
	{/if}
{/snippet}

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

{#if tenderOpen}
	<div class="modal-overlay" onclick={() => (tenderOpen = false)} role="presentation">
		<div class="modal tender-modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Send tender">
			<button class="modal-x" onclick={() => (tenderOpen = false)} aria-label="Close">✕</button>
			<h3 class="modal-title">Send tender</h3>
			<div class="tm-bar">
				<input class="tm-search" placeholder="Filter by name, city or zip…" bind:value={tenderQuery} />
				<button class="btn sm" onclick={pickAllNew}>Select all not invited</button>
			</div>
			<div class="tm-list">
				{#each tenderCandidates as g (g.id)}
					{@const eg = eventGuruById[g.id]}
					{@const ok = pickable(g)}
					<label class="tm-row" class:off={!ok} class:on={tenderPicks.includes(g.id)}>
						<input type="checkbox" checked={tenderPicks.includes(g.id)} disabled={!ok} onchange={() => toggleTenderPick(g.id)} />
						<span class="p-avatar">{#if g.image_key}<img src="/api/img/{g.image_key}" alt="" />{:else}{g.name?.[0]?.toUpperCase() ?? '?'}{/if}</span>
						<span class="tm-id">
							<span class="strong">{g.name}</span>
							<span class="muted">{[[g.zip, g.city].filter(Boolean).join(' '), g.country].filter(Boolean).join(', ') || '—'}</span>
						</span>
						<span class="tm-rate">{#if g.rating_count}★ {g.rating_avg.toFixed(1)}{/if}</span>
						<span class="tm-state">
							{#if !g.email}<span class="t-chip no">No e-mail</span>
							{:else if eg && BOOKED(eg.status)}<span class="t-chip ok">Booked{eg.opening_id && openingById[eg.opening_id] ? ` · ${openingById[eg.opening_id].label || 'Guru'}` : ''}</span>
							{:else if eg?.status === 'declined'}<span class="t-chip no">Declined</span>
							{:else if eg?.sent_at}<span class="t-chip">Sent {ago(eg.sent_at)}</span>
							{:else if eg}<span class="t-chip">On event</span>{/if}
						</span>
					</label>
				{:else}
					<p class="empty">No gurus match.</p>
				{/each}
			</div>
			<div class="modal-foot tm-foot">
				<span class="muted">E-mail in {TENDER_LANG_NAME[data.tenderLang]} · from you</span>
				<button class="btn" onclick={() => (tenderOpen = false)}>Cancel</button>
				<button class="btn primary" onclick={sendTender} disabled={tenderSending || tenderPicks.length === 0}>{tenderSending ? 'Sending…' : `Send to ${tenderPicks.length || ''}`}</button>
			</div>
		</div>
	</div>
{/if}

<svelte:window onkeydown={(e) => { viewerKeys(e); if (e.key === 'Escape') { closeAdd(); rateOpen = null; tenderOpen = false; } }} onclick={() => { rateOpen = null; noteOpen = null; }} />

{#if tagAsset}
	{@const r = tagAsset.id in rateLocal ? rateLocal[tagAsset.id] : tagAsset.rating}
	<div class="viewer" role="dialog" aria-modal="true" aria-label="Photo viewer">
		<div class="stage" onclick={closeViewer} role="presentation">
			{#key tagAsset.id}
				{#if tagAsset.kind === 'image'}
					<img
						class="stage-media" src={cdn(tagAsset.r2_key, 1600)} alt={tagAsset.filename}
						style="background-image:url({cdn(tagAsset.r2_key, 600)})"
						onclick={(e) => e.stopPropagation()} role="presentation"
					/>
				{:else}
					<!-- svelte-ignore a11y_media_has_caption -->
					<video class="stage-media" src={original(tagAsset.r2_key)} controls autoplay onclick={(e) => e.stopPropagation()}></video>
				{/if}
			{/key}
			{#if viewIndex > 0}<button class="nav prev" onclick={(e) => { e.stopPropagation(); step(-1); }} aria-label="Previous">‹</button>{/if}
			{#if viewIndex < viewable.length - 1}<button class="nav next" onclick={(e) => { e.stopPropagation(); step(1); }} aria-label="Next">›</button>{/if}
			<span class="counter">{viewIndex + 1} / {viewable.length}</span>
		</div>

		<aside class="pane">
			<div class="pane-head">
				<div class="pane-title">
					<span class="pane-name" title={tagAsset.filename}>{tagAsset.filename ?? tagAsset.kind}</span>
					{#if tagAsset.source === 'venue'}<span class="pill-venue">Venue</span>{/if}
				</div>
				<button class="pane-x" onclick={closeViewer} aria-label="Close">✕</button>
			</div>

			<div class="pane-body">
				<div class="pane-sec">Rating</div>
				<div class="seg" role="radiogroup" aria-label="Rating">
					{#each RATINGS as opt (opt.v)}
						<button role="radio" aria-checked={r === opt.v} class="seg-btn {opt.v}" class:sel={r === opt.v} onclick={() => setRating(tagAsset, opt.v)}>
							<span class="dot"></span>{opt.label}
						</button>
					{/each}
				</div>

				<div class="pane-sec">Products <span class="muted">{tagSkus.length || ''}</span></div>
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
							<label class="pick" class:on={tagSkus.includes(p.sku)}><input type="checkbox" checked={tagSkus.includes(p.sku)} onchange={() => toggleTag(p.sku)} disabled={tagSaving} /> <span class="pick-txt"><span class="strong">{p.name}</span> <span class="muted">{p.sku}</span></span></label>
						{/each}
					</div>
				{/if}

				{#if tagQuery.trim().length >= 2}
					<div class="tag-sec">All sheets <span class="muted">· also adds it to the event</span></div>
					{#if tagOthers.length === 0}
						<p class="empty">No other products match.</p>
					{:else}
						<div class="pick-list">
							{#each tagOthers as o (o.sku)}
								<label class="pick" class:on={tagSkus.includes(o.sku)}><input type="checkbox" checked={tagSkus.includes(o.sku)} onchange={() => toggleTag(o.sku)} disabled={tagSaving} /> <span class="pick-txt"><span class="strong">{o.name}</span> <span class="muted">{o.sku}</span></span></label>
							{/each}
						</div>
					{/if}
				{/if}
			</div>

			<div class="pane-foot">
				<span class="muted">{tagSaving ? 'Saving…' : 'Saved automatically'}</span>
				<a class="btn sm" href={original(tagAsset.r2_key)} target="_blank" rel="noopener">Original ↗</a>
				<button class="btn sm danger" onclick={() => deleteFromViewer(tagAsset)}>Delete</button>
			</div>
		</aside>
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
						<a class="thumb" href={original(a.r2_key)} target="_blank" rel="noopener"
							onclick={(e) => { if (taggable && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); openViewer(a); } }}
						><img src={cdn(a.r2_key, 600)} alt={a.filename} loading="lazy" decoding="async" /></a>
					{:else if a.kind === 'video'}
						<video class="thumb" src={original(a.r2_key)} controls preload="metadata"><track kind="captions" /></video>
					{:else}
						<a class="thumb file-tile" href={original(a.r2_key)} target="_blank" rel="noopener"><span>📄</span><span class="file-name">{a.filename ?? 'file'}</span></a>
					{/if}

					{#if showSource && a.source === 'venue'}<span class="ov-badge">Venue</span>{/if}

					{#if taggable}
						<button
							class="tag-bubble" class:empty={n === 0}
							onclick={() => openViewer(a)}
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
	main { flex: 1; width: 100%; padding: 20px 28px 80px; box-sizing: border-box; }
	.page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
	.head-main { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
	.back-link { font-size: 12px; font-weight: 600; color: #71717A; text-decoration: none; }
	.back-link:hover { color: #18181B; }
	.ev-title-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
	.ev-title { font-size: 20px; font-weight: 700; color: #18181B; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.ev-meta { font-size: 13px; color: #71717A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.dotsep { margin: 0 6px; color: #D4D4D8; }
	.header-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
	.flash { font-size: 12px; color: #16a34a; font-weight: 600; }
	.btn.ghost { border-color: transparent; background: transparent; color: #71717A; }
	.btn.ghost:hover { color: #18181B; background: #F4F4F5; }

	.status { font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 100px; text-transform: capitalize; flex-shrink: 0; }
	.status.planned { background: #FEF9C3; color: #a16207; }
	.status.confirmed { background: #DBEAFE; color: #1d4ed8; }
	.status.done { background: #F0FDF4; color: #16a34a; }
	.status.cancelled { background: #FEF2F2; color: #dc2626; }

	/* Two panes: sticky details on the left, collapsible sections on the right */
	.layout { display: grid; grid-template-columns: 380px minmax(0, 1fr); gap: 20px; align-items: start; }
	.left { position: sticky; top: 16px; max-height: calc(100vh - 32px); overflow-y: auto; }
	.left .card { margin-bottom: 14px; }
	.right { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
	@media (max-width: 1000px) {
		.layout { grid-template-columns: 1fr; }
		.left { position: static; max-height: none; overflow: visible; }
	}

	.sec { background: white; border: 1px solid var(--border); border-radius: 14px; }
	.sec-head { display: flex; align-items: center; gap: 10px; padding: 10px 14px 10px 10px; min-height: 52px; box-sizing: border-box; }
	.sec-toggle { display: inline-flex; align-items: center; gap: 8px; border: none; background: none; padding: 6px; border-radius: 8px; font-family: inherit; cursor: pointer; flex-shrink: 0; }
	.sec-toggle:hover { background: #F4F4F5; }
	.chev { color: #A1A1AA; transition: transform .15s ease; }
	.sec.open .chev { transform: rotate(90deg); }
	.sec-title { font-size: 14px; font-weight: 700; color: #18181B; white-space: nowrap; }
	.sec-count { font-size: 11px; font-weight: 700; color: #71717A; background: #F4F4F5; border-radius: 100px; padding: 1px 8px; }
	.sec-sum { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; border: none; background: none; padding: 0; font-family: inherit; cursor: pointer; text-align: left; overflow: hidden; white-space: nowrap; }
	.sec-spacer { flex: 1; }
	.sec-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
	.sec-body { padding: 4px 18px 18px; border-top: 1px solid #F4F4F5; padding-top: 16px; }
	.info { font-size: 13px; color: #A1A1AA; cursor: help; font-weight: 500; }
	.sum-empty { font-size: 12.5px; color: #A1A1AA; }
	.sum-txt { font-size: 12.5px; color: #52525B; overflow: hidden; text-overflow: ellipsis; }
	.sum-txt b { color: #18181B; }
	.thumbs { display: inline-flex; gap: 4px; flex-shrink: 0; }
	.mini { width: 30px; height: 30px; border-radius: 6px; overflow: hidden; background: #F4F4F5; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; color: #71717A; }
	.mini img { width: 100%; height: 100%; object-fit: cover; }
	.mini.contain img { object-fit: contain; }
	.avatars { display: inline-flex; flex-shrink: 0; }
	.av { width: 26px; height: 26px; border-radius: 50%; border: 2px solid white; margin-left: -6px; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; }
	.av:first-child { margin-left: 0; }
	.av.contact { background: #EEF2FF; color: #4338ca; }
	.av.guru { background: #FCE7F3; color: #be185d; }
	.av img { width: 100%; height: 100%; object-fit: cover; }
	.pill-sm { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 100px; background: #F4F4F5; color: #71717A; flex-shrink: 0; }
	.pill-sm.open { background: #DCFCE7; color: #15803D; }
	.rc { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; color: #52525B; flex-shrink: 0; }
	.rc::before { content: ''; width: 7px; height: 7px; border-radius: 50%; }
	.rc.good::before { background: #16a34a; } .rc.semi::before { background: #f59e0b; } .rc.bad::before { background: #dc2626; }

	.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid var(--border); border-radius: 10px; background: white; font-size: 13px; font-weight: 600; font-family: inherit; color: #18181B; cursor: pointer; text-decoration: none; }
	.btn:hover:not(:disabled) { background: #FAFAFA; }
	.btn:disabled { opacity: 0.5; cursor: default; }
	.btn.primary { background: #F57832; color: white; border-color: #F57832; }
	.btn.primary:hover:not(:disabled) { background: #e26a26; }
	.btn.sm { padding: 5px 10px; font-size: 12px; }
	.btn.danger { color: #dc2626; }
	.btn.upload { margin: 0; }

	.card { background: white; border: 1px solid var(--border); border-radius: 14px; padding: 18px; }
	.card-title { font-size: 14px; font-weight: 700; color: #18181B; margin: 0 0 14px; display: flex; align-items: center; gap: 6px; }
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
	.combo + .combo { margin-top: 6px; }
	.combo { display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: white; }
	.combo .seg { display: flex; flex-direction: column; min-width: 0; flex: 1; }
	.combo .seg-grow { flex: 1.4; }
	.combo .seg + .seg { border-left: 1px solid var(--border); }
	.combo .seg small { font-size: 11px; font-weight: 600; color: #A1A1AA; padding: 6px 10px 0; }
	.combo .seg input { border: none; border-radius: 0; padding: 4px 10px 8px; background: transparent; }
	.combo .seg input:focus { border: none; box-shadow: none; }
	.combo .seg:focus-within { background: #FAFAFA; }

	.sku-search { position: relative; width: 240px; }
	.sku-search input { padding: 5px 10px; font-size: 12px; }
	.sku-dropdown { position: absolute; z-index: 5; right: 0; min-width: 360px; background: white; border: 1px solid var(--border); border-radius: 8px; margin-top: 4px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); overflow: hidden; }
	.sku-opt { display: block; width: 100%; text-align: left; padding: 8px 10px; border: none; background: white; font-size: 13px; cursor: pointer; }
	.sku-opt:hover { background: #FAFAFA; }

	.prod-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
	.prod { position: relative; border: 1px solid var(--border); border-radius: 10px; padding: 10px; }
	.prod-thumb { position: relative; aspect-ratio: 1; background: #FAFAFA; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
	.prod-thumb img { width: 100%; height: 100%; object-fit: contain; }
	.prod-info { display: flex; flex-direction: column; margin-top: 8px; }
	.prod-name { font-size: 12px; font-weight: 600; color: #18181B; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.link-del { position: absolute; top: 6px; right: 6px; background: rgba(255,255,255,0.9); border: 1px solid var(--border); border-radius: 6px; width: 22px; height: 22px; color: #71717A; cursor: pointer; }
	.link-del:hover { color: #dc2626; }

	.share-input { font-family: monospace; font-size: 11.5px; color: #52525B; background: #FAFAFA; }
	.share-btns { display: flex; gap: 6px; margin-top: 8px; }
	.share-btns .btn { flex: 1; justify-content: center; }

	.asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; }
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
	/* ── photo viewer ── */
	.viewer { position: fixed; inset: 0; z-index: 60; display: grid; grid-template-columns: minmax(0, 1fr) 360px; background: rgba(9,9,11,0.94); }
	.stage { position: relative; display: flex; align-items: center; justify-content: center; padding: 40px 72px; min-height: 0; }
	.stage-media { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 6px; background: center / contain no-repeat; box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
	img.stage-media { min-width: min(100%, 300px); }
	.nav { position: absolute; top: 50%; transform: translateY(-50%); width: 44px; height: 44px; border-radius: 100px; border: none; background: rgba(255,255,255,0.12); color: white; font-size: 28px; line-height: 1; cursor: pointer; transition: background .15s; }
	.nav:hover { background: rgba(255,255,255,0.25); }
	.nav.prev { left: 16px; } .nav.next { right: 16px; }
	.counter { position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.7); }
	.pane { display: flex; flex-direction: column; min-height: 0; background: white; }
	.pane-head { display: flex; align-items: center; gap: 10px; padding: 16px 16px 12px 20px; border-bottom: 1px solid #F4F4F5; }
	.pane-title { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
	.pane-name { font-size: 14px; font-weight: 700; color: #18181B; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.pill-venue { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 100px; background: #EEF2FF; color: #4338ca; flex: none; }
	.pane-x { width: 32px; height: 32px; border: none; background: #F4F4F5; border-radius: 8px; font-size: 14px; color: #52525B; cursor: pointer; flex: none; }
	.pane-body { flex: 1; overflow-y: auto; padding: 4px 20px 20px; }
	.pane-sec { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #71717A; margin: 18px 0 8px; }
	.seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
	.seg-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 36px; border: 1px solid var(--border); border-radius: 10px; background: white; font-family: inherit; font-size: 13px; font-weight: 600; color: #3F3F46; cursor: pointer; transition: background .12s, border-color .12s; }
	.seg-btn:hover { background: #FAFAFA; }
	.seg-btn.good .dot { background: #16a34a; } .seg-btn.semi .dot { background: #f59e0b; } .seg-btn.bad .dot { background: #dc2626; }
	.seg-btn.good.sel { background: #F0FDF4; border-color: #16a34a; color: #15803d; }
	.seg-btn.semi.sel { background: #FFFBEB; border-color: #f59e0b; color: #b45309; }
	.seg-btn.bad.sel  { background: #FEF2F2; border-color: #dc2626; color: #b91c1c; }
	.pane .pick.on { border-color: #F57832; background: #FFF8F3; }
	.pick-txt { display: flex; flex-direction: column; min-width: 0; }
	.pick-txt .strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.pane-foot { display: flex; align-items: center; gap: 8px; padding: 12px 20px; border-top: 1px solid #F4F4F5; }
	.pane-foot .muted { margin-right: auto; }
	@media (max-width: 860px) {
		.viewer { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) minmax(0, 55vh); }
		.stage { padding: 16px 52px; }
		.nav { width: 36px; height: 36px; font-size: 22px; }
		.nav.prev { left: 8px; } .nav.next { right: 8px; }
	}

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
	.ptags.sel { margin: 0 0 12px; min-height: 22px; align-items: center; }
	.tag-search { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; font-family: inherit; }
	.tag-sec { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #71717A; margin: 14px 0 6px; }

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
	.stars { display: inline-flex; gap: 1px; vertical-align: middle; }
	.note-wrap { position: relative; display: inline-flex; vertical-align: middle; margin-left: 6px; }
	.note-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: none; border-radius: 6px; background: none; color: #D4D4D8; cursor: pointer; padding: 0; }
	.note-btn:hover { background: #F4F4F5; color: #71717A; }
	.note-btn.has { color: #F57832; }
	.note-pop { position: absolute; top: calc(100% + 6px); right: -8px; z-index: 20; width: 280px; padding: 10px; background: white; border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.15); }
	.note-pop textarea { font-size: 13px; }
	.note-foot { display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px; }
	.star { background: none; border: none; padding: 0 1px; font-size: 17px; line-height: 1; color: #E4E4E7; cursor: pointer; transition: transform .1s; }
	.star.on { color: #F5A623; }
	.stars:hover .star { color: #F5A623; }
	.stars .star:hover ~ .star { color: #E4E4E7; }
	.star:hover { transform: scale(1.15); }
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
	/* Guru tender */
	.t-bar { display: inline-block; width: 70px; height: 6px; border-radius: 99px; background: #F4F4F5; overflow: hidden; flex-shrink: 0; }
	.t-bar span { display: block; height: 100%; background: #16a34a; border-radius: 99px; }
	.t-flash { margin-bottom: 12px; padding: 8px 12px; border-radius: 10px; background: #F0FDF4; color: #15803d; font-size: 13px; font-weight: 600; }
	.openings { display: flex; flex-direction: column; gap: 8px; }
	.op-row { display: grid; grid-template-columns: minmax(160px, 1fr) auto minmax(160px, 1fr) 28px; align-items: center; gap: 12px; padding: 8px 10px; border: 1px solid #F0F0F1; border-radius: 12px; background: #FAFAFA; }
	.op-label { background: white; font-weight: 600; }
	.stepper { display: inline-flex; align-items: center; border: 1px solid var(--border); border-radius: 9px; background: white; overflow: hidden; }
	.stepper button { width: 30px; height: 32px; border: none; background: none; font-size: 16px; color: #52525B; cursor: pointer; font-family: inherit; }
	.stepper button:hover:not(:disabled) { background: #F4F4F5; }
	.stepper button:disabled { color: #D4D4D8; cursor: default; }
	.stepper span { min-width: 24px; text-align: center; font-weight: 700; font-size: 14px; font-variant-numeric: tabular-nums; }
	.op-fill { display: flex; align-items: center; gap: 10px; min-width: 0; }
	.op-dots { display: inline-flex; gap: 4px; flex-shrink: 0; }
	.op-dot { width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid #D4D4D8; box-sizing: border-box; }
	.op-dot.on { background: #16a34a; border-color: #16a34a; }
	.op-names { font-size: 12.5px; color: #52525B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.op-del { width: 28px; height: 28px; border: none; border-radius: 8px; background: none; color: #A1A1AA; cursor: pointer; }
	.op-del:hover { background: #FEF2F2; color: #dc2626; }
	.op-lbl { font-size: 12px; }
	.t-foot { display: flex; align-items: center; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
	.t-chips { display: inline-flex; gap: 6px; margin-left: auto; flex-wrap: wrap; }
	.t-chip { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 99px; background: #F4F4F5; color: #52525B; white-space: nowrap; }
	.t-chip.ok { background: #DCFCE7; color: #15803D; }
	.t-chip.no { background: #FEF2F2; color: #b91c1c; }
	.modal.tender-modal { max-width: 640px; display: flex; flex-direction: column; }
	.tm-bar { display: flex; gap: 8px; margin-bottom: 10px; }
	.tm-search { flex: 1; }
	.tm-list { display: flex; flex-direction: column; gap: 4px; max-height: 52vh; overflow-y: auto; }
	.tm-row { display: grid; grid-template-columns: 18px 30px minmax(0, 1fr) 48px auto; align-items: center; gap: 10px; padding: 7px 10px; border: 1px solid var(--border); border-radius: 10px; cursor: pointer; }
	.tm-row input { width: 16px; height: 16px; accent-color: #F57832; padding: 0; }
	.tm-row.on { border-color: #F57832; background: #FFF8F3; }
	.tm-row.off { opacity: .55; cursor: default; }
	.tm-id { display: flex; flex-direction: column; min-width: 0; }
	.tm-id > * { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.tm-rate { font-size: 12px; font-weight: 700; color: #F5A623; }
	.tm-foot { align-items: center; }
	.tm-foot .muted { margin-right: auto; }
	@media (max-width: 700px) { .op-row { grid-template-columns: 1fr auto 28px; } .op-fill { grid-column: 1 / -1; } }
</style>
