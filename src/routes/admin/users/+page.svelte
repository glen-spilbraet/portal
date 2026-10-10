<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	let users = $state(data.users);
	let permissionSets = $state(data.permissionSets);
	let newEmail = $state('');
	let newFirstName = $state('');
	let newRole = $state('user');
	let newPermSetId = $state('');
	let busy = $state(false);
	let error = $state('');

	function formatDate(iso) {
		if (!iso) return '';
		return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	function psName(id) {
		if (!id) return 'Full access';
		return permissionSets.find(p => p.id === id)?.name ?? 'Unknown';
	}

	async function addUser() {
		const email = newEmail.trim().toLowerCase();
		if (!email || busy) return;
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { error = 'Enter a valid email address'; return; }
		busy = true; error = '';
		try {
			const res = await fetch('/api/admin/users', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, role: newRole, first_name: newFirstName.trim() || null, permission_set_id: newPermSetId || null }),
			});
			if (!res.ok) throw new Error((await res.json()).message ?? 'Failed');
			const added = await res.json();
			users = [...users, added];
			newEmail = ''; newFirstName = ''; newRole = 'user'; newPermSetId = '';
		} catch (e) { error = e.message; }
		busy = false;
	}

	// ── Row actions menu + edit modal ─────────────────────────────────────────────
	let menuFor = $state('');       // email whose ⋯ menu is open
	let editOpen = $state(false);
	let editForm = $state(null);    // { email, first_name, send_from, role, permission_set_id }

	function toggleMenu(email, e) { e.stopPropagation(); menuFor = menuFor === email ? '' : email; }
	function openEdit(u) {
		editForm = { email: u.email, first_name: u.first_name ?? '', send_from: u.send_from ?? '', role: u.role, permission_set_id: u.permission_set_id ?? '' };
		menuFor = ''; error = ''; editOpen = true;
	}
	const isSelf = (email) => email === data.user?.email;

	async function saveEdit() {
		if (!editForm || busy) return;
		busy = true; error = '';
		try {
			const body = {
				first_name: editForm.first_name.trim() || null,
				send_from: editForm.send_from.trim() || null,
				role: editForm.role,
				permission_set_id: editForm.permission_set_id || null,
			};
			const res = await fetch(`/api/admin/users/${encodeURIComponent(editForm.email)}`, {
				method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
			});
			if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Failed');
			users = users.map(u => u.email === editForm.email ? { ...u, ...body } : u);
			editOpen = false;
		} catch (e) { error = e.message; } finally { busy = false; }
	}

	async function removeUser(email) {
		menuFor = '';
		if (!confirm(`Remove access for ${email}?`)) return;
		busy = true; error = '';
		try {
			const res = await fetch(`/api/admin/users/${encodeURIComponent(email)}`, { method: 'DELETE' });
			if (!res.ok) throw new Error('Failed to remove user');
			users = users.filter(u => u.email !== email);
		} catch (e) { error = e.message; }
		busy = false;
	}
</script>

<svelte:head>
	<title>Users — Admin</title>
</svelte:head>

<AppNav active="admin" user={data.user} />

<main class="page">
	<div class="page-header">
		<div>
			<h1 class="page-title">User Access</h1>
			<p class="page-sub">Manage which Google accounts can sign in to the portal</p>
		</div>
		<a href="/admin/permissions" class="btn-secondary">Manage permission sets →</a>
	</div>

	<!-- Add user form -->
	<div class="add-card">
		<h2 class="add-title">Add user</h2>
		<div class="add-row">
			<input
				type="email"
				bind:value={newEmail}
				placeholder="name@company.com"
				class="email-input"
				onkeydown={(e) => { if (e.key === 'Enter') addUser(); }}
			/>
			<input
				type="text"
				bind:value={newFirstName}
				placeholder="First name"
				class="name-input"
				onkeydown={(e) => { if (e.key === 'Enter') addUser(); }}
			/>
			<select bind:value={newRole} class="role-select">
				<option value="user">User</option>
				<option value="admin">Admin</option>
			</select>
			<select bind:value={newPermSetId} class="role-select">
				<option value="">Full access</option>
				{#each permissionSets as ps}
					<option value={ps.id}>{ps.name}</option>
				{/each}
			</select>
			<button class="btn-primary" onclick={addUser} disabled={!newEmail.trim() || busy}>
				{busy ? 'Adding…' : 'Add user'}
			</button>
		</div>
		{#if error}<p class="error-text">{error}</p>{/if}
	</div>

	<!-- Users table -->
	{#if users.length === 0}
		<div class="empty">No users yet — add one above.</div>
	{:else}
		<div class="table-wrap">
			<table class="table">
				<thead>
					<tr>
						<th>User</th>
						<th>Send from</th>
						<th>Role</th>
						<th>Permissions</th>
						<th class="c">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each users as u (u.email)}
						<tr>
							<td class="user-cell">
								<div class="avatar">{(u.first_name?.[0] ?? u.email[0]).toUpperCase()}</div>
								<div class="user-id">
									<span class="u-name">{u.first_name?.trim() || u.email.split('@')[0]}</span>
									<span class="u-email">{u.email}</span>
								</div>
							</td>
							<td class="send-from">{u.send_from || '—'}</td>
							<td>
								<span class="role-tag" class:admin={u.role === 'admin'}>{u.role === 'admin' ? 'Admin' : 'User'}</span>
							</td>
							<td>
								{#if u.role === 'admin' || !u.permission_set_id}
									<span class="perm-badge full">Full access</span>
								{:else}
									<span class="perm-badge set">{psName(u.permission_set_id)}</span>
								{/if}
							</td>
							<td class="c action-cell">
								<div class="menu-wrap">
									<button class="dots" onclick={(e) => toggleMenu(u.email, e)} title="Actions" aria-label="Actions">⋯</button>
									{#if menuFor === u.email}
										<div class="menu">
											<button onclick={() => openEdit(u)}>Edit</button>
											{#if !isSelf(u.email)}<button class="danger" onclick={() => removeUser(u.email)}>Delete</button>{/if}
										</div>
									{/if}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</main>

{#if menuFor}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="menu-backdrop" onclick={() => (menuFor = '')}></div>
{/if}

{#if editOpen && editForm}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="backdrop" onclick={() => (editOpen = false)}></div>
	<div class="modal">
		<div class="modal-head"><h2>Edit user</h2><button class="x" onclick={() => (editOpen = false)}>✕</button></div>
		<div class="modal-body">
			<p class="edit-email">{editForm.email}</p>
			<label class="fld"><span>First name</span><input type="text" bind:value={editForm.first_name} placeholder="—" /></label>
			<label class="fld"><span>Send from</span><input type="email" bind:value={editForm.send_from} placeholder={editForm.email} /></label>
			<label class="fld"><span>Role</span>
				<select bind:value={editForm.role} disabled={isSelf(editForm.email)}>
					<option value="user">User</option>
					<option value="admin">Admin</option>
				</select>
			</label>
			{#if editForm.role !== 'admin'}
				<label class="fld"><span>Permissions</span>
					<select bind:value={editForm.permission_set_id}>
						<option value="">Full access</option>
						{#each permissionSets as ps}<option value={ps.id}>{ps.name}</option>{/each}
					</select>
				</label>
			{/if}
			{#if isSelf(editForm.email)}<p class="hint">You can't change your own role.</p>{/if}
			{#if error}<p class="error-text">{error}</p>{/if}
		</div>
		<div class="modal-foot">
			<button class="btn-ghost" onclick={() => (editOpen = false)}>Cancel</button>
			<button class="btn-save" onclick={saveEdit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
		</div>
	</div>
{/if}

<style>
	.page {
		max-width: 1000px;
		margin: 0 auto;
		padding: 40px 28px 80px;
	}
	.page-header {
		margin-bottom: 32px;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}
	.page-title {
		font-size: 26px; font-weight: 800;
		color: #18181B; letter-spacing: -0.5px; margin: 0 0 4px;
	}
	.page-sub { font-size: 14px; color: #A89060; font-weight: 500; margin: 0; }

	.btn-secondary {
		padding: 8px 16px;
		border: 1px solid var(--border);
		border-radius: 9px;
		font-size: 13px; font-weight: 600;
		color: #52525B; text-decoration: none;
		background: white; white-space: nowrap;
		transition: background 0.15s, color 0.15s;
	}
	.btn-secondary:hover { background: #F4F4F5; color: #18181B; }

	.add-card {
		background: white;
		border: 1px solid var(--border);
		border-radius: 14px;
		padding: 24px 28px;
		margin-bottom: 32px;
	}
	.add-title {
		font-size: 13px; font-weight: 700; color: #52525B;
		margin: 0 0 14px; text-transform: uppercase; letter-spacing: 0.04em;
	}
	.add-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
	.email-input {
		flex: 1; min-width: 200px;
		padding: 9px 14px;
		border: 1px solid var(--border); border-radius: 9px;
		font-size: 14px; font-family: inherit;
		outline: none; background: #FFFBF0;
		transition: border-color 0.15s, box-shadow 0.15s;
	}
	.email-input:focus {
		border-color: #F57832;
		box-shadow: 0 0 0 3px rgba(245,120,50,0.12);
		background: white;
	}
	.name-input {
		padding: 9px 14px;
		border: 1px solid var(--border); border-radius: 9px;
		font-size: 14px; font-family: inherit;
		outline: none; background: white; width: 140px;
		transition: border-color 0.15s, box-shadow 0.15s;
	}
	.name-input:focus {
		border-color: #F57832;
		box-shadow: 0 0 0 3px rgba(245,120,50,0.12);
	}

	.name-cell-input {
		padding: 4px 8px;
		border: 1px solid transparent; border-radius: 6px;
		font-size: 13px; font-family: inherit;
		background: transparent; outline: none; width: 110px;
		color: #18181B;
		transition: border-color 0.15s, background 0.15s;
	}
	.name-cell-input:hover { background: #F4F4F5; }
	.name-cell-input:focus { border-color: #F57832; background: white; box-shadow: 0 0 0 3px rgba(245,120,50,0.10); }
	.send-from-input { width: 150px; }

	.role-select {
		padding: 9px 12px;
		border: 1px solid var(--border); border-radius: 9px;
		font-size: 14px; font-family: inherit;
		background: white; cursor: pointer; outline: none;
	}
	.btn-primary {
		padding: 9px 20px;
		background: #F57832; color: white;
		border: none; border-radius: 9px;
		font-size: 14px; font-weight: 700; font-family: inherit;
		cursor: pointer; transition: background 0.15s; white-space: nowrap;
	}
	.btn-primary:hover:not(:disabled) { background: #E06820; }
	.btn-primary:disabled { opacity: 0.55; cursor: default; }
	.error-text { color: #dc2626; font-size: 13px; margin: 10px 0 0; }

	.empty { text-align: center; color: #aaa; padding: 48px 0; font-size: 14px; }

	.table-wrap {
		background: white;
		border: 1px solid var(--border);
		border-radius: 14px;
		overflow: visible;
	}
	.table { width: 100%; border-collapse: collapse; }
	.table thead tr { border-bottom: 1px solid var(--border); }
	.table th {
		padding: 11px 14px;
		font-size: 12px; font-weight: 700; color: #a0998a;
		text-align: left; text-transform: uppercase; letter-spacing: 0.05em;
		white-space: nowrap;
	}
	.table tbody tr { border-bottom: 1px solid #f5f3ef; transition: background 0.1s; }
	.table tbody tr:last-child { border-bottom: none; }
	.table tbody tr:hover { background: #fdfcfa; }
	.table td { padding: 12px 14px; font-size: 14px; color: #3a3228; vertical-align: middle; }

	.email-cell { display: flex; align-items: center; gap: 10px; }
	.avatar {
		width: 30px; height: 30px;
		background: #FFE6A5; color: #7B3803; border-radius: 50%;
		display: flex; align-items: center; justify-content: center;
		font-size: 12px; font-weight: 800; flex-shrink: 0;
	}

	.role-pill {
		padding: 4px 10px; border-radius: 6px;
		border: 1px solid #e5e0d8; background: #f5f3ef;
		color: #6b5e4e; font-size: 13px; font-weight: 600;
		font-family: inherit; cursor: pointer; outline: none;
	}
	.role-pill.admin { background: #FFF5D2; border-color: #f5d87a; color: #7B3803; }
	.role-pill:disabled { opacity: 0.6; cursor: default; }

	.perm-select {
		padding: 4px 10px; border-radius: 6px;
		border: 1px solid var(--border); background: white;
		color: #18181B; font-size: 13px; font-weight: 500;
		font-family: inherit; cursor: pointer; outline: none;
		max-width: 200px;
	}
	.perm-select:disabled { opacity: 0.6; cursor: default; }

	.perm-badge {
		display: inline-block; white-space: nowrap;
		font-size: 12px; font-weight: 600;
		padding: 3px 10px; border-radius: 6px;
	}
	.perm-badge.full { background: #F0FDF4; color: #15803D; }

	.meta-cell { color: #aaa; font-size: 13px; }
	.action-cell { text-align: right; }
	.remove-btn {
		padding: 6px 11px; gap: 6px;
		background: #fff; border: 1px solid #f0c9c2;
		border-radius: 8px; color: #c23b26; cursor: pointer;
		font-family: inherit; font-size: 13px; font-weight: 600;
		transition: background 0.12s, color 0.12s, border-color 0.12s;
		display: inline-flex; align-items: center;
	}
	.remove-btn:hover:not(:disabled) {
		background: #fef2f2; border-color: #fca5a5; color: #dc2626;
	}
	.remove-btn:disabled { opacity: 0.5; cursor: default; }
	.you-badge {
		font-size: 11px; font-weight: 700; color: #aaa;
		background: #f0ede8; border-radius: 5px; padding: 3px 8px;
	}
	/* ── Redesigned rows ──────────────────────────────────────────────────── */
	.table th.c, .table td.c { text-align: right; }
	.user-cell { display: flex; align-items: center; gap: 11px; }
	.user-id { display: flex; flex-direction: column; line-height: 1.3; min-width: 0; }
	.u-name { font-weight: 600; color: #18181B; font-size: 14px; }
	.u-email { font-size: 12px; color: #a39a88; overflow: hidden; text-overflow: ellipsis; }
	.send-from { color: #6b6b6b; font-size: 13px; }
	.role-tag { display: inline-block; font-size: 12px; font-weight: 700; padding: 3px 11px; border-radius: 100px; background: #F4F4F5; color: #71717A; }
	.role-tag.admin { background: #FDECCB; color: #8a5a06; }
	.perm-badge.set { background: #F4F4F5; color: #52525B; }

	.menu-wrap { position: relative; display: inline-block; }
	.dots { background: none; border: none; font-size: 20px; line-height: 1; color: #8a7550; cursor: pointer; padding: 2px 10px; border-radius: 8px; }
	.dots:hover { background: #F4F4F5; color: #18181B; }
	.menu { position: absolute; right: 0; top: calc(100% + 4px); z-index: 50; background: #fff; border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.14); min-width: 130px; overflow: hidden; }
	.menu button { display: block; width: 100%; text-align: left; background: none; border: none; font-family: inherit; font-size: 13px; font-weight: 600; padding: 9px 14px; cursor: pointer; color: #3a3228; }
	.menu button:hover { background: #F4F4F5; }
	.menu button.danger { color: #c23b26; }
	.menu button.danger:hover { background: #FEF2F2; }
	.menu-backdrop { position: fixed; inset: 0; z-index: 40; }

	/* Edit modal */
	.backdrop { position: fixed; inset: 0; background: rgba(40,25,0,0.35); z-index: 300; }
	.modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); z-index: 310; width: min(440px, calc(100vw - 32px)); background: #fff; border-radius: 16px; box-shadow: 0 24px 60px rgba(50,30,0,0.28); }
	.modal-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); }
	.modal-head h2 { font-size: 15px; font-weight: 800; margin: 0; color: #18181B; }
	.modal-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; }
	.modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 20px; border-top: 1px solid var(--border); }
	.x { background: none; border: none; font-size: 15px; color: #8A7550; cursor: pointer; }
	.edit-email { font-size: 13px; color: #a39a88; margin: 0 0 2px; font-family: ui-monospace, monospace; }
	.fld { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 700; color: #6b5e4e; }
	.fld input, .fld select { font-family: inherit; font-size: 14px; font-weight: 500; color: #18181B; border: 1px solid var(--border); border-radius: 9px; padding: 9px 11px; background: white; }
	.fld input:focus, .fld select:focus { outline: none; border-color: #F57832; }
	.hint { font-size: 12px; color: #a39a88; margin: 0; font-style: italic; }
	.error-text { font-size: 13px; color: #c23b26; margin: 0; }
	.btn-ghost { padding: 9px 16px; border: 1px solid var(--border); border-radius: 9px; background: #fff; font-family: inherit; font-size: 13px; font-weight: 600; color: #52525B; cursor: pointer; }
	.btn-ghost:hover { background: #F4F4F5; }
	.btn-save { padding: 9px 18px; border: none; border-radius: 9px; background: #F57832; color: #fff; font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
	.btn-save:hover:not(:disabled) { background: #e26a26; }
	.btn-save:disabled { opacity: 0.6; cursor: default; }
</style>
