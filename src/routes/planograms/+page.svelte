<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	let projects = $state(data.projects);
	let creating = $state(false);
	let newName = $state('');
	let showNewModal = $state(false);
	let renameModal = $state(null); // { id, name }
	let deleteModal = $state(null); // { id, name }
	let busy = $state(false);
	let error = $state('');

	function formatDate(iso) {
		if (!iso) return '';
		const d = new Date(iso);
		return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	async function createProject() {
		if (!newName.trim() || busy) return;
		busy = true; error = '';
		try {
			const res = await fetch('/api/planograms', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: newName.trim() }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message || 'Failed');
			window.location.href = `/planograms/${data.id}`;
		} catch (e) {
			error = e.message;
			busy = false;
		}
	}

	async function renameProject() {
		if (!renameModal || !renameModal.name.trim() || busy) return;
		busy = true; error = '';
		try {
			const res = await fetch(`/api/planograms/${renameModal.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: renameModal.name.trim() }),
			});
			if (!res.ok) throw new Error('Failed to rename');
			const idx = projects.findIndex(p => p.id === renameModal.id);
			if (idx !== -1) projects[idx] = { ...projects[idx], name: renameModal.name.trim() };
			renameModal = null;
		} catch (e) {
			error = e.message;
		}
		busy = false;
	}

	async function deleteProject() {
		if (!deleteModal || busy) return;
		busy = true; error = '';
		try {
			const res = await fetch(`/api/planograms/${deleteModal.id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error('Failed to delete');
			projects = projects.filter(p => p.id !== deleteModal.id);
			deleteModal = null;
		} catch (e) {
			error = e.message;
		}
		busy = false;
	}
</script>

<AppNav active="planograms" />

<main class="page">
	<div class="page-header">
		<div>
			<h1 class="page-title">Planograms</h1>
			<p class="page-sub">Build shelf layouts and share them with your team</p>
		</div>
		<button class="btn-primary" onclick={() => { newName = ''; showNewModal = true; }}>
			<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
				<path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
			</svg>
			New project
		</button>
	</div>

	{#if projects.length === 0}
		<div class="empty-state">
			<div class="empty-icon">
				<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<rect x="2" y="7" width="20" height="2" rx="1"/>
					<rect x="2" y="13" width="20" height="2" rx="1"/>
					<rect x="2" y="4" width="20" height="16" rx="2" stroke="#ccc" stroke-width="1.5" fill="none"/>
				</svg>
			</div>
			<p class="empty-title">No planogram projects yet</p>
			<p class="empty-sub">Create your first shelf layout to get started</p>
			<button class="btn-primary" onclick={() => { newName = ''; showNewModal = true; }}>Create project</button>
		</div>
	{:else}
		<div class="grid">
			{#each projects as project (project.id)}
				<div class="card">
					<a href="/planograms/{project.id}" class="card-main">
						<div class="card-preview">
							<svg width="56" height="40" viewBox="0 0 56 40" fill="none">
								<rect x="2" y="2" width="52" height="36" rx="3" fill="#f5f4f0" stroke="#e0ddd8" stroke-width="1.5"/>
								<rect x="6" y="6" width="44" height="3" rx="1" fill="#c9a96e"/>
								<rect x="6" y="13" width="44" height="3" rx="1" fill="#c9a96e"/>
								<rect x="6" y="20" width="44" height="3" rx="1" fill="#c9a96e"/>
								<rect x="6" y="27" width="44" height="3" rx="1" fill="#c9a96e"/>
								<rect x="6" y="31" width="44" height="6" rx="1" fill="#c9a96e"/>
							</svg>
						</div>
						<div class="card-info">
							<div class="card-name">{project.name}</div>
							<div class="card-meta">Updated {formatDate(project.updated_at)}</div>
						</div>
					</a>
					<div class="card-actions">
						<button class="card-action-btn" title="Rename" onclick={() => { renameModal = { id: project.id, name: project.name }; }}>
							<svg width="13" height="13" viewBox="0 0 13 13" fill="none">
								<path d="M9.5 1.5a1.414 1.414 0 012 2L4 11H1.5L1 8.5 9.5 1.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
							</svg>
						</button>
						<button class="card-action-btn card-action-delete" title="Delete" onclick={() => { deleteModal = { id: project.id, name: project.name }; }}>
							<svg width="13" height="13" viewBox="0 0 13 13" fill="none">
								<path d="M2 3.5h9M5 3.5V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M3.5 3.5l.5 7h5l.5-7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
						</button>
					</div>
				</div>
			{/each}

			<!-- New project dashed card -->
			<button class="card card-new" onclick={() => { newName = ''; showNewModal = true; }}>
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
					<path d="M12 5v14M5 12h14" stroke="#ccc" stroke-width="2" stroke-linecap="round"/>
				</svg>
				<span>New project</span>
			</button>
		</div>
	{/if}
</main>

<!-- New project modal -->
{#if showNewModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) showNewModal = false; }}>
		<div class="dialog">
			<h2>New planogram project</h2>
			<div class="field">
				<label for="new-name">Project name</label>
				<!-- svelte-ignore a11y_autofocus -->
				<input id="new-name" type="text" bind:value={newName} placeholder="e.g. Spring 2025 shelf" autofocus
					onkeydown={(e) => { if (e.key === 'Enter') createProject(); }} />
			</div>
			{#if error}<p class="error-text">{error}</p>{/if}
			<div class="dialog-buttons">
				<button class="btn-cancel" onclick={() => showNewModal = false}>Cancel</button>
				<button class="btn-primary" onclick={createProject} disabled={!newName.trim() || busy}>
					{busy ? 'Creating…' : 'Create project →'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Rename modal -->
{#if renameModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) renameModal = null; }}>
		<div class="dialog">
			<h2>Rename project</h2>
			<div class="field">
				<label for="rename-input">Project name</label>
				<!-- svelte-ignore a11y_autofocus -->
				<input id="rename-input" type="text" bind:value={renameModal.name} autofocus
					onkeydown={(e) => { if (e.key === 'Enter') renameProject(); }} />
			</div>
			{#if error}<p class="error-text">{error}</p>{/if}
			<div class="dialog-buttons">
				<button class="btn-cancel" onclick={() => renameModal = null}>Cancel</button>
				<button class="btn-primary" onclick={renameProject} disabled={!renameModal.name.trim() || busy}>
					{busy ? 'Saving…' : 'Save'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Delete confirmation modal -->
{#if deleteModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) deleteModal = null; }}>
		<div class="dialog">
			<h2>Delete project?</h2>
			<p class="dialog-body">This will permanently delete <strong>{deleteModal.name}</strong> and all its products and photos. This cannot be undone.</p>
			{#if error}<p class="error-text">{error}</p>{/if}
			<div class="dialog-buttons">
				<button class="btn-cancel" onclick={() => deleteModal = null}>Cancel</button>
				<button class="btn-danger" onclick={deleteProject} disabled={busy}>
					{busy ? 'Deleting…' : 'Delete project'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.page {
		max-width: 1140px;
		margin: 0 auto;
		padding: 40px 28px;
	}

	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 32px;
		gap: 16px;
	}

	.page-title {
		font-size: 22px;
		font-weight: 800;
		color: #18181B;
		letter-spacing: -0.4px;
	}

	.page-sub {
		font-size: 13px;
		color: #8A7550;
		margin-top: 4px;
	}

	.btn-primary {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 9px 18px;
		background: #F57832;
		color: white;
		border: none;
		border-radius: 10px;
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
		transition: background 0.15s;
		white-space: nowrap;
		flex-shrink: 0;
		box-shadow: 0 2px 8px rgba(245, 120, 50, 0.28);
	}
	.btn-primary:hover:not(:disabled) { background: #E06820; }
	.btn-primary:disabled { opacity: 0.6; cursor: default; }

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 16px;
	}

	.card {
		background: white;
		border: 1.5px solid #E8E4DC;
		border-radius: 14px;
		overflow: hidden;
		transition: box-shadow 0.15s, border-color 0.15s;
		display: flex;
		flex-direction: column;
		text-decoration: none;
	}
	.card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); border-color: #D4CEBC; }

	.card-main {
		display: flex;
		flex-direction: column;
		text-decoration: none;
		flex: 1;
	}

	.card-preview {
		background: #F5F4F0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		border-bottom: 1px solid #EDE9E3;
	}

	.card-info {
		padding: 14px 16px 10px;
	}

	.card-name {
		font-size: 14px;
		font-weight: 700;
		color: #18181B;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.card-meta {
		font-size: 12px;
		color: #A89060;
		margin-top: 3px;
	}

	.card-actions {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 8px 12px;
		border-top: 1px solid #F0EDE8;
	}

	.card-action-btn {
		width: 28px;
		height: 28px;
		border: 1px solid #E8E4DC;
		border-radius: 7px;
		background: transparent;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #A89060;
		transition: background 0.12s, color 0.12s, border-color 0.12s;
	}
	.card-action-btn:hover { background: #F5F4F0; border-color: #D4CEBC; color: #52525B; }
	.card-action-delete:hover { background: #FEF2F2; border-color: #FECACA; color: #DC2626; }

	.card-new {
		background: transparent;
		border: 2px dashed #E0DBD2;
		border-radius: 14px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 40px 20px;
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s;
		min-height: 160px;
		font-size: 13px;
		font-weight: 600;
		color: #C5BFAF;
	}
	.card-new:hover { border-color: #C9A96E; background: #FDFCF8; color: #A89060; }
	.card-new svg { transition: stroke 0.15s; }
	.card-new:hover svg path { stroke: #A89060; }

	/* Empty state */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 80px 20px;
		text-align: center;
	}
	.empty-icon { margin-bottom: 4px; }
	.empty-title { font-size: 16px; font-weight: 700; color: #52525B; }
	.empty-sub { font-size: 13px; color: #A89060; margin-bottom: 8px; }

	/* Overlay & dialogs */
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: 20px;
	}

	.dialog {
		background: white;
		border-radius: 16px;
		padding: 28px;
		width: 100%;
		max-width: 400px;
		display: flex;
		flex-direction: column;
		gap: 18px;
		box-shadow: 0 8px 40px rgba(0,0,0,0.18);
	}

	.dialog h2 { font-size: 18px; font-weight: 800; color: #18181B; }

	.dialog-body {
		font-size: 14px;
		color: #52525B;
		line-height: 1.5;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field label {
		font-size: 12px;
		font-weight: 600;
		color: #52525B;
	}

	.field input {
		padding: 10px 12px;
		border: 1.5px solid #E0DBD2;
		border-radius: 10px;
		font-size: 14px;
		outline: none;
		transition: border-color 0.15s;
	}
	.field input:focus { border-color: #F57832; }

	.dialog-buttons {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	.btn-cancel {
		padding: 9px 16px;
		background: #F5F4F0;
		border: 1px solid #E0DBD2;
		border-radius: 9px;
		font-size: 13px;
		font-weight: 600;
		color: #52525B;
		cursor: pointer;
		transition: background 0.12s;
	}
	.btn-cancel:hover { background: #EDE9E3; }

	.btn-danger {
		padding: 9px 16px;
		background: #DC2626;
		color: white;
		border: none;
		border-radius: 9px;
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
		transition: background 0.12s;
	}
	.btn-danger:hover:not(:disabled) { background: #B91C1C; }
	.btn-danger:disabled { opacity: 0.6; cursor: default; }

	.error-text { font-size: 13px; color: #DC2626; }
</style>
