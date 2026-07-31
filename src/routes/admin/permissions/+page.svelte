<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	let sets = $state(data.sets);

	// New set form
	let newName = $state('');
	let newAccess = $state({ stats: true, sheets: true, catalogues: true, planograms: true, data: true, price_lists: false, orders: false, mail: false });
	let creating = $state(false);
	let createError = $state('');

	// Editing state: { [id]: { name, access_sheets, ... } }
	let editing = $state({});
	let saving = $state({});

	const SECTIONS = [
		{ key: 'stats',       label: 'Stats' },
		{ key: 'sheets',      label: 'Sheets' },
		{ key: 'catalogues',  label: 'Catalogues' },
		{ key: 'planograms',  label: 'Planograms' },
		{ key: 'data',        label: 'Data' },
		{ key: 'price_lists', label: 'Price List' },
		{ key: 'orders',      label: 'Orders' },
		{ key: 'mail',        label: 'Mail' },
	];

	async function createSet() {
		const name = newName.trim();
		if (!name || creating) return;
		creating = true; createError = '';
		try {
			const res = await fetch('/api/admin/permission-sets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name,
					access_sheets:      newAccess.sheets,
					access_catalogues:  newAccess.catalogues,
					access_planograms:  newAccess.planograms,
					access_data:        newAccess.data,
					access_price_lists: newAccess.price_lists,
					access_orders:      newAccess.orders,
					access_stats:       newAccess.stats,
					access_mail:        newAccess.mail,
				})
			});
			if (!res.ok) throw new Error((await res.json()).message ?? 'Failed');
			const created = await res.json();
			sets = [...sets, {
				id:                 created.id,
				name:               name,
				access_sheets:      newAccess.sheets       ? 1 : 0,
				access_catalogues:  newAccess.catalogues   ? 1 : 0,
				access_planograms:  newAccess.planograms   ? 1 : 0,
				access_data:        newAccess.data         ? 1 : 0,
				access_price_lists: newAccess.price_lists  ? 1 : 0,
				access_orders:      newAccess.orders       ? 1 : 0,
				access_stats:       newAccess.stats        ? 1 : 0,
				access_mail:        newAccess.mail         ? 1 : 0,
			}];
			newName = '';
			newAccess = { stats: true, sheets: true, catalogues: true, planograms: true, data: true, price_lists: false, orders: false, mail: false };
		} catch (e) {
			createError = e.message;
		} finally {
			creating = false;
		}
	}

	function startEdit(set) {
		editing[set.id] = {
			name:               set.name,
			access_sheets:      !!set.access_sheets,
			access_catalogues:  !!set.access_catalogues,
			access_planograms:  !!set.access_planograms,
			access_data:        !!set.access_data,
			access_price_lists: !!set.access_price_lists,
			access_orders:      !!set.access_orders,
			access_stats:       !!set.access_stats,
			access_mail:        !!set.access_mail,
		};
	}

	function cancelEdit(id) {
		const { [id]: _, ...rest } = editing;
		editing = rest;
	}

	async function saveEdit(id) {
		const e = editing[id];
		if (!e) return;
		saving[id] = true;
		try {
			const res = await fetch(`/api/admin/permission-sets/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name:               e.name,
					access_sheets:      e.access_sheets,
					access_catalogues:  e.access_catalogues,
					access_planograms:  e.access_planograms,
					access_data:        e.access_data,
					access_price_lists: e.access_price_lists,
					access_orders:      e.access_orders,
					access_stats:       e.access_stats,
					access_mail:        e.access_mail,
				})
			});
			if (!res.ok) throw new Error('Failed to save');
			sets = sets.map(s => s.id !== id ? s : {
				...s,
				name:               e.name,
				access_sheets:      e.access_sheets      ? 1 : 0,
				access_catalogues:  e.access_catalogues  ? 1 : 0,
				access_planograms:  e.access_planograms  ? 1 : 0,
				access_data:        e.access_data        ? 1 : 0,
				access_price_lists: e.access_price_lists ? 1 : 0,
				access_orders:      e.access_orders      ? 1 : 0,
				access_stats:       e.access_stats       ? 1 : 0,
				access_mail:        e.access_mail        ? 1 : 0,
			});
			cancelEdit(id);
		} catch (err) {
			alert(err.message);
		} finally {
			const { [id]: _, ...rest } = saving;
			saving = rest;
		}
	}

	async function deleteSet(id, name) {
		if (!confirm(`Delete permission set "${name}"?\n\nUsers assigned to this set will revert to full access.`)) return;
		const res = await fetch(`/api/admin/permission-sets/${id}`, { method: 'DELETE' });
		if (res.ok) {
			sets = sets.filter(s => s.id !== id);
			cancelEdit(id);
		} else {
			alert('Failed to delete');
		}
	}
</script>

<svelte:head>
	<title>Permission Sets — Admin</title>
</svelte:head>

<AppNav active="permissions" user={data.user} />

<main class="page">
	<div class="page-header">
		<div>
			<h1 class="page-title">Permission Sets</h1>
			<p class="page-sub">Define named access profiles and assign them to users</p>
		</div>
	</div>

	<!-- Create new set -->
	<div class="card">
		<h2 class="card-title">Create permission set</h2>
		<div class="create-row">
			<input
				class="name-input"
				type="text"
				placeholder="e.g. Sales team, Read-only…"
				bind:value={newName}
				onkeydown={(e) => e.key === 'Enter' && createSet()}
			/>
			<button class="btn-primary" onclick={createSet} disabled={!newName.trim() || creating}>
				{creating ? 'Creating…' : 'Create'}
			</button>
		</div>
		<div class="access-grid" style="margin-top: 14px">
			{#each SECTIONS as s}
				<label class="access-toggle" class:on={newAccess[s.key]}>
					<input
						type="checkbox"
						bind:checked={newAccess[s.key]}
						style="display:none"
					/>
					<span class="toggle-dot"></span>
					<span class="toggle-label">{s.label}</span>
				</label>
			{/each}
		</div>
		{#if createError}<p class="error-text">{createError}</p>{/if}
	</div>

	<!-- Existing sets -->
	{#if sets.length === 0}
		<div class="empty">No permission sets yet — create one above.</div>
	{:else}
		<div class="sets-list">
			{#each sets as set (set.id)}
				{@const isEditing = !!editing[set.id]}
				{@const ed = editing[set.id]}
				<div class="set-row" class:editing={isEditing}>
					{#if isEditing}
						<!-- Edit mode -->
						<div class="set-edit">
							<input class="name-input" type="text" bind:value={ed.name} />
							<div class="access-grid">
								{#each SECTIONS as s}
									<label class="access-toggle" class:on={ed['access_' + s.key]}>
										<input
											type="checkbox"
											bind:checked={ed['access_' + s.key]}
											style="display:none"
										/>
										<span class="toggle-dot"></span>
										<span class="toggle-label">{s.label}</span>
									</label>
								{/each}
							</div>
							<div class="edit-actions">
								<button class="btn-sm btn-danger-outline" onclick={() => deleteSet(set.id, set.name)}>Delete</button>
								<div style="flex:1"></div>
								<button class="btn-sm btn-ghost" onclick={() => cancelEdit(set.id)}>Cancel</button>
								<button class="btn-sm btn-primary" onclick={() => saveEdit(set.id)} disabled={saving[set.id] || !ed.name.trim()}>
									{saving[set.id] ? 'Saving…' : 'Save'}
								</button>
							</div>
						</div>
					{:else}
						<!-- View mode -->
						<div class="set-view">
							<span class="set-name">{set.name}</span>
							<div class="set-badges">
								{#each SECTIONS as s}
									<span class="section-badge" class:on={!!set['access_' + s.key]} class:off={!set['access_' + s.key]}>
										{#if set['access_' + s.key]}
											<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
										{:else}
											<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
										{/if}
										{s.label}
									</span>
								{/each}
							</div>
							<button class="btn-sm btn-ghost edit-btn" onclick={() => startEdit(set)}>Edit</button>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</main>

<style>
	.page {
		max-width: 760px;
		margin: 0 auto;
		padding: 40px 28px 80px;
	}
	.page-header { margin-bottom: 32px; }
	.page-title {
		font-size: 26px; font-weight: 800;
		color: #18181B; letter-spacing: -0.5px; margin: 0 0 4px;
	}
	.page-sub { font-size: 14px; color: #A89060; font-weight: 500; margin: 0; }

	.card {
		background: white;
		border: 1px solid var(--border);
		border-radius: 14px;
		padding: 24px 28px;
		margin-bottom: 28px;
	}
	.card-title {
		font-size: 13px; font-weight: 700; color: #52525B;
		margin: 0 0 14px; text-transform: uppercase; letter-spacing: 0.04em;
	}

	.create-row { display: flex; gap: 10px; align-items: center; }

	.name-input {
		flex: 1;
		padding: 9px 14px;
		border: 1px solid var(--border);
		border-radius: 9px;
		font-size: 14px; font-family: inherit;
		outline: none; background: #FFFBF0;
		transition: border-color 0.15s, box-shadow 0.15s;
	}
	.name-input:focus {
		border-color: #F57832;
		box-shadow: 0 0 0 3px rgba(245,120,50,0.12);
		background: white;
	}

	/* Access toggles */
	.access-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.access-toggle {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 7px 14px 7px 10px;
		border-radius: 9px;
		border: 1px solid var(--border);
		cursor: pointer;
		background: #F4F4F5;
		transition: background 0.15s, border-color 0.15s;
		user-select: none;
	}
	.access-toggle.on {
		background: #F0FDF4;
		border-color: #86efac;
	}

	.toggle-dot {
		width: 14px; height: 14px;
		border-radius: 50%;
		border: 2px solid #D1D5DB;
		background: white;
		transition: border-color 0.15s, background 0.15s;
		flex-shrink: 0;
	}
	.on .toggle-dot {
		border-color: #16a34a;
		background: #16a34a;
		box-shadow: inset 0 0 0 2px white;
	}

	.toggle-label { font-size: 13px; font-weight: 600; color: #52525B; }
	.on .toggle-label { color: #15803D; }

	/* Buttons */
	.btn-primary {
		padding: 9px 20px;
		background: #F57832; color: white;
		border: none; border-radius: 9px;
		font-size: 14px; font-weight: 700; font-family: inherit;
		cursor: pointer; transition: background 0.15s; white-space: nowrap;
	}
	.btn-primary:hover:not(:disabled) { background: #E06820; }
	.btn-primary:disabled { opacity: 0.55; cursor: default; }

	.btn-sm {
		display: inline-flex; align-items: center;
		padding: 6px 14px; border-radius: 8px;
		font-size: 13px; font-weight: 600; font-family: inherit;
		cursor: pointer; border: 1px solid transparent;
		transition: background 0.15s, color 0.15s, border-color 0.15s;
		white-space: nowrap;
	}
	.btn-ghost {
		background: none; color: #71717A; border-color: var(--border);
	}
	.btn-ghost:hover { background: #F4F4F5; color: #18181B; }
	.btn-sm.btn-primary {
		background: #F57832; color: white; border-color: #F57832; padding: 6px 16px;
	}
	.btn-sm.btn-primary:hover:not(:disabled) { background: #E06820; border-color: #E06820; }
	.btn-sm.btn-primary:disabled { opacity: 0.5; cursor: default; }
	.btn-danger-outline { color: #dc2626; border-color: #fecaca; background: none; }
	.btn-danger-outline:hover { background: #FEF2F2; border-color: #fca5a5; }

	.error-text { color: #dc2626; font-size: 13px; margin: 10px 0 0; }

	.empty {
		text-align: center; color: #aaa;
		padding: 48px 0; font-size: 14px;
	}

	/* Sets list */
	.sets-list { display: flex; flex-direction: column; gap: 6px; }

	.set-row {
		background: white;
		border: 1px solid var(--border);
		border-radius: 12px;
		overflow: hidden;
		transition: box-shadow 0.15s;
	}
	.set-row:hover:not(.editing) { box-shadow: var(--shadow); }
	.set-row.editing { border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,0.10); }

	.set-view {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 18px;
		flex-wrap: wrap;
	}
	.set-name {
		font-size: 14px; font-weight: 700; color: #18181B;
		min-width: 140px; flex-shrink: 0;
	}
	.set-badges {
		display: flex; flex-wrap: wrap; gap: 5px; flex: 1;
	}
	.section-badge {
		display: inline-flex; align-items: center; gap: 4px;
		font-size: 11px; font-weight: 700;
		padding: 3px 9px; border-radius: 100px;
	}
	.section-badge.on  { background: #F0FDF4; color: #15803D; }
	.section-badge.off { background: #F4F4F5; color: #A1A1AA; text-decoration: line-through; }

	.edit-btn { margin-left: auto; flex-shrink: 0; }

	.set-edit {
		padding: 18px 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.set-edit .name-input { max-width: 360px; }

	.edit-actions {
		display: flex; gap: 8px; align-items: center;
	}
</style>
