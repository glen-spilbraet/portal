<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();
	let busy = $state(false);

	let typeName = $state('');
	let editingId = $state(null);
	let editName = $state('');

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

	function startEdit(t) { editingId = t.id; editName = t.name; }
	function cancelEdit() { editingId = null; editName = ''; }

	async function saveEdit(id) {
		if (!editName.trim() || busy) return;
		busy = true;
		try {
			const res = await fetch(`/api/events/types/${id}`, {
				method: 'PUT', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: editName.trim() })
			});
			if (!res.ok) throw new Error((await res.json()).message ?? 'Failed');
			cancelEdit();
			await invalidateAll();
		} catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { busy = false; }
	}

	async function deleteType(id) {
		if (!confirm('Delete this event type? Events using it will show no type (they keep their history).')) return;
		await fetch(`/api/events/types/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}
</script>

<svelte:head><title>Event types — Product Portal</title></svelte:head>

<div class="page">
	<AppNav active="events-types" user={data.user} />

	<main>
		<div class="page-header">
			<div>
				<h1 class="page-title">Event types</h1>
				<p class="page-sub">Categories you assign to events. Renaming a type keeps it linked to its events.</p>
			</div>
		</div>

		<div class="card">
			<div class="type-add">
				<input placeholder="New type name" bind:value={typeName} onkeydown={(e) => e.key === 'Enter' && addType()} />
				<button class="btn primary" onclick={addType} disabled={busy || !typeName.trim()}>Add</button>
			</div>

			<div class="type-list">
				{#each data.types as t (t.id)}
					<div class="type-row">
						{#if editingId === t.id}
							<input class="edit-input" bind:value={editName} onkeydown={(e) => { if (e.key === 'Enter') saveEdit(t.id); if (e.key === 'Escape') cancelEdit(); }} />
							<button class="btn sm primary" onclick={() => saveEdit(t.id)} disabled={busy || !editName.trim()}>Save</button>
							<button class="btn sm" onclick={cancelEdit}>Cancel</button>
						{:else}
							<span class="type-name">{t.name}</span>
							<button class="btn sm" onclick={() => startEdit(t)}>Rename</button>
							<button class="btn sm danger" onclick={() => deleteType(t.id)}>Delete</button>
						{/if}
					</div>
				{:else}
					<p class="empty">No types yet.</p>
				{/each}
			</div>
		</div>
	</main>
</div>

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; }
	main { flex: 1; max-width: 680px; margin: 0 auto; width: 100%; padding: 32px 28px 80px; }
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

	.card { background: white; border: 1px solid var(--border); border-radius: 14px; padding: 18px; }
	.type-add { display: flex; gap: 8px; }
	.type-add input { max-width: 280px; }
	input { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; font-family: inherit; color: #18181B; background: white; outline: none; }
	input:focus { border-color: #A1A1AA; }

	.type-list { display: flex; flex-direction: column; gap: 6px; margin-top: 16px; }
	.type-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 10px; }
	.type-name { flex: 1; font-size: 14px; font-weight: 600; color: #18181B; }
	.edit-input { flex: 1; max-width: 320px; }
	.empty { color: #A1A1AA; font-size: 13px; padding: 8px 0; }
</style>
