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

	async function changeRole(email, role) {
		busy = true; error = '';
		try {
			await fetch(`/api/admin/users/${encodeURIComponent(email)}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role }),
			});
			users = users.map(u => u.email === email ? { ...u, role } : u);
		} catch (e) { error = e.message; }
		busy = false;
	}

	async function changeFirstName(email, firstName) {
		busy = true; error = '';
		try {
			await fetch(`/api/admin/users/${encodeURIComponent(email)}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ first_name: firstName.trim() || null }),
			});
			users = users.map(u => u.email === email ? { ...u, first_name: firstName.trim() || null } : u);
		} catch (e) { error = e.message; }
		busy = false;
	}

	async function changeSendFrom(email, sendFrom) {
		busy = true; error = '';
		try {
			await fetch(`/api/admin/users/${encodeURIComponent(email)}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ send_from: sendFrom.trim() || null }),
			});
			users = users.map(u => u.email === email ? { ...u, send_from: sendFrom.trim() || null } : u);
		} catch (e) { error = e.message; }
		busy = false;
	}

	async function changePermSet(email, permSetId) {
		busy = true; error = '';
		try {
			await fetch(`/api/admin/users/${encodeURIComponent(email)}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ permission_set_id: permSetId || null }),
			});
			users = users.map(u => u.email === email ? { ...u, permission_set_id: permSetId || null } : u);
		} catch (e) { error = e.message; }
		busy = false;
	}

	async function removeUser(email) {
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
						<th>Email</th>
						<th>First name</th>
						<th>Send from</th>
						<th>Role</th>
						<th>Permissions</th>
						<th>Added</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each users as u (u.email)}
						<tr>
							<td class="email-cell">
								<div class="avatar">{(u.first_name?.[0] ?? u.email[0]).toUpperCase()}</div>
								<span>{u.email}</span>
							</td>
							<td>
								<input
									type="text"
									class="name-cell-input"
									value={u.first_name ?? ''}
									placeholder="—"
									onblur={(e) => {
										if (e.currentTarget.value !== (u.first_name ?? '')) {
											changeFirstName(u.email, e.currentTarget.value);
										}
									}}
									onkeydown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
								/>
							</td>
							<td>
								<input
									type="email"
									class="name-cell-input send-from-input"
									value={u.send_from ?? ''}
									placeholder="glen@spilbraet.dk"
									onblur={(e) => {
										if (e.currentTarget.value !== (u.send_from ?? '')) {
											changeSendFrom(u.email, e.currentTarget.value);
										}
									}}
									onkeydown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
								/>
							</td>
							<td>
								<select
									class="role-pill"
									class:admin={u.role === 'admin'}
									value={u.role}
									onchange={(e) => changeRole(u.email, e.currentTarget.value)}
									disabled={busy || u.email === data.user?.email}
								>
									<option value="user">User</option>
									<option value="admin">Admin</option>
								</select>
							</td>
							<td>
								{#if u.role === 'admin'}
									<span class="perm-badge full">Full access (admin)</span>
								{:else}
									<select
										class="perm-select"
										value={u.permission_set_id ?? ''}
										onchange={(e) => changePermSet(u.email, e.currentTarget.value)}
										disabled={busy}
									>
										<option value="">Full access</option>
										{#each permissionSets as ps}
											<option value={ps.id}>{ps.name}</option>
										{/each}
									</select>
								{/if}
							</td>
							<td class="meta-cell">{formatDate(u.added_at)}</td>
							<td class="action-cell">
								{#if u.email !== data.user?.email}
									<button class="remove-btn" onclick={() => removeUser(u.email)} disabled={busy} title="Remove access">
										<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
											<path d="M2 3.5h10M5.5 3.5V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M3.5 3.5l.5 7.5h6l.5-7.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
										</svg>
									</button>
								{:else}
									<span class="you-badge">You</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</main>

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
	.send-from-input { width: 170px; }

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
		overflow: hidden;
	}
	.table { width: 100%; border-collapse: collapse; }
	.table thead tr { border-bottom: 1px solid var(--border); }
	.table th {
		padding: 11px 20px;
		font-size: 12px; font-weight: 700; color: #a0998a;
		text-align: left; text-transform: uppercase; letter-spacing: 0.05em;
	}
	.table tbody tr { border-bottom: 1px solid #f5f3ef; transition: background 0.1s; }
	.table tbody tr:last-child { border-bottom: none; }
	.table tbody tr:hover { background: #fdfcfa; }
	.table td { padding: 13px 20px; font-size: 14px; color: #3a3228; vertical-align: middle; }

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
		font-size: 12px; font-weight: 600;
		padding: 3px 10px; border-radius: 6px;
	}
	.perm-badge.full { background: #F0FDF4; color: #15803D; }

	.meta-cell { color: #aaa; font-size: 13px; }
	.action-cell { text-align: right; }
	.remove-btn {
		padding: 6px 8px;
		background: none; border: 1px solid transparent;
		border-radius: 7px; color: #bbb; cursor: pointer;
		transition: background 0.12s, color 0.12s, border-color 0.12s;
		display: inline-flex; align-items: center;
	}
	.remove-btn:hover:not(:disabled) {
		background: #fef2f2; border-color: #fecaca; color: #dc2626;
	}
	.you-badge {
		font-size: 11px; font-weight: 700; color: #aaa;
		background: #f0ede8; border-radius: 5px; padding: 3px 8px;
	}
</style>
