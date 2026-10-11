<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();
	let newName = $state('');
	let busy = $state(false);
	let editingId = $state('');
	let editName = $state('');

	async function add() {
		const name = newName.trim();
		if (!name || busy) return;
		busy = true;
		try {
			const res = await fetch('/api/admin/departments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
			if (!res.ok) throw new Error('Failed');
			newName = '';
			await invalidateAll();
		} catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { busy = false; }
	}
	function startEdit(d) { editingId = d.id; editName = d.name; }
	async function saveEdit() {
		const name = editName.trim();
		if (!name || busy) return;
		busy = true;
		try {
			const res = await fetch(`/api/admin/departments/${editingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
			if (!res.ok) throw new Error('Failed');
			editingId = '';
			await invalidateAll();
		} catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { busy = false; }
	}
	async function del(d) {
		if (!confirm(`Delete department "${d.name}"? Existing users keep the label until reassigned.`)) return;
		busy = true;
		try {
			await fetch(`/api/admin/departments/${d.id}`, { method: 'DELETE' });
			await invalidateAll();
		} finally { busy = false; }
	}
</script>

<svelte:head><title>Departments — Admin</title></svelte:head>

<AppNav active="admin" user={data.user} />
<main class="wrap">
	<div class="head">
		<div>
			<h1>Departments</h1>
			<p class="sub">Teams used to group users and tag knowledge for access.</p>
		</div>
		<a class="btn" href="/admin/users">← Users</a>
	</div>

	<div class="add">
		<input class="in" bind:value={newName} placeholder="New department name…" onkeydown={(e) => e.key === 'Enter' && add()} />
		<button class="btn primary" onclick={add} disabled={!newName.trim() || busy}>Add</button>
	</div>

	{#if data.departments.length === 0}
		<p class="empty">No departments yet.</p>
	{:else}
		<ul class="list">
			{#each data.departments as d (d.id)}
				<li class="row">
					{#if editingId === d.id}
						<input class="in grow" bind:value={editName} onkeydown={(e) => e.key === 'Enter' && saveEdit()} />
						<button class="btn primary sm" onclick={saveEdit} disabled={busy}>Save</button>
						<button class="btn sm" onclick={() => (editingId = '')}>Cancel</button>
					{:else}
						<span class="name">{d.name}</span>
						<button class="link" onclick={() => startEdit(d)}>Rename</button>
						<button class="link danger" onclick={() => del(d)}>Delete</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	.wrap { max-width: 640px; margin: 0 auto; padding: 32px 28px 80px; }
	.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
	h1 { font-size: 20px; font-weight: 800; margin: 0 0 3px; }
	.sub { font-size: 13px; color: #A1A1AA; margin: 0; }
	.btn { padding: 8px 14px; border: 1px solid var(--border); border-radius: 9px; background: #fff; font-size: 13px; font-weight: 600; color: #18181B; text-decoration: none; cursor: pointer; font-family: inherit; }
	.btn.primary { background: #F57832; color: #fff; border-color: #F57832; }
	.btn.sm { padding: 6px 11px; font-size: 12px; }
	.btn:disabled { opacity: 0.6; }
	.add { display: flex; gap: 8px; margin-bottom: 16px; }
	.in { font-family: inherit; font-size: 14px; border: 1px solid var(--border); border-radius: 9px; padding: 9px 12px; background: #fff; }
	.in.grow { flex: 1; }
	.add .in { flex: 1; }
	.empty { color: #A1A1AA; font-size: 14px; }
	.list { list-style: none; margin: 0; padding: 0; background: #fff; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
	.row { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
	.row:last-child { border-bottom: none; }
	.name { flex: 1; font-size: 14px; font-weight: 600; color: #18181B; }
	.link { background: none; border: none; font: inherit; font-weight: 600; font-size: 13px; color: #6D5BD0; cursor: pointer; }
	.link.danger { color: #c23b26; }
</style>
