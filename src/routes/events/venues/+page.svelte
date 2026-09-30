<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();
	let busy = $state(false);

	let expanded = $state(null);

	// ── Venue create / edit modal ────────────────────────────────────────────────
	const blankVenue = () => ({ name: '', address: '', zip: '', city: '', country: '', notes: '' });
	let vModalOpen = $state(false);
	let vMode = $state('create'); // 'create' | 'edit'
	let vEditId = $state(null);
	let vForm = $state(blankVenue());

	function openAddVenue() { vMode = 'create'; vEditId = null; vForm = blankVenue(); vModalOpen = true; }
	function openEditVenue(v) { vMode = 'edit'; vEditId = v.id; vForm = { name: v.name ?? '', address: v.address ?? '', zip: v.zip ?? '', city: v.city ?? '', country: v.country ?? '', notes: v.notes ?? '' }; vModalOpen = true; }
	function closeVenue() { vModalOpen = false; }

	async function saveVenue() {
		if (!vForm.name.trim() || busy) return;
		busy = true;
		try {
			const url = vMode === 'edit' ? `/api/events/venues/${vEditId}` : '/api/events/venues';
			const res = await fetch(url, {
				method: vMode === 'edit' ? 'PUT' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(vForm)
			});
			if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Failed');
			vModalOpen = false;
			await invalidateAll();
		} catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { busy = false; }
	}

	async function deleteVenue(id) {
		if (!confirm('Delete this venue? Events keep their history but lose the venue link.')) return;
		await fetch(`/api/events/venues/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}

	// ── Contact create / edit modal ────────────────────────────────────────────────
	const blankContact = () => ({ name: '', role: '', email: '', phone: '' });
	let cModalOpen = $state(false);
	let cMode = $state('create'); // 'create' | 'edit'
	let cVenueId = $state(null);
	let cEditId = $state(null);
	let cForm = $state(blankContact());

	function openAddContact(venueId) { cMode = 'create'; cVenueId = venueId; cEditId = null; cForm = blankContact(); cModalOpen = true; }
	function openEditContact(c) { cMode = 'edit'; cEditId = c.id; cForm = { name: c.name ?? '', role: c.role ?? '', email: c.email ?? '', phone: c.phone ?? '' }; cModalOpen = true; }
	function closeContact() { cModalOpen = false; }

	async function saveContact() {
		if (busy) return;
		busy = true;
		try {
			const url = cMode === 'edit' ? `/api/events/contacts/${cEditId}` : `/api/events/venues/${cVenueId}/contacts`;
			const res = await fetch(url, {
				method: cMode === 'edit' ? 'PUT' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(cForm)
			});
			if (!res.ok) throw new Error('Failed');
			cModalOpen = false;
			await invalidateAll();
		} catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { busy = false; }
	}

	async function deleteContact(id) {
		if (!confirm('Delete this contact?')) return;
		await fetch(`/api/events/contacts/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}
</script>

<svelte:head><title>Venues — Product Portal</title></svelte:head>

<div class="page">
	<AppNav active="events-venues" user={data.user} />

	<main>
		<div class="page-header">
			<div>
				<h1 class="page-title">Venues</h1>
				<p class="page-sub">Places you host events, and their contact people.</p>
			</div>
			<button class="btn primary" onclick={openAddVenue}>+ Add venue</button>
		</div>

		{#if data.venues.length === 0}
			<p class="empty">No venues yet.</p>
		{/if}

		{#each data.venues as v (v.id)}
			<div class="venue-row">
				<div class="venue-head">
					<div>
						<span class="strong">{v.name}</span>
						<span class="muted">· {[v.address, [v.zip, v.city].filter(Boolean).join(' '), v.country].filter(Boolean).join(', ') || 'No address'}</span>
					</div>
					<div class="venue-actions">
						<span class="chip">{v.event_count} events</span>
						<span class="chip">{v.contact_count} contacts</span>
						<button class="btn sm" onclick={() => (expanded = expanded === v.id ? null : v.id)}>{expanded === v.id ? 'Close' : 'Contacts'}</button>
						<button class="btn sm" onclick={() => openEditVenue(v)}>Edit</button>
						<button class="btn sm danger" onclick={() => deleteVenue(v.id)}>Delete</button>
					</div>
				</div>
				{#if expanded === v.id}
					<div class="contacts">
						{#if v.contacts.length === 0}
							<p class="empty small">No contacts yet.</p>
						{:else}
							<table class="contact-table">
								<thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Phone</th><th></th></tr></thead>
								<tbody>
									{#each v.contacts as c (c.id)}
										<tr>
											<td class="strong">{c.name || '—'}</td>
											<td>{c.role || '—'}</td>
											<td>{c.email || '—'}</td>
											<td>{c.phone || '—'}</td>
											<td class="ct-actions">
												<div class="row-actions">
													<button class="btn sm" onclick={() => openEditContact(c)}>Edit</button>
													<button class="btn sm danger" onclick={() => deleteContact(c.id)}>✕</button>
												</div>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}
						<button class="btn sm add-contact" onclick={() => openAddContact(v.id)}>+ Add contact</button>
					</div>
				{/if}
			</div>
		{/each}
	</main>
</div>

{#if vModalOpen}
	<div class="modal-overlay" onclick={closeVenue} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Venue">
			<button class="modal-x" onclick={closeVenue} aria-label="Close">✕</button>
			<h3 class="modal-title">{vMode === 'edit' ? 'Edit venue' : 'Add venue'}</h3>
			<div class="mgrid">
				<label class="fld span2"><span>Name *</span><input bind:value={vForm.name} /></label>
				<label class="fld span2"><span>Address</span><input bind:value={vForm.address} /></label>
				<label class="fld"><span>Zip</span><input bind:value={vForm.zip} /></label>
				<label class="fld"><span>City</span><input bind:value={vForm.city} /></label>
				<label class="fld span2"><span>Country</span><input bind:value={vForm.country} /></label>
				<label class="fld span2"><span>Notes</span><textarea rows="2" bind:value={vForm.notes}></textarea></label>
			</div>
			<div class="modal-foot">
				<button class="btn" onclick={closeVenue}>Cancel</button>
				<button class="btn primary" onclick={saveVenue} disabled={busy || !vForm.name.trim()}>{vMode === 'edit' ? 'Save' : 'Add venue'}</button>
			</div>
		</div>
	</div>
{/if}

{#if cModalOpen}
	<div class="modal-overlay" onclick={closeContact} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Contact">
			<button class="modal-x" onclick={closeContact} aria-label="Close">✕</button>
			<h3 class="modal-title">{cMode === 'edit' ? 'Edit contact' : 'Add contact'}</h3>
			<div class="mgrid">
				<label class="fld span2"><span>Name</span><input bind:value={cForm.name} /></label>
				<label class="fld"><span>Role</span><input bind:value={cForm.role} /></label>
				<label class="fld"><span>Phone</span><input bind:value={cForm.phone} /></label>
				<label class="fld span2"><span>Email</span><input bind:value={cForm.email} /></label>
			</div>
			<div class="modal-foot">
				<button class="btn" onclick={closeContact}>Cancel</button>
				<button class="btn primary" onclick={saveContact} disabled={busy}>{cMode === 'edit' ? 'Save' : 'Add contact'}</button>
			</div>
		</div>
	</div>
{/if}

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') { closeContact(); closeVenue(); } }} />

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; }
	main { flex: 1; max-width: 1000px; margin: 0 auto; width: 100%; padding: 32px 28px 80px; }
	.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
	.page-title { font-size: 18px; font-weight: 700; color: #18181B; margin: 0 0 2px; }
	.page-sub { font-size: 13px; color: #A1A1AA; margin: 0; }

	.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid var(--border); border-radius: 10px; background: white; font-size: 13px; font-weight: 600; font-family: inherit; color: #18181B; cursor: pointer; }
	.btn:hover:not(:disabled) { background: #FAFAFA; }
	.btn:disabled { opacity: 0.5; cursor: default; }
	.btn.primary { background: #F57832; color: white; border-color: #F57832; }
	.btn.primary:hover:not(:disabled) { background: #e26a26; }
	.btn.sm { padding: 5px 10px; font-size: 12px; }
	.btn.danger { color: #dc2626; }

	.card { background: white; border: 1px solid var(--border); border-radius: 14px; padding: 18px; margin-bottom: 16px; }
	.card-title { font-size: 14px; font-weight: 700; color: #18181B; margin: 0 0 12px; }
	.grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
	input, textarea { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; font-family: inherit; color: #18181B; background: white; outline: none; }
	input:focus, textarea:focus { border-color: #A1A1AA; }
	textarea { margin-top: 8px; resize: vertical; }
	.right { display: flex; justify-content: flex-end; margin-top: 10px; }
	.empty { color: #A1A1AA; font-size: 13px; padding: 8px 0; }
	.empty.small { padding: 4px 0; }

	.strong { font-weight: 600; }
	.muted { color: #A1A1AA; font-size: 12px; }
	.venue-row { background: white; border: 1px solid var(--border); border-radius: 12px; padding: 12px 16px; margin-bottom: 8px; }
	.venue-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.venue-actions { display: flex; align-items: center; gap: 8px; }
	.chip { font-size: 11px; font-weight: 600; color: #71717A; background: #F4F4F5; padding: 3px 9px; border-radius: 100px; }
	.contacts { margin-top: 12px; border-top: 1px dashed var(--border); padding-top: 12px; }

	.contact-table { width: 100%; border-collapse: collapse; font-size: 13px; }
	.contact-table th { text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #A1A1AA; padding: 6px 10px; border-bottom: 1px solid var(--border); }
	.contact-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); color: #18181B; vertical-align: middle; }
	.contact-table tbody tr:last-child td { border-bottom: none; }
	.ct-actions { text-align: right; }
	.row-actions { display: flex; gap: 6px; justify-content: flex-end; }
	.add-contact { margin-top: 12px; }

	/* Modal */
	.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 50; }
	.modal { position: relative; background: white; border-radius: 16px; padding: 24px; max-width: 520px; width: 100%; max-height: 85vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
	.modal-x { position: absolute; top: 14px; right: 14px; width: 32px; height: 32px; border: none; background: #F4F4F5; border-radius: 8px; font-size: 15px; color: #52525B; cursor: pointer; }
	.modal-title { font-size: 18px; font-weight: 700; margin: 0 0 16px; padding-right: 40px; }
	.mgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	.fld { display: flex; flex-direction: column; gap: 4px; }
	.fld.span2 { grid-column: 1 / -1; }
	.fld span { font-size: 12px; font-weight: 600; color: #71717A; }
	.modal-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
</style>
