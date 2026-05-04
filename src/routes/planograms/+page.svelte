<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	// ── State ──────────────────────────────────────────────────────────────────
	let projects     = $state(data.projects);
	let folders      = $state(data.folders);
	let sharedWithMe = $state(data.sharedWithMe);
	const isAdmin    = data.isAdmin;
	const userNames  = data.userNames ?? {};
	function displayName(email) { return userNames[email] ?? email?.split('@')[0] ?? email; }

	// Navigation: null = root, 'shared' = Shared with me, uuid = folder id
	let currentFolder = $state(null);

	// New folder creation
	let newFolderName     = $state('');
	let newFolderParentId = $state(null);
	let showNewFolder     = $state(false);
	let savingFolder      = $state(false);

	// Inline folder rename
	let renamingId  = $state(null);
	let renameName  = $state('');

	// Move project to folder
	let moveModal = $state(null); // project object being moved

	// Share modal
	let shareTarget = $state(null); // project object
	let shares      = $state([]);
	let shareEmail  = $state('');
	let shareError  = $state('');
	let sharing     = $state(false);

	// New / rename / delete project modals
	let showNewModal  = $state(false);
	let newName       = $state('');
	let renameModal   = $state(null); // { id, name }
	let deleteModal   = $state(null); // { id, name }
	let busy          = $state(false);
	let modalError    = $state('');

	// ── Folder tree helpers ────────────────────────────────────────────────────
	function buildFlatTree(allFolders, parentId = null, depth = 0) {
		return allFolders
			.filter(f => (f.parent_id ?? null) === parentId)
			.sort((a, b) => a.name.localeCompare(b.name))
			.flatMap(f => [{ ...f, depth }, ...buildFlatTree(allFolders, f.id, depth + 1)]);
	}

	const flatTree = $derived(buildFlatTree(folders));

	function getAncestors(folderId) {
		const path = [];
		let cur = folderId;
		while (cur) {
			const f = folders.find(x => x.id === cur);
			if (!f) break;
			path.unshift(f);
			cur = f.parent_id ?? null;
		}
		return path;
	}

	const breadcrumb = $derived(
		currentFolder && currentFolder !== 'shared' ? getAncestors(currentFolder) : []
	);

	const subFolders = $derived(
		currentFolder === 'shared'
			? []
			: folders.filter(f => (f.parent_id ?? null) === (currentFolder ?? null))
				.sort((a, b) => a.name.localeCompare(b.name))
	);

	const viewProjects = $derived(
		currentFolder === 'shared'
			? sharedWithMe
			: projects.filter(p => (p.folder_id ?? null) === (currentFolder ?? null))
	);

	const isSharedView = $derived(currentFolder === 'shared');

	// ── Navigation ─────────────────────────────────────────────────────────────
	function navigate(folderId) {
		currentFolder = folderId;
	}

	// ── Folder CRUD ────────────────────────────────────────────────────────────
	function openNewFolder(parentId = null) {
		newFolderParentId = parentId;
		newFolderName = '';
		showNewFolder = true;
		setTimeout(() => document.getElementById('new-folder-input')?.focus(), 50);
	}

	async function saveNewFolder() {
		if (!newFolderName.trim() || savingFolder) return;
		savingFolder = true;
		const res = await fetch('/api/planograms/folders', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: newFolderName.trim(), parent_id: newFolderParentId }),
		});
		if (res.ok) {
			const folder = await res.json();
			folders = [...folders, folder];
			navigate(folder.id);
		}
		showNewFolder = false;
		savingFolder = false;
	}

	function startRename(folder) {
		renamingId = folder.id;
		renameName = folder.name;
		setTimeout(() => document.getElementById(`rename-${folder.id}`)?.focus(), 30);
	}

	async function saveRename(folder) {
		if (!renameName.trim() || renameName.trim() === folder.name) {
			renamingId = null;
			return;
		}
		await fetch(`/api/planograms/folders/${folder.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: renameName.trim() }),
		});
		folders = folders.map(f => f.id === folder.id ? { ...f, name: renameName.trim() } : f);
		renamingId = null;
	}

	async function deleteFolder(folder) {
		if (!confirm(`Delete folder "${folder.name}"?\n\nIts contents will move to the parent folder.`)) return;
		const res = await fetch(`/api/planograms/folders/${folder.id}`, { method: 'DELETE' });
		if (res.ok) {
			const parentId = folder.parent_id ?? null;
			folders = folders
				.filter(f => f.id !== folder.id)
				.map(f => f.parent_id === folder.id ? { ...f, parent_id: parentId } : f);
			projects = projects.map(p =>
				p.folder_id === folder.id ? { ...p, folder_id: parentId } : p
			);
			if (currentFolder === folder.id) navigate(parentId);
		}
	}

	// ── Move project ────────────────────────────────────────────────────────────
	async function moveProject(project, targetFolderId) {
		await fetch(`/api/planograms/${project.id}/folder`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ folder_id: targetFolderId }),
		});
		projects = projects.map(p =>
			p.id === project.id ? { ...p, folder_id: targetFolderId } : p
		);
		moveModal = null;
	}

	// ── Project CRUD ────────────────────────────────────────────────────────────
	async function createProject() {
		if (!newName.trim() || busy) return;
		busy = true; modalError = '';
		try {
			const res = await fetch('/api/planograms', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: newName.trim() }),
			});
			const body = await res.json();
			if (!res.ok) throw new Error(body.message || 'Failed');
			// Place new project in the current folder (if not shared view)
			if (!isSharedView && currentFolder) {
				await fetch(`/api/planograms/${body.id}/folder`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ folder_id: currentFolder }),
				});
			}
			window.location.href = `/planograms/${body.id}`;
		} catch (e) {
			modalError = e.message;
			busy = false;
		}
	}

	async function renameProject() {
		if (!renameModal || !renameModal.name.trim() || busy) return;
		busy = true; modalError = '';
		try {
			const res = await fetch(`/api/planograms/${renameModal.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: renameModal.name.trim() }),
			});
			if (!res.ok) throw new Error('Failed to rename');
			projects = projects.map(p => p.id === renameModal.id ? { ...p, name: renameModal.name.trim() } : p);
			renameModal = null;
		} catch (e) {
			modalError = e.message;
		}
		busy = false;
	}

	async function deleteProject() {
		if (!deleteModal || busy) return;
		busy = true; modalError = '';
		try {
			const res = await fetch(`/api/planograms/${deleteModal.id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error('Failed to delete');
			projects = projects.filter(p => p.id !== deleteModal.id);
			deleteModal = null;
		} catch (e) {
			modalError = e.message;
		}
		busy = false;
	}

	// ── Sharing ────────────────────────────────────────────────────────────────
	async function openShareModal(project) {
		shareTarget = project;
		shareEmail = '';
		shareError = '';
		shares = [];
		const res = await fetch(`/api/planograms/${project.id}/shares`);
		if (res.ok) shares = await res.json();
	}

	async function addShare() {
		if (!shareEmail.trim() || sharing) return;
		sharing = true;
		shareError = '';
		const res = await fetch(`/api/planograms/${shareTarget.id}/shares`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ shared_with_email: shareEmail.trim() }),
		});
		if (res.ok) {
			shares = [...shares, { shared_with_email: shareEmail.trim().toLowerCase() }];
			shareEmail = '';
		} else {
			const body = await res.json().catch(() => ({}));
			shareError = body.message ?? 'Failed to share';
		}
		sharing = false;
	}

	async function removeShare(email) {
		await fetch(`/api/planograms/${shareTarget.id}/shares/${encodeURIComponent(email)}`, { method: 'DELETE' });
		shares = shares.filter(s => s.shared_with_email !== email);
	}

	// ── Date helper ────────────────────────────────────────────────────────────
	function formatDate(iso) {
		if (!iso) return '';
		return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
	}
</script>

<svelte:head>
	<title>Planograms — Product Portal</title>
</svelte:head>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="page">
	<AppNav active="planograms" user={data.user} />

	<div class="body">

		<!-- ── Sidebar ───────────────────────────────────────────────────── -->
		<aside class="sidebar">
			<div class="sidebar-section">
				<button
					class="sidebar-root"
					class:active={currentFolder === null}
					onclick={() => navigate(null)}
				>
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
					</svg>
					{isAdmin ? 'All Planograms' : 'My Planograms'}
				</button>

				<!-- Folder tree -->
				{#each flatTree as folder (folder.id)}
					<div class="folder-row" style="padding-left:{folder.depth * 14 + 10}px">
						{#if renamingId === folder.id}
							<input
								id="rename-{folder.id}"
								class="rename-input"
								bind:value={renameName}
								onblur={() => saveRename(folder)}
								onkeydown={(e) => { if (e.key === 'Enter') saveRename(folder); if (e.key === 'Escape') renamingId = null; }}
							/>
						{:else}
							<button
								class="folder-btn"
								class:active={currentFolder === folder.id}
								onclick={(e) => { e.stopPropagation(); navigate(folder.id); }}
							>
								<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="flex-shrink:0;opacity:0.7">
									<path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"/>
								</svg>
								<span class="folder-name">{folder.name}</span>
								{#if isAdmin}
									<span class="folder-owner">{displayName(folder.created_by)}</span>
								{/if}
							</button>
							<div class="folder-actions">
								<button class="icon-btn" title="New subfolder" onclick={(e) => { e.stopPropagation(); openNewFolder(folder.id); }}>
									<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
								</button>
								<button class="icon-btn" title="Rename" onclick={(e) => { e.stopPropagation(); startRename(folder); }}>
									<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4z"/></svg>
								</button>
								<button class="icon-btn danger" title="Delete folder" onclick={(e) => { e.stopPropagation(); deleteFolder(folder); }}>
									<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
								</button>
							</div>
						{/if}
					</div>
				{/each}

				<!-- New folder input (root level) -->
				{#if showNewFolder && newFolderParentId === null}
					<div class="folder-row" style="padding-left:10px">
						<input
							id="new-folder-input"
							class="rename-input"
							bind:value={newFolderName}
							placeholder="Folder name…"
							onblur={() => showNewFolder = false}
							onkeydown={(e) => {
								if (e.key === 'Enter') { e.preventDefault(); saveNewFolder(); }
								if (e.key === 'Escape') showNewFolder = false;
							}}
						/>
					</div>
				{/if}

				<button class="sidebar-add-folder" onclick={(e) => { e.stopPropagation(); openNewFolder(null); }}>
					<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
					New folder
				</button>
			</div>

			<!-- Shared with me (non-admin only) -->
			{#if !isAdmin && sharedWithMe.length > 0}
				<div class="sidebar-section">
					<button
						class="sidebar-root"
						class:active={currentFolder === 'shared'}
						onclick={() => navigate('shared')}
					>
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
							<path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
						</svg>
						Shared with me
						<span class="badge">{sharedWithMe.length}</span>
					</button>
				</div>
			{/if}
		</aside>

		<!-- ── Main content ────────────────────────────────────────────────── -->
		<main class="main">

			<!-- Page header -->
			<div class="page-header">
				<div class="header-left">
					{#if isSharedView}
						<h1 class="page-title">Shared with me</h1>
					{:else}
						<nav class="breadcrumb">
							<button class="bc-item bc-link" onclick={() => navigate(null)}>
								{isAdmin ? 'All Planograms' : 'My Planograms'}
							</button>
							{#each breadcrumb as f}
								<span class="bc-sep">›</span>
								<button class="bc-item bc-link" onclick={() => navigate(f.id)}>{f.name}</button>
							{/each}
						</nav>
					{/if}
				</div>
				{#if !isSharedView}
					<div class="header-actions">
						{#if currentFolder !== null}
							<button class="btn-ghost" onclick={(e) => { e.stopPropagation(); openNewFolder(currentFolder); }}>
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
								Folder
							</button>
						{/if}
						<button class="btn-primary" onclick={() => { newName = ''; modalError = ''; showNewModal = true; }}>
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
							Planogram
						</button>
					</div>
				{/if}
			</div>

			<!-- Subfolder chips -->
			{#if !isSharedView && subFolders.length > 0}
				<div class="folder-chips">
					{#each subFolders as f (f.id)}
						<button class="folder-chip" onclick={() => navigate(f.id)}>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="#F5A632" stroke="none">
								<path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"/>
							</svg>
							{f.name}
						</button>
					{/each}
				</div>
			{/if}

			<!-- New subfolder inline input -->
			{#if showNewFolder && newFolderParentId !== null}
				<div class="folder-chips">
					<div class="folder-chip-input-wrap">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="#F5A632" stroke="none">
							<path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"/>
						</svg>
						<input
							id="new-folder-input"
							class="folder-chip-input"
							bind:value={newFolderName}
							placeholder="Folder name…"
							onblur={() => showNewFolder = false}
							onkeydown={(e) => {
								if (e.key === 'Enter') { e.preventDefault(); saveNewFolder(); }
								if (e.key === 'Escape') showNewFolder = false;
							}}
						/>
					</div>
				</div>
			{/if}

			<!-- Empty state -->
			{#if viewProjects.length === 0 && subFolders.length === 0 && !showNewFolder}
				<div class="empty-state">
					<div class="empty-icon">
						{#if isSharedView}
							<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
								<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
								<path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
							</svg>
						{:else}
							<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
								<rect x="2" y="7" width="20" height="2" rx="1"/>
								<rect x="2" y="13" width="20" height="2" rx="1"/>
								<rect x="2" y="4" width="20" height="16" rx="2" fill="none"/>
							</svg>
						{/if}
					</div>
					<p class="empty-title">
						{#if isSharedView}No planograms shared with you yet
						{:else if currentFolder}This folder is empty
						{:else}No planogram projects yet{/if}
					</p>
					{#if !isSharedView}
						<p class="empty-sub">Create your first shelf layout to get started</p>
						<button class="btn-primary" onclick={() => { newName = ''; modalError = ''; showNewModal = true; }}>Create project</button>
					{/if}
				</div>
			{:else}
				<!-- Project grid -->
				<div class="grid">
					{#each viewProjects as project (project.id)}
						<div class="card">
							<a href="/planograms/{project.id}" class="card-main">
								<div class="card-preview">
									<svg width="52" height="48" viewBox="0 0 52 48" fill="none">
										<rect x="7" y="6" width="38" height="36" fill="#e8e4da"/>
										<rect x="2" y="2" width="5" height="44" rx="1.5" fill="#c9a96e"/>
										<rect x="45" y="2" width="5" height="44" rx="1.5" fill="#c9a96e"/>
										<rect x="2" y="2" width="48" height="5" rx="1.5" fill="#c9a96e"/>
										<rect x="2" y="41" width="48" height="5" rx="1.5" fill="#c9a96e"/>
										<rect x="7" y="17" width="38" height="3.5" rx="1" fill="#c9a96e"/>
										<rect x="7" y="30" width="38" height="3.5" rx="1" fill="#c9a96e"/>
									</svg>
								</div>
								<div class="card-info">
									<div class="card-name">{project.name}</div>
									<div class="card-meta">
										Updated {formatDate(project.updated_at)}
										{#if isAdmin && project.created_by}
											<span class="created-by">· {displayName(project.created_by)}</span>
										{/if}
										{#if isSharedView && project.shared_by_email}
											<span class="created-by">from {displayName(project.shared_by_email)}</span>
										{/if}
									</div>
								</div>
							</a>

							<div class="card-footer">
								<a href="/planograms/{project.id}" class="icon-action" aria-label="Open" data-tip="Open">
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
										<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
										<path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
									</svg>
								</a>

								{#if !isSharedView}
									<button class="icon-action" onclick={(e) => { e.stopPropagation(); openShareModal(project); }} aria-label="Share" data-tip="Share">
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
											<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
											<line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
										</svg>
									</button>

									<button class="icon-action" onclick={(e) => { e.stopPropagation(); moveModal = project; }} aria-label="Move to folder" data-tip="Move to folder">
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
											<path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"/>
										</svg>
									</button>

									<button class="icon-action" onclick={() => { renameModal = { id: project.id, name: project.name }; modalError = ''; }} aria-label="Rename" data-tip="Rename">
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
											<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4z"/>
										</svg>
									</button>

									<button class="icon-action danger" style="margin-left:auto" onclick={() => { deleteModal = { id: project.id, name: project.name }; modalError = ''; }} aria-label="Delete" data-tip="Delete">
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
											<polyline points="3 6 5 6 21 6"/>
											<path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
											<path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
										</svg>
									</button>
								{/if}
							</div>
						</div>
					{/each}

					<!-- New project dashed card (only if not shared view) -->
					{#if !isSharedView}
						<button class="card card-new" onclick={() => { newName = ''; modalError = ''; showNewModal = true; }}>
							<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
								<path d="M12 5v14M5 12h14" stroke="#ccc" stroke-width="2" stroke-linecap="round"/>
							</svg>
							<span>New project</span>
						</button>
					{/if}
				</div>
			{/if}
		</main>
	</div>
</div>

<!-- ── New project modal ─────────────────────────────────────────────────────── -->
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
			{#if modalError}<p class="error-text">{modalError}</p>{/if}
			<div class="dialog-buttons">
				<button class="btn-cancel" onclick={() => showNewModal = false}>Cancel</button>
				<button class="btn-primary" onclick={createProject} disabled={!newName.trim() || busy}>
					{busy ? 'Creating…' : 'Create project →'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- ── Rename modal ───────────────────────────────────────────────────────────── -->
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
			{#if modalError}<p class="error-text">{modalError}</p>{/if}
			<div class="dialog-buttons">
				<button class="btn-cancel" onclick={() => renameModal = null}>Cancel</button>
				<button class="btn-primary" onclick={renameProject} disabled={!renameModal.name.trim() || busy}>
					{busy ? 'Saving…' : 'Save'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- ── Delete modal ───────────────────────────────────────────────────────────── -->
{#if deleteModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) deleteModal = null; }}>
		<div class="dialog">
			<h2>Delete project?</h2>
			<p class="dialog-body">This will permanently delete <strong>{deleteModal.name}</strong> and all its shelf layouts and photos. This cannot be undone.</p>
			{#if modalError}<p class="error-text">{modalError}</p>{/if}
			<div class="dialog-buttons">
				<button class="btn-cancel" onclick={() => deleteModal = null}>Cancel</button>
				<button class="btn-danger" onclick={deleteProject} disabled={busy}>
					{busy ? 'Deleting…' : 'Delete project'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- ── Move modal ───────────────────────────────────────────────────────────── -->
{#if moveModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) moveModal = null; }}>
		<div class="modal move-modal">
			<button class="modal-close" onclick={() => moveModal = null}>✕</button>
			<h2>Move to folder</h2>
			<p class="modal-sub">"{moveModal.name}"</p>

			<div class="move-list">
				<!-- Root option -->
				<button
					class="move-row"
					class:move-row-active={(moveModal.folder_id ?? null) === null}
					onclick={() => moveProject(moveModal, null)}
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="move-row-icon">
						<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
					</svg>
					<span class="move-row-name">{isAdmin ? 'All Planograms' : 'My Planograms'}</span>
					{#if (moveModal.folder_id ?? null) === null}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="move-row-check">
							<polyline points="20 6 9 17 4 12"/>
						</svg>
					{/if}
				</button>

				{#if flatTree.length > 0}
					<div class="move-divider"></div>
					{#each flatTree as f (f.id)}
						<button
							class="move-row"
							class:move-row-active={(moveModal.folder_id ?? null) === f.id}
							style="padding-left:{f.depth * 18 + 16}px"
							onclick={() => moveProject(moveModal, f.id)}
						>
							<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none" class="move-row-icon" style="opacity:{(moveModal.folder_id ?? null) === f.id ? 1 : 0.55}">
								<path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"/>
							</svg>
							<span class="move-row-name">{f.name}</span>
							{#if (moveModal.folder_id ?? null) === f.id}
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="move-row-check">
									<polyline points="20 6 9 17 4 12"/>
								</svg>
							{/if}
						</button>
					{/each}
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- ── Share modal ───────────────────────────────────────────────────────────── -->
{#if shareTarget}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) shareTarget = null; }}>
		<div class="modal">
			<button class="modal-close" onclick={() => shareTarget = null}>✕</button>
			<h2>Share "{shareTarget.name}"</h2>
			<p class="modal-sub">Enter the email address of a portal user to give them view access.</p>

			<div class="share-input-row">
				<input
					class="share-input"
					type="email"
					placeholder="colleague@company.com"
					bind:value={shareEmail}
					onkeydown={(e) => e.key === 'Enter' && addShare()}
				/>
				<button class="btn-share" onclick={addShare} disabled={!shareEmail.trim() || sharing}>
					{sharing ? 'Sharing…' : 'Share'}
				</button>
			</div>
			{#if shareError}
				<p class="share-error">{shareError}</p>
			{/if}

			{#if shares.length > 0}
				<div class="share-list">
					<p class="share-list-label">Shared with</p>
					{#each shares as s (s.shared_with_email)}
						<div class="share-row">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="color:#A1A1AA;flex-shrink:0">
								<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
							</svg>
							<span class="share-email">{s.shared_with_email}</span>
							<button class="share-remove" onclick={() => removeShare(s.shared_with_email)} title="Remove access">✕</button>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* ── Layout ── */
	.page { min-height: 100vh; display: flex; flex-direction: column; }

	.body {
		flex: 1;
		display: flex;
		max-width: 1240px;
		margin: 0 auto;
		width: 100%;
		padding: 0 20px 80px;
		gap: 0;
	}

	/* ── Sidebar ── */
	.sidebar {
		width: 220px;
		flex-shrink: 0;
		padding: 28px 0 0;
		border-right: 1px solid #E8E4DC;
		margin-right: 28px;
	}

	.sidebar-section { margin-bottom: 8px; }

	.sidebar-root {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 7px 12px;
		border: none;
		background: none;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 600;
		color: #52525B;
		cursor: pointer;
		text-align: left;
		transition: background 0.12s, color 0.12s;
		font-family: inherit;
	}
	.sidebar-root:hover { background: #F5F4F0; color: #18181B; }
	.sidebar-root.active { background: #FFF5EE; color: #F57832; }

	.badge {
		margin-left: auto;
		background: #F5F4F0;
		color: #71717A;
		font-size: 10px;
		font-weight: 700;
		padding: 1px 6px;
		border-radius: 100px;
	}
	.sidebar-root.active .badge { background: #FDDCC4; color: #C05621; }

	.folder-row {
		display: flex;
		align-items: center;
		gap: 2px;
		min-height: 30px;
	}

	.folder-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		flex: 1;
		min-width: 0;
		padding: 5px 8px 5px 0;
		border: none;
		background: none;
		border-radius: 6px;
		font-size: 12.5px;
		font-weight: 500;
		color: #52525B;
		cursor: pointer;
		text-align: left;
		transition: background 0.12s, color 0.12s;
		font-family: inherit;
	}
	.folder-btn:hover { color: #18181B; }
	.folder-btn.active { color: #F57832; font-weight: 600; }
	.folder-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }

	.folder-owner {
		font-size: 10px;
		font-weight: 600;
		color: #C4B99A;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.folder-actions {
		display: none;
		gap: 1px;
		flex-shrink: 0;
	}
	.folder-row:hover .folder-actions { display: flex; }

	.icon-btn {
		width: 22px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: none;
		border-radius: 4px;
		cursor: pointer;
		color: #A1A1AA;
		transition: background 0.12s, color 0.12s;
		padding: 0;
	}
	.icon-btn:hover { background: #F5F4F0; color: #18181B; }
	.icon-btn.danger:hover { background: #FEF2F2; color: #DC2626; }

	.rename-input {
		flex: 1;
		font-size: 12.5px;
		border: 1px solid #F57832;
		border-radius: 5px;
		padding: 3px 7px;
		outline: none;
		font-family: inherit;
		color: #18181B;
		min-width: 0;
	}

	.sidebar-add-folder {
		display: flex;
		align-items: center;
		gap: 5px;
		margin: 4px 0 0 10px;
		border: none;
		background: none;
		color: #A1A1AA;
		font-size: 11.5px;
		cursor: pointer;
		padding: 4px 6px;
		border-radius: 6px;
		font-family: inherit;
		transition: color 0.12s, background 0.12s;
	}
	.sidebar-add-folder:hover { color: #F57832; background: #FFF5EE; }

	/* ── Main ── */
	.main {
		flex: 1;
		min-width: 0;
		padding: 28px 0 0;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 20px;
		gap: 16px;
		flex-wrap: wrap;
	}

	.header-actions { display: flex; gap: 8px; align-items: center; }

	.breadcrumb {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-wrap: wrap;
	}

	.bc-item { font-size: 16px; font-weight: 700; letter-spacing: -0.3px; }
	.bc-link {
		border: none;
		background: none;
		cursor: pointer;
		color: #A1A1AA;
		padding: 0;
		font-family: inherit;
		transition: color 0.12s;
	}
	.bc-link:hover { color: #18181B; }
	.bc-link:last-child { color: #18181B; cursor: default; }
	.bc-sep { color: #D4CEBC; font-size: 16px; }

	.page-title { font-size: 18px; font-weight: 700; color: #18181B; letter-spacing: -0.3px; }

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
		font-family: inherit;
	}
	.btn-primary:hover:not(:disabled) { background: #E06820; }
	.btn-primary:disabled { opacity: 0.6; cursor: default; }

	.btn-ghost {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 9px 18px;
		background: white;
		color: #52525B;
		border-radius: 10px;
		font-size: 13px;
		font-weight: 700;
		border: 1px solid #E8E4DC;
		cursor: pointer;
		transition: background 0.15s;
		white-space: nowrap;
		flex-shrink: 0;
		font-family: inherit;
	}
	.btn-ghost:hover { background: #F5F4F0; }

	/* ── Folder chips ── */
	.folder-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 20px;
	}

	.folder-chip {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 7px 14px 7px 10px;
		background: white;
		border: 1.5px solid #E8E4DC;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 600;
		color: #52525B;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s;
		font-family: inherit;
	}
	.folder-chip:hover { background: #FFFBF5; border-color: #F5A632; color: #18181B; }

	.folder-chip-input-wrap {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 6px 10px;
		background: white;
		border: 1.5px solid #F57832;
		border-radius: 8px;
	}

	.folder-chip-input {
		border: none;
		outline: none;
		font-size: 13px;
		font-weight: 600;
		font-family: inherit;
		color: #18181B;
		width: 140px;
		background: transparent;
	}

	/* ── Empty state ── */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 80px 20px;
		text-align: center;
	}
	.empty-icon {
		width: 52px; height: 52px;
		background: white;
		border: 1px solid #E8E4DC;
		border-radius: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #A1A1AA;
		margin-bottom: 4px;
	}
	.empty-title { font-size: 15px; font-weight: 700; color: #52525B; }
	.empty-sub { font-size: 13px; color: #A89060; }

	/* ── Project grid ── */
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 16px;
	}

	.card {
		background: white;
		border: 1.5px solid #E8E4DC;
		border-radius: 14px;
		overflow: visible;
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
		border-radius: 14px 14px 0 0;
		overflow: hidden;
	}

	.card-preview {
		background: #F5F4F0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		border-bottom: 1px solid #EDE9E3;
	}

	.card-info { padding: 14px 16px 10px; }

	.card-name {
		font-size: 14px;
		font-weight: 700;
		color: #18181B;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.card-meta { font-size: 12px; color: #A89060; margin-top: 3px; }
	.created-by { color: #C4B99A; font-size: 11.5px; }

	.card-footer {
		display: flex;
		align-items: center;
		gap: 1px;
		padding: 6px 8px 8px;
		border-top: 1px solid #F0EDE8;
	}

	.icon-action {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 7px;
		color: #71717A;
		background: none;
		border: none;
		text-decoration: none;
		transition: background 0.15s, color 0.15s;
		cursor: pointer;
		font-family: inherit;
		flex-shrink: 0;
	}
	.icon-action:hover { background: #F5F4F0; color: #18181B; }
	.icon-action.danger { color: #D4D4D8; }
	.icon-action.danger:hover { background: #FEF2F2; color: #DC2626; }

	/* Tooltip */
	.icon-action::after {
		content: attr(data-tip);
		position: absolute;
		bottom: calc(100% + 6px);
		left: 50%;
		transform: translateX(-50%);
		background: #18181B;
		color: white;
		font-size: 11px;
		font-weight: 500;
		white-space: nowrap;
		padding: 4px 8px;
		border-radius: 5px;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.15s;
		font-family: inherit;
		z-index: 10;
	}
	.icon-action:hover::after { opacity: 1; }

	/* ── Move modal ── */
	.move-modal { max-width: 360px; padding: 24px; }
	.move-modal h2 { font-size: 15px; font-weight: 700; }
	.move-modal .modal-sub { font-size: 13px; color: #71717A; margin: 2px 0 16px; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

	.move-list {
		display: flex;
		flex-direction: column;
		gap: 1px;
		max-height: 320px;
		overflow-y: auto;
	}

	.move-divider {
		height: 1px;
		background: #F5F4F0;
		margin: 4px 0;
	}

	.move-row {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 9px 12px;
		border: none;
		background: none;
		border-radius: 8px;
		font-size: 13.5px;
		font-weight: 500;
		color: #52525B;
		cursor: pointer;
		text-align: left;
		font-family: inherit;
		transition: background 0.12s, color 0.12s;
	}
	.move-row:hover { background: #F5F4F0; color: #18181B; }
	.move-row-active { background: #FFF5EE !important; color: #F57832 !important; font-weight: 600; }

	.move-row-icon { flex-shrink: 0; color: #C4A882; }
	.move-row-active .move-row-icon { color: #F57832; opacity: 1 !important; }

	.move-row-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	.move-row-check { color: #F57832; flex-shrink: 0; }

	/* ── New project card ── */
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
	.card-new:hover svg path { stroke: #A89060; }

	/* ── Overlay & dialogs ── */
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 200;
		backdrop-filter: blur(2px);
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
	.dialog-body { font-size: 14px; color: #52525B; line-height: 1.5; }

	.field { display: flex; flex-direction: column; gap: 6px; }
	.field label { font-size: 12px; font-weight: 600; color: #52525B; }
	.field input {
		padding: 10px 12px;
		border: 1.5px solid #E0DBD2;
		border-radius: 10px;
		font-size: 14px;
		outline: none;
		transition: border-color 0.15s;
		font-family: inherit;
	}
	.field input:focus { border-color: #F57832; }

	.dialog-buttons { display: flex; justify-content: flex-end; gap: 8px; }

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
		font-family: inherit;
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
		font-family: inherit;
	}
	.btn-danger:hover:not(:disabled) { background: #B91C1C; }
	.btn-danger:disabled { opacity: 0.6; cursor: default; }

	.error-text { font-size: 13px; color: #DC2626; }

	/* ── Share modal ── */
	.modal {
		background: white;
		border-radius: 14px;
		padding: 28px;
		width: 420px;
		max-width: 94vw;
		position: relative;
		box-shadow: 0 20px 60px rgba(0,0,0,0.15);
	}

	.modal-close {
		position: absolute;
		top: 16px;
		right: 16px;
		width: 28px;
		height: 28px;
		border: none;
		background: #F4F4F5;
		border-radius: 50%;
		font-size: 14px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #71717A;
	}
	.modal-close:hover { background: #E4E4E7; }

	.modal h2 { font-size: 16px; font-weight: 700; color: #18181B; margin: 0 0 6px; }
	.modal-sub { font-size: 13px; color: #71717A; margin: 0 0 18px; }

	.share-input-row { display: flex; gap: 8px; }

	.share-input {
		flex: 1;
		padding: 8px 12px;
		border: 1px solid #E4E4E7;
		border-radius: 8px;
		font-size: 13px;
		outline: none;
		font-family: inherit;
		color: #18181B;
	}
	.share-input:focus { border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,0.12); }

	.btn-share {
		padding: 8px 16px;
		background: #F57832;
		color: white;
		border: none;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
		transition: background 0.15s;
		white-space: nowrap;
	}
	.btn-share:hover:not(:disabled) { background: #E06820; }
	.btn-share:disabled { opacity: 0.5; cursor: default; }

	.share-error { font-size: 12px; color: #DC2626; margin: 8px 0 0; }

	.share-list { margin-top: 20px; border-top: 1px solid #F4F4F5; padding-top: 14px; }
	.share-list-label { font-size: 11px; font-weight: 700; color: #A1A1AA; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 10px; }

	.share-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 0;
		border-bottom: 1px solid #F4F4F5;
	}
	.share-row:last-child { border-bottom: none; }

	.share-email { flex: 1; font-size: 13px; color: #18181B; }

	.share-remove {
		border: none;
		background: none;
		color: #A1A1AA;
		cursor: pointer;
		font-size: 13px;
		padding: 2px 6px;
		border-radius: 5px;
		transition: background 0.12s, color 0.12s;
	}
	.share-remove:hover { background: #FEF2F2; color: #DC2626; }
</style>
