<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();
	let busy = $state(false);

	// Add guru
	let form = $state({ name: '', phone: '', email: '', zip: '', city: '' });
	async function addGuru() {
		if (!form.name.trim() || busy) return;
		busy = true;
		try {
			const res = await fetch('/api/events/gurus', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form)
			});
			if (!res.ok) throw new Error((await res.json()).message ?? 'Failed');
			form = { name: '', phone: '', email: '', zip: '', city: '' };
			await invalidateAll();
		} catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { busy = false; }
	}

	// Inline edit
	let editId = $state(null);
	let edit = $state({ name: '', phone: '', email: '', zip: '', city: '', notes: '' });
	function startEdit(g) { editId = g.id; edit = { name: g.name, phone: g.phone ?? '', email: g.email ?? '', zip: g.zip ?? '', city: g.city ?? '', notes: g.notes ?? '' }; }
	function cancelEdit() { editId = null; edit = { name: '', phone: '', email: '', zip: '', city: '', notes: '' }; }
	async function saveEdit(id) {
		busy = true;
		try {
			const res = await fetch(`/api/events/gurus/${id}`, {
				method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(edit)
			});
			if (!res.ok) throw new Error('Failed');
			cancelEdit();
			await invalidateAll();
		} catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { busy = false; }
	}

	async function patchGuru(id, patch) {
		await fetch(`/api/events/gurus/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
		await invalidateAll();
	}
	async function setRating(g, r) { await patchGuru(g.id, { rating: g.rating === r ? null : r }); }
	async function toggleFlow(g) { await patchGuru(g.id, { in_email_flow: !g.in_email_flow }); }

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
				<p class="page-sub">The people we hire to run events. Rate them (internal), toggle email-flow inclusion, and attach them to events.</p>
			</div>
		</div>

		<div class="card">
			<h2 class="card-title">Add guru</h2>
			<div class="grid">
				<input placeholder="Name *" bind:value={form.name} />
				<input placeholder="Phone" bind:value={form.phone} />
				<input placeholder="Email" bind:value={form.email} />
				<input placeholder="Zip" bind:value={form.zip} />
				<input placeholder="City" bind:value={form.city} />
			</div>
			<div class="right"><button class="btn primary" onclick={addGuru} disabled={busy || !form.name.trim()}>Add guru</button></div>
		</div>

		{#if data.gurus.length === 0}
			<p class="empty">No gurus yet.</p>
		{/if}

		<div class="guru-grid">
			{#each data.gurus as g (g.id)}
				<div class="guru">
					<div class="guru-top">
						<label class="avatar" title="Upload photo">
							{#if g.image_key}<img src="/api/img/{g.image_key}" alt={g.name} />{:else}<span class="avatar-ph">{g.name?.[0]?.toUpperCase() ?? '?'}</span>{/if}
							<input type="file" hidden accept="image/*" onchange={(e) => uploadPhoto(e, g.id)} />
							<span class="avatar-edit">✎</span>
						</label>
						<div class="guru-id">
							{#if editId === g.id}
								<input class="edit-name" bind:value={edit.name} />
							{:else}
								<span class="guru-name">{g.name}</span>
								<span class="muted">{[g.zip, g.city].filter(Boolean).join(' ') || 'No location'}</span>
							{/if}
						</div>
						<div class="guru-flow">
							<button class="pill {g.in_email_flow ? 'on' : 'off'}" onclick={() => toggleFlow(g)} title="Include in event email flow">{g.in_email_flow ? 'In flow' : 'No flow'}</button>
						</div>
					</div>

					{#if editId === g.id}
						<div class="edit-grid">
							<input placeholder="Phone" bind:value={edit.phone} />
							<input placeholder="Email" bind:value={edit.email} />
							<input placeholder="Zip" bind:value={edit.zip} />
							<input placeholder="City" bind:value={edit.city} />
						</div>
						<textarea rows="2" placeholder="Notes (internal)" bind:value={edit.notes}></textarea>
						<div class="row-actions">
							<button class="btn sm primary" onclick={() => saveEdit(g.id)} disabled={busy}>Save</button>
							<button class="btn sm" onclick={cancelEdit}>Cancel</button>
						</div>
					{:else}
						<div class="guru-contact">
							{#if g.phone}<span>📞 {g.phone}</span>{/if}
							{#if g.email}<span>✉ {g.email}</span>{/if}
						</div>
						<div class="guru-bottom">
							<div class="stars" title="Internal rating">
								{#each [1, 2, 3, 4, 5] as r}
									<button class="star {g.rating >= r ? 'on' : ''}" onclick={() => setRating(g, r)}>★</button>
								{/each}
							</div>
							<div class="row-actions">
								<span class="chip">{g.event_count} events</span>
								<button class="btn sm" onclick={() => startEdit(g)}>Edit</button>
								<button class="btn sm danger" onclick={() => deleteGuru(g.id)}>Delete</button>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</main>
</div>

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; }
	main { flex: 1; max-width: 1000px; margin: 0 auto; width: 100%; padding: 32px 28px 80px; }
	.page-header { margin-bottom: 20px; }
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

	.card { background: white; border: 1px solid var(--border); border-radius: 14px; padding: 18px; margin-bottom: 16px; }
	.card-title { font-size: 14px; font-weight: 700; color: #18181B; margin: 0 0 12px; }
	.grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
	input, textarea { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; font-family: inherit; color: #18181B; background: white; outline: none; }
	input:focus, textarea:focus { border-color: #A1A1AA; }
	textarea { margin-top: 8px; resize: vertical; }
	.right { display: flex; justify-content: flex-end; margin-top: 10px; }
	.muted { color: #A1A1AA; font-size: 12px; }

	.guru-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
	.guru { background: white; border: 1px solid var(--border); border-radius: 12px; padding: 14px; }
	.guru-top { display: flex; align-items: center; gap: 12px; }
	.avatar { position: relative; width: 48px; height: 48px; border-radius: 50%; overflow: hidden; background: #F4F4F5; flex-shrink: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; }
	.avatar img { width: 100%; height: 100%; object-fit: cover; }
	.avatar-ph { font-size: 18px; font-weight: 700; color: #A1A1AA; }
	.avatar-edit { position: absolute; bottom: 0; right: 0; background: rgba(0,0,0,0.55); color: white; font-size: 10px; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; border-top-left-radius: 6px; }
	.guru-id { flex: 1; min-width: 0; display: flex; flex-direction: column; }
	.guru-name { font-weight: 700; font-size: 14px; color: #18181B; }
	.edit-name { font-weight: 600; }
	.guru-flow { flex-shrink: 0; }
	.pill { font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 100px; border: 1px solid var(--border); cursor: pointer; background: white; white-space: nowrap; }
	.pill.on { background: #E9F7EC; color: #16a34a; border-color: #bbf7d0; }
	.pill.off { color: #A1A1AA; }

	.guru-contact { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0 0; font-size: 12px; color: #52525B; }
	.guru-bottom { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
	.stars { display: flex; gap: 2px; }
	.star { background: none; border: none; cursor: pointer; font-size: 18px; color: #E4E4E7; line-height: 1; padding: 0; }
	.star.on { color: #F5A623; }
	.row-actions { display: flex; align-items: center; gap: 6px; }
	.chip { font-size: 11px; font-weight: 600; color: #71717A; background: #F4F4F5; padding: 3px 9px; border-radius: 100px; }
	.edit-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 12px; }
</style>
