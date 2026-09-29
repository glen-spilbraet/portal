<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { invalidateAll, goto } from '$app/navigation';

	let { data } = $props();

	let tab = $state('events'); // events | venues | types
	let busy = $state(false);

	// ── Create event ──────────────────────────────────────────────────────────
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

	// ── Venues ──────────────────────────────────────────────────────────────────
	let vForm = $state({ name: '', address: '', city: '', country: '', notes: '' });
	let expanded = $state(null); // venue id whose contacts are open

	async function addVenue() {
		if (!vForm.name.trim() || busy) return;
		busy = true;
		try {
			const res = await fetch('/api/events/venues', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(vForm)
			});
			if (!res.ok) throw new Error((await res.json()).message ?? 'Failed');
			vForm = { name: '', address: '', city: '', country: '', notes: '' };
			await invalidateAll();
		} catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { busy = false; }
	}

	async function deleteVenue(id) {
		if (!confirm('Delete this venue? Events keep their history but lose the venue link.')) return;
		await fetch(`/api/events/venues/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}

	// contacts
	let cForm = $state({ name: '', phone: '', email: '', role: '' });
	async function addContact(venueId) {
		if (busy) return;
		busy = true;
		try {
			const res = await fetch(`/api/events/venues/${venueId}/contacts`, {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(cForm)
			});
			if (!res.ok) throw new Error('Failed');
			cForm = { name: '', phone: '', email: '', role: '' };
			await invalidateAll();
		} catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { busy = false; }
	}
	async function deleteContact(id) {
		await fetch(`/api/events/contacts/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}

	// ── Types ─────────────────────────────────────────────────────────────────
	let typeName = $state('');
	async function addType() {
		if (!typeName.trim() || busy) return;
		busy = true;
		try {
			const res = await fetch('/api/events/types', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: typeName.trim() })
			});
			if (!res.ok) throw new Error((await res.json()).message ?? 'Failed');
			typeName = '';
			await invalidateAll();
		} catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { busy = false; }
	}
	async function deleteType(id) {
		if (!confirm('Delete this event type?')) return;
		await fetch(`/api/events/types/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}

	function fmtDate(d) {
		if (!d) return '—';
		try { return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
		catch { return d; }
	}
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
			{#if tab === 'events'}
				<button class="btn primary" onclick={newEvent} disabled={busy}>+ New event</button>
			{/if}
		</div>

		<div class="tabs">
			<button class="tab" class:active={tab === 'events'} onclick={() => (tab = 'events')}>Events</button>
			<button class="tab" class:active={tab === 'venues'} onclick={() => (tab = 'venues')}>Venues</button>
			<button class="tab" class:active={tab === 'types'} onclick={() => (tab = 'types')}>Event types</button>
		</div>

		{#if tab === 'events'}
			{#if data.events.length === 0}
				<p class="empty">No events yet. Click “New event” to create one.</p>
			{:else}
				<table class="tbl">
					<thead>
						<tr><th>Date</th><th>Event</th><th>Venue</th><th>Type</th><th>Status</th><th class="num">Participants</th><th class="num">SKUs</th><th class="num">Assets</th></tr>
					</thead>
					<tbody>
						{#each data.events as e (e.id)}
							<tr class="clickable" onclick={() => goto(`/events/${e.id}`)}>
								<td>{fmtDate(e.event_date)}</td>
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

		{#if tab === 'venues'}
			<div class="card">
				<h2 class="card-title">Add venue</h2>
				<div class="grid">
					<input placeholder="Name *" bind:value={vForm.name} />
					<input placeholder="Address" bind:value={vForm.address} />
					<input placeholder="City" bind:value={vForm.city} />
					<input placeholder="Country" bind:value={vForm.country} />
				</div>
				<textarea rows="2" placeholder="Notes" bind:value={vForm.notes}></textarea>
				<div class="right"><button class="btn primary" onclick={addVenue} disabled={busy || !vForm.name.trim()}>Add venue</button></div>
			</div>

			{#each data.venues as v (v.id)}
				<div class="venue-row">
					<div class="venue-head">
						<div>
							<span class="strong">{v.name}</span>
							<span class="muted">· {[v.address, v.city, v.country].filter(Boolean).join(', ') || 'No address'}</span>
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
		{/if}

		{#if tab === 'types'}
			<div class="card">
				<h2 class="card-title">Event types</h2>
				<div class="type-add">
					<input placeholder="New type name" bind:value={typeName} onkeydown={(e) => e.key === 'Enter' && addType()} />
					<button class="btn primary" onclick={addType} disabled={busy || !typeName.trim()}>Add</button>
				</div>
				<div class="type-list">
					{#each data.types as t (t.id)}
						<span class="type-pill">{t.name}<button class="link-del" onclick={() => deleteType(t.id)}>✕</button></span>
					{:else}
						<p class="empty">No types yet.</p>
					{/each}
				</div>
			</div>
		{/if}
	</main>
</div>

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; }
	main { flex: 1; max-width: 1000px; margin: 0 auto; width: 100%; padding: 32px 28px 80px; }
	.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
	.page-title { font-size: 18px; font-weight: 700; color: #18181B; margin: 0 0 2px; }
	.page-sub { font-size: 13px; color: #A1A1AA; margin: 0; max-width: 560px; }

	.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 20px; }
	.tab { background: none; border: none; padding: 8px 14px; font-size: 13px; font-weight: 600; color: #71717A; cursor: pointer; border-bottom: 2px solid transparent; }
	.tab.active { color: #18181B; border-bottom-color: #F57832; }

	.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid var(--border); border-radius: 10px; background: white; font-size: 13px; font-weight: 600; font-family: inherit; color: #18181B; cursor: pointer; }
	.btn:hover:not(:disabled) { background: #FAFAFA; }
	.btn:disabled { opacity: 0.5; cursor: default; }
	.btn.primary { background: #F57832; color: white; border-color: #F57832; }
	.btn.primary:hover:not(:disabled) { background: #e26a26; }
	.btn.sm { padding: 5px 10px; font-size: 12px; }
	.btn.danger { color: #dc2626; }

	.tbl { width: 100%; border-collapse: collapse; background: white; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; font-size: 13px; }
	.tbl th { text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #A1A1AA; padding: 10px 14px; border-bottom: 1px solid var(--border); background: #FAFAFA; }
	.tbl td { padding: 12px 14px; border-bottom: 1px solid var(--border); color: #18181B; }
	.tbl tbody tr:last-child td { border-bottom: none; }
	.tbl tr.clickable { cursor: pointer; }
	.tbl tr.clickable:hover td { background: #FafafA; }
	.num { text-align: right; }
	.strong { font-weight: 600; }
	.muted { color: #A1A1AA; font-size: 12px; }

	.status { font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 100px; text-transform: capitalize; }
	.status.planned { background: #FEF9C3; color: #a16207; }
	.status.confirmed { background: #DBEAFE; color: #1d4ed8; }
	.status.done { background: #F0FDF4; color: #16a34a; }
	.status.cancelled { background: #FEF2F2; color: #dc2626; }

	.card { background: white; border: 1px solid var(--border); border-radius: 14px; padding: 18px; margin-bottom: 16px; }
	.card-title { font-size: 14px; font-weight: 700; color: #18181B; margin: 0 0 12px; }
	.grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
	.grid-contact { grid-template-columns: repeat(4, 1fr) auto; align-items: center; margin-top: 8px; }
	input, textarea { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; font-family: inherit; color: #18181B; background: white; outline: none; }
	input:focus, textarea:focus { border-color: #A1A1AA; }
	textarea { margin-top: 8px; resize: vertical; }
	.right { display: flex; justify-content: flex-end; margin-top: 10px; }
	.empty { color: #A1A1AA; font-size: 13px; padding: 20px 0; }

	.venue-row { background: white; border: 1px solid var(--border); border-radius: 12px; padding: 12px 16px; margin-bottom: 8px; }
	.venue-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.venue-actions { display: flex; align-items: center; gap: 8px; }
	.chip { font-size: 11px; font-weight: 600; color: #71717A; background: #F4F4F5; padding: 3px 9px; border-radius: 100px; }
	.contacts { margin-top: 12px; border-top: 1px dashed var(--border); padding-top: 12px; }
	.contact { display: flex; align-items: center; gap: 6px; font-size: 13px; padding: 4px 0; }
	.link-del { background: none; border: none; color: #A1A1AA; cursor: pointer; font-size: 13px; padding: 0 4px; }
	.link-del:hover { color: #dc2626; }

	.type-add { display: flex; gap: 8px; }
	.type-add input { max-width: 260px; }
	.type-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
	.type-pill { display: inline-flex; align-items: center; gap: 6px; background: #F4F4F5; border-radius: 100px; padding: 5px 12px; font-size: 13px; font-weight: 600; color: #18181B; }
</style>
