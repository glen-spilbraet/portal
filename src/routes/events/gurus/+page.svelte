<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();
	let busy = $state(false);

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
	async function setRating(g, r) { await patchGuru(g.id, { rating: g.rating === r ? null : r }); }

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
				<p class="page-sub">The people we hire to run events. Rate them (internal) and attach them to events.</p>
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
							<span class="avatar-edit">✎</span>
						</label>
						<div class="guru-id">
							<span class="guru-name">{g.name}</span>
							<span class="muted">{[[g.zip, g.city].filter(Boolean).join(' '), g.country].filter(Boolean).join(', ') || 'No location'}</span>
						</div>
					</div>

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
				<label class="fld span2"><span>Country</span><input bind:value={form.country} /></label>
				<label class="fld span2"><span>Notes (internal)</span><textarea rows="2" bind:value={form.notes}></textarea></label>
			</div>
			<div class="modal-foot">
				<button class="btn" onclick={closeModal}>Cancel</button>
				<button class="btn primary" onclick={save} disabled={busy || !form.name.trim()}>{mode === 'edit' ? 'Save' : 'Add guru'}</button>
			</div>
		</div>
	</div>
{/if}

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') closeModal(); }} />

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; }
	main { flex: 1; max-width: 1000px; margin: 0 auto; width: 100%; padding: 32px 28px 80px; }
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
	.avatar-edit { position: absolute; bottom: 0; right: 0; background: rgba(0,0,0,0.55); color: white; font-size: 10px; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; border-top-left-radius: 6px; }
	.guru-id { flex: 1; min-width: 0; display: flex; flex-direction: column; }
	.guru-name { font-weight: 700; font-size: 14px; color: #18181B; }

	.guru-contact { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0 0; font-size: 12px; color: #52525B; }
	.guru-bottom { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
	.stars { display: flex; gap: 2px; }
	.star { background: none; border: none; cursor: pointer; font-size: 18px; color: #E4E4E7; line-height: 1; padding: 0; }
	.star.on { color: #F5A623; }
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
</style>
