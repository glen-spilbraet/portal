<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	const LANG_LABELS = { en: 'English', da: 'Dansk', sv: 'Svenska', no: 'Norsk' };

	// ── State ──────────────────────────────────────────────────────────────────
	let catalogues    = $state(data.catalogues);
	let folders       = $state(data.folders);
	let sharedWithMe  = $state(data.sharedWithMe);
	const isAdmin     = data.isAdmin;
	const userNames   = data.userNames ?? {};
	function displayName(email) { return userNames[email] ?? email?.split('@')[0] ?? email; }

	// Navigation: null = root, 'shared' = Shared with me, uuid = folder id
	let currentFolder = $state(null);

	// New folder creation
	let newFolderName     = $state('');
	let newFolderParentId = $state(null);
	let showNewFolder     = $state(false);
	let savingFolder      = $state(false);

	// Inline folder rename
	let renamingId   = $state(null);
	let renameName   = $state('');

	// Move catalogue to folder
	let moveModal = $state(null); // catalogue object being moved

	// Share modal
	let shareTarget = $state(null); // catalogue object
	let shares      = $state([]);
	let shareEmail  = $state('');
	let shareError  = $state('');
	let sharing     = $state(false);

	// ── Folder tree helpers ────────────────────────────────────────────────────
	/** Flat pre-order list with depth for indentation */
	function buildFlatTree(allFolders, parentId = null, depth = 0) {
		return allFolders
			.filter(f => (f.parent_id ?? null) === parentId)
			.sort((a, b) => a.name.localeCompare(b.name))
			.flatMap(f => [{ ...f, depth }, ...buildFlatTree(allFolders, f.id, depth + 1)]);
	}

	const flatTree = $derived(buildFlatTree(folders));

	/** Ancestors of a folder id, root-first */
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

	/** Direct children folders of the current location */
	const subFolders = $derived(
		currentFolder === 'shared'
			? []
			: folders.filter(f => (f.parent_id ?? null) === (currentFolder ?? null))
				.sort((a, b) => a.name.localeCompare(b.name))
	);

	/** Catalogues to display in the main area */
	const viewCatalogues = $derived(
		currentFolder === 'shared'
			? sharedWithMe
			: catalogues.filter(c => (c.folder_id ?? null) === (currentFolder ?? null))
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
		const res = await fetch('/api/catalogues/folders', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: newFolderName.trim(), parent_id: newFolderParentId }),
		});
		if (res.ok) {
			const folder = await res.json();
			folders = [...folders, folder];
			// Navigate into the new folder if we created it at the current level
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
		await fetch(`/api/catalogues/folders/${folder.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: renameName.trim() }),
		});
		folders = folders.map(f => f.id === folder.id ? { ...f, name: renameName.trim() } : f);
		renamingId = null;
	}

	async function deleteFolder(folder) {
		if (!confirm(`Delete folder "${folder.name}"?\n\nIts contents will move to the parent folder.`)) return;
		const res = await fetch(`/api/catalogues/folders/${folder.id}`, { method: 'DELETE' });
		if (res.ok) {
			// Move children and catalogues to parent in local state
			const parentId = folder.parent_id ?? null;
			folders = folders
				.filter(f => f.id !== folder.id)
				.map(f => f.parent_id === folder.id ? { ...f, parent_id: parentId } : f);
			catalogues = catalogues.map(c =>
				c.folder_id === folder.id ? { ...c, folder_id: parentId } : c
			);
			if (currentFolder === folder.id) navigate(parentId);
		}
	}

	// ── Move catalogue ──────────────────────────────────────────────────────────
	async function moveCatalogue(cat, targetFolderId) {
		await fetch(`/api/catalogues/${cat.id}/folder`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ folder_id: targetFolderId }),
		});
		catalogues = catalogues.map(c =>
			c.id === cat.id ? { ...c, folder_id: targetFolderId } : c
		);
		moveModal = null;
	}

	// ── Delete catalogue ────────────────────────────────────────────────────────
	async function deleteCatalogue(id, name) {
		if (!confirm(`Delete catalogue "${name}"? This cannot be undone.`)) return;
		const res = await fetch(`/api/catalogues/${id}`, { method: 'DELETE' });
		if (res.ok) {
			catalogues = catalogues.filter(c => c.id !== id);
		}
	}

	// ── Duplicate catalogue ─────────────────────────────────────────────────────
	let duplicating = $state(null); // catalogue id currently being duplicated

	async function duplicateCatalogue(cat) {
		if (duplicating) return;
		duplicating = cat.id;
		try {
			const res = await fetch(`/api/catalogues/${cat.id}/duplicate`, { method: 'POST' });
			if (!res.ok) throw new Error('Failed to duplicate');
			const { id } = await res.json();
			const idx  = catalogues.findIndex(c => c.id === cat.id);
			const copy = { ...cat, id, name: `COPY: ${cat.name}`, share_token: null };
			catalogues = [...catalogues.slice(0, idx + 1), copy, ...catalogues.slice(idx + 1)];
		} catch (e) {
			alert(e.message);
		} finally {
			duplicating = null;
		}
	}

	// ── Sharing ────────────────────────────────────────────────────────────────
	async function openShareModal(cat) {
		shareTarget = cat;
		shareEmail = '';
		shareError = '';
		shares = [];
		const res = await fetch(`/api/catalogues/${cat.id}/shares`);
		if (res.ok) shares = await res.json();
	}

	async function addShare() {
		if (!shareEmail.trim() || sharing) return;
		sharing = true;
		shareError = '';
		const res = await fetch(`/api/catalogues/${shareTarget.id}/shares`, {
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
		await fetch(`/api/catalogues/${shareTarget.id}/shares/${encodeURIComponent(email)}`, { method: 'DELETE' });
		shares = shares.filter(s => s.shared_with_email !== email);
	}

	// ── Date helper ────────────────────────────────────────────────────────────
	function formatDate(ts) {
		return new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
	}
</script>

<svelte:head>
	<title>Catalogues — Product Portal</title>
</svelte:head>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="page">
	<AppNav active="catalogues" user={data.user} />

	<div class="body">

		<!-- ── Sidebar ───────────────────────────────────────────────────── -->
		<aside class="sidebar">
			<!-- My Catalogues root -->
			<div class="sidebar-section">
				<button
					class="sidebar-root"
					class:active={currentFolder === null}
					onclick={() => navigate(null)}
				>
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
					</svg>
					{isAdmin ? 'All Catalogues' : 'My Catalogues'}
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

				<!-- New folder input -->
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
								{isAdmin ? 'All Catalogues' : 'My Catalogues'}
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
						{#if currentFolder !== null && !isSharedView}
							<button class="btn-ghost" onclick={(e) => { e.stopPropagation(); openNewFolder(currentFolder); }}>
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
								New folder
							</button>
						{/if}
						<a href="/catalogues/new" class="btn-new">
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
							New Catalogue
						</a>
					</div>
				{/if}
			</div>

			<!-- Subfolder cards in main area -->
			{#if !isSharedView && subFolders.length > 0}
				<div class="folder-chips">
					{#each subFolders as f (f.id)}
						<button class="folder-chip" ondblclick={() => navigate(f.id)} onclick={() => navigate(f.id)}>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="#F5A632" stroke="none">
								<path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"/>
							</svg>
							{f.name}
						</button>
					{/each}
				</div>
			{/if}

			<!-- New folder inline input (for inside a folder) -->
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

			<!-- Catalogue grid -->
			{#if viewCatalogues.length === 0 && subFolders.length === 0 && !showNewFolder}
				<div class="empty">
					<div class="empty-icon">
						{#if isSharedView}
							<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
								<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
								<path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
							</svg>
						{:else}
							<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
								<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
							</svg>
						{/if}
					</div>
					<p class="empty-title">
						{#if isSharedView}No catalogues shared with you yet
						{:else if currentFolder}This folder is empty
						{:else}No catalogues yet{/if}
					</p>
					{#if !isSharedView}
						<p class="empty-sub">Create your first catalogue to bundle sheets for customers.</p>
						<a href="/catalogues/new" class="btn-new">
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
							New Catalogue
						</a>
					{/if}
				</div>
			{:else}
				<div class="grid">
					{#each viewCatalogues as cat (cat.id)}
						<div class="card">
							<div class="card-body">
								<div class="card-meta">
									<span class="lang-badge">{LANG_LABELS[cat.language] ?? cat.language}</span>
									{#if isAdmin && cat.created_by}
										<span class="owner-badge">{displayName(cat.created_by)}</span>
									{/if}
									{#if isSharedView && cat.shared_by_email}
										<span class="shared-by">from {displayName(cat.shared_by_email)}</span>
									{/if}
								</div>
								<h2>{cat.name || '(untitled)'}</h2>
								{#if cat.title}
									<p class="cat-title">{cat.title}</p>
								{/if}
								<p class="date">Updated {formatDate(cat.updated_at)}</p>
							</div>

							<div class="card-footer">
								{#if !isSharedView}
									<a href="/catalogues/{cat.id}" class="icon-action" aria-label="Edit" data-tip="Edit">
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
											<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
											<path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
										</svg>
									</a>
								{/if}
								<a href="/catalogues/{cat.id}/preview" target="_blank" class="icon-action" aria-label="Preview" data-tip="Preview">
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
										<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
										<polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
									</svg>
								</a>

								{#if !isSharedView}
									<button class="icon-action" onclick={(e) => { e.stopPropagation(); openShareModal(cat); }} aria-label="Share" data-tip="Share">
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
											<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
											<line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
										</svg>
									</button>

									<button class="icon-action" onclick={(e) => { e.stopPropagation(); moveModal = cat; }} aria-label="Move to folder" data-tip="Move to folder">
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
											<path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"/>
										</svg>
									</button>

									<button class="icon-action" onclick={(e) => { e.stopPropagation(); duplicateCatalogue(cat); }} aria-label="Duplicate" data-tip="Duplicate" disabled={duplicating === cat.id}>
										{#if duplicating === cat.id}
											<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 0.7s linear infinite"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
										{:else}
											<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
												<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
											</svg>
										{/if}
									</button>

									<button class="icon-action danger" style="margin-left:auto" onclick={() => deleteCatalogue(cat.id, cat.name)} aria-label="Delete" data-tip="Delete">
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
				</div>
			{/if}
		</main>
	</div>
</div>

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
					onclick={() => moveCatalogue(moveModal, null)}
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="move-row-icon">
						<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
					</svg>
					<span class="move-row-name">{isAdmin ? 'All Catalogues' : 'My Catalogues'}</span>
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
							onclick={() => moveCatalogue(moveModal, f.id)}
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

<!-- ── Share modal ──────────────────────────────────────────────────────────── -->
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
	@keyframes spin { to { transform: rotate(360deg); } }

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
		border-right: 1px solid var(--border);
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
	.sidebar-root:hover { background: #F4F4F5; color: #18181B; }
	.sidebar-root.active { background: #FFF5EE; color: #F57832; }

	.badge {
		margin-left: auto;
		background: #F4F4F5;
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
	.icon-btn:hover { background: #F4F4F5; color: #18181B; }
	.icon-btn.danger:hover { background: #FEF2F2; color: var(--danger); }

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

	.bc-item {
		font-size: 16px;
		font-weight: 700;
		letter-spacing: -0.3px;
	}

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

	.bc-sep { color: #D4D4D8; font-size: 16px; }

	.page-title {
		font-size: 18px;
		font-weight: 700;
		color: #18181B;
		letter-spacing: -0.3px;
	}

	.btn-new {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 16px;
		background: #F57832;
		color: white;
		border-radius: 100px;
		font-size: 13px;
		font-weight: 600;
		text-decoration: none;
		border: none;
		cursor: pointer;
		transition: background 0.15s;
		font-family: inherit;
	}
	.btn-new:hover { background: #E06820; }

	.btn-ghost {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 14px;
		background: white;
		color: #52525B;
		border-radius: 100px;
		font-size: 13px;
		font-weight: 600;
		border: 1px solid var(--border);
		cursor: pointer;
		transition: background 0.15s;
		font-family: inherit;
	}
	.btn-ghost:hover { background: #F4F4F5; }

	/* ── Folder chips in main ── */
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
		border: 1px solid var(--border);
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
	.empty {
		text-align: center;
		padding: 80px 24px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
	}

	.empty-icon {
		width: 52px;
		height: 52px;
		background: white;
		border: 1px solid var(--border);
		border-radius: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #A1A1AA;
		margin-bottom: 4px;
	}

	.empty-title { font-size: 15px; font-weight: 700; color: #18181B; }
	.empty-sub { font-size: 13px; color: #71717A; }

	/* ── Catalogue grid ── */
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 16px;
	}

	.card {
		background: white;
		border-radius: var(--radius-lg);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		transition: box-shadow 0.2s, transform 0.15s;
	}
	.card:hover { box-shadow: var(--shadow-lg); transform: translateY(-1px); }

	.card-body {
		padding: 16px 18px 10px;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.card-meta { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; flex-wrap: wrap; }

	.lang-badge {
		font-size: 10px;
		font-weight: 700;
		padding: 2px 8px;
		border-radius: 100px;
		background: #EFF6FF;
		color: #1D4ED8;
		text-transform: uppercase;
		letter-spacing: 0.4px;
	}

	.owner-badge {
		font-size: 10px;
		font-weight: 600;
		padding: 2px 7px;
		border-radius: 100px;
		background: #F4F4F5;
		color: #71717A;
	}

	.shared-by {
		font-size: 10px;
		font-weight: 600;
		color: #A1A1AA;
	}

	h2 {
		font-size: 15px;
		font-weight: 700;
		color: #18181B;
		line-height: 1.3;
		letter-spacing: -0.2px;
	}

	.cat-title { font-size: 12.5px; color: #71717A; line-height: 1.4; }
	.date { font-size: 11px; color: #A1A1AA; font-weight: 500; margin-top: 2px; }

	.card-footer {
		padding: 6px 10px 8px;
		display: flex;
		gap: 1px;
		align-items: center;
		border-top: 1px solid var(--border);
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
	.icon-action:hover { background: #F4F4F5; color: #18181B; }
	.icon-action.danger { color: #D4D4D8; }
	.icon-action.danger:hover { background: #FEF2F2; color: var(--danger); }

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
		background: #F4F4F5;
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
	.move-row:hover { background: #F4F4F5; color: #18181B; }
	.move-row-active { background: #FFF5EE !important; color: #F57832 !important; font-weight: 600; }
	.move-row-active .move-row-icon { color: #F57832; }

	.move-row-icon { flex-shrink: 0; color: #C4A882; }
	.move-row-active .move-row-icon { color: #F57832; opacity: 1 !important; }

	.move-row-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	.move-row-check { color: #F57832; flex-shrink: 0; }

	/* ── Share modal ── */
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 200;
		backdrop-filter: blur(2px);
	}

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

	.share-error { font-size: 12px; color: var(--danger); margin: 8px 0 0; }

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
	.share-remove:hover { background: #FEF2F2; color: var(--danger); }
</style>
