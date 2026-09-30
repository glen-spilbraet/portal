<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();
	let busy = $state(false);

	let vForm = $state({ name: '', address: '', zip: '', city: '', country: '', notes: '' });
	let expanded = $state(null);

	async function addVenue() {
		if (!vForm.name.trim() || busy) return;
		busy = true;
		try {
			const res = await fetch('/api/events/venues', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(vForm)
			});
			if (!res.ok) throw new Error((await res.json()).message ?? 'Failed');
			vForm = { name: '', address: '', zip: '', city: '', country: '', notes: '' };
			await invalidateAll();
		} catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { busy = false; }
	}

	async function deleteVenue(id) {
		if (!confirm('Delete this venue? Events keep their history but lose the venue link.')) return;
		await fetch(`/api/events/venues/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}

	let cForm = $state({ name: '', phone: '', email: '', role: '', in_email_flow: true });
	async function addContact(venueId) {
		if (busy) return;
		busy = true;
		try {
			const res = await fetch(`/api/events/venues/${venueId}/contacts`, {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(cForm)
			});
			if (!res.ok) throw new Error('Failed');
			cForm = { name: '', phone: '', email: '', role: '', in_email_flow: true };
			await invalidateAll();
		} catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { busy = false; }
	}
	async function deleteContact(id) {
		await fetch(`/api/events/contacts/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}
	async function toggleContactFlow(c) {
		await fetch(`/api/events/contacts/${c.id}`, {
			method: 'PUT', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ in_email_flow: !c.in_email_flow })
		});
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
		</div>

		<div class="card">
			<h2 class="card-title">Add venue</h2>
			<div class="grid">
				<input placeholder="Name *" bind:value={vForm.name} />
				<input placeholder="Address" bind:value={vForm.address} />
				<input placeholder="Zip" bind:value={vForm.zip} />
				<input placeholder="City" bind:value={vForm.city} />
				<input placeholder="Country" bind:value={vForm.country} />
			</div>
			<textarea rows="2" placeholder="Notes" bind:value={vForm.notes}></textarea>
			<div class="right"><button class="btn primary" onclick={addVenue} disabled={busy || !vForm.name.trim()}>Add venue</button></div>
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
						<button class="btn sm danger" onclick={() => deleteVenue(v.id)}>Delete</button>
					</div>
				</div>
				{#if expanded === v.id}
					<div class="contacts">
						{#each v.contacts as c (c.id)}
							<div class="contact">
								<span class="strong">{c.name || '—'}</span>
								{#if c.role}<span class="muted">· {c.role}</span>{/if}
								{#if c.email}<span class="muted">· {c.email}</span>{/if}
								{#if c.phone}<span class="muted">· {c.phone}</span>{/if}
								<button class="flow-pill {c.in_email_flow ? 'on' : 'off'}" onclick={() => toggleContactFlow(c)} title="Include in event email flow">{c.in_email_flow ? 'In flow' : 'No flow'}</button>
								<button class="link-del" onclick={() => deleteContact(c.id)}>✕</button>
							</div>
						{/each}
						<div class="grid grid-contact">
							<input placeholder="Name" bind:value={cForm.name} />
							<input placeholder="Role" bind:value={cForm.role} />
							<input placeholder="Email" bind:value={cForm.email} />
							<input placeholder="Phone" bind:value={cForm.phone} />
							<button class="btn sm primary" onclick={() => addContact(v.id)} disabled={busy}>Add</button>
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</main>
</div>

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; }
	main { flex: 1; max-width: 1000px; margin: 0 auto; width: 100%; padding: 32px 28px 80px; }
	.page-header { margin-bottom: 20px; }
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
	.grid-contact { grid-template-columns: repeat(4, 1fr) auto; align-items: center; margin-top: 8px; }
	input, textarea { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; font-family: inherit; color: #18181B; background: white; outline: none; }
	input:focus, textarea:focus { border-color: #A1A1AA; }
	textarea { margin-top: 8px; resize: vertical; }
	.right { display: flex; justify-content: flex-end; margin-top: 10px; }
	.empty { color: #A1A1AA; font-size: 13px; padding: 8px 0; }

	.strong { font-weight: 600; }
	.muted { color: #A1A1AA; font-size: 12px; }
	.venue-row { background: white; border: 1px solid var(--border); border-radius: 12px; padding: 12px 16px; margin-bottom: 8px; }
	.venue-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.venue-actions { display: flex; align-items: center; gap: 8px; }
	.chip { font-size: 11px; font-weight: 600; color: #71717A; background: #F4F4F5; padding: 3px 9px; border-radius: 100px; }
	.contacts { margin-top: 12px; border-top: 1px dashed var(--border); padding-top: 12px; }
	.contact { display: flex; align-items: center; gap: 6px; font-size: 13px; padding: 4px 0; }
	.contact .flow-pill { margin-left: auto; }
	.flow-pill { font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 100px; border: 1px solid var(--border); cursor: pointer; background: white; white-space: nowrap; }
	.flow-pill.on { background: #E9F7EC; color: #16a34a; border-color: #bbf7d0; }
	.flow-pill.off { color: #A1A1AA; }
	.link-del { background: none; border: none; color: #A1A1AA; cursor: pointer; font-size: 13px; padding: 0 4px; }
	.link-del:hover { color: #dc2626; }
</style>
