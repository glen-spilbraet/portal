<script>
	let { active = 'sheets', user = null } = $props();

	// Permissions — default to full access so the nav never breaks if not provided
	const p = $derived(user?.permissions ?? { sheets: true, catalogues: true, planograms: true, data: true, mail: true, price_lists: true, stats: true, orders: true });

	const salesItems = $derived([
		p.sheets       && { href: '/sheets',       label: 'Sheets',      key: 'sheets' },
		p.catalogues   && { href: '/catalogues',   label: 'Catalogues',  key: 'catalogues' },
		p.planograms   && { href: '/planograms',   label: 'Planograms',  key: 'planograms' },
		p.price_lists  && { href: '/price-lists',  label: 'Price List',  key: 'price-lists' },
	].filter(Boolean));

	const showSales = $derived(salesItems.length > 0);
	const showStats = $derived(!!p.stats);
	const showData  = $derived(p.data);
	const showMail  = $derived(!!p.mail);
	const showOrders = $derived(!!p.orders);

	const orderItems = [
		{ href: '/orders',                 label: 'Orders',        key: 'orders' },
		{ href: '/orders/rackbeat-drafts', label: 'Create Orders', key: 'create-orders' },
	];

	const mailItems = [
		{ href: '/mail/accounts',  label: 'Key Accounts', key: 'mail-accounts' },
		{ href: '/mail/contacts',  label: 'Contacts',     key: 'mail-contacts' },
		{ href: '/mail/campaigns', label: 'Campaigns',    key: 'mail-campaigns' },
	];

	const adminRoutes = ['translations', 'admin', 'permissions', 'item-library', 'sheet-data', 'analytics', 'migrate-images', 'targets', 'verify', 'publishers'];
	const salesActive  = $derived(salesItems.some(i => i.key === active));
	const orderActive  = $derived(orderItems.some(i => i.key === active));
	const mailActive   = $derived(active.startsWith('mail-'));
	const adminActive  = $derived(adminRoutes.includes(active));

	// Display name: first_name if set, else email prefix
	const displayName = $derived(
		user?.first_name?.trim()
			? user.first_name.trim()
			: (user?.email?.split('@')[0] ?? '')
	);

	// ── Simulate modal ───────────────────────────────────────────────────────────
	let simOpen     = $state(false);
	let simUsers    = $state([]);
	let simLoading  = $state(false);
	let simError    = $state('');
	let simBusy     = $state(false);

	async function openSimulate() {
		simOpen    = true;
		simUsers   = [];
		simError   = '';
		simLoading = true;
		try {
			const res = await fetch('/api/admin/users');
			if (!res.ok) throw new Error('Failed to load users');
			const all = await res.json();
			// Exclude self
			simUsers = all.filter(u => u.email !== user?.email);
		} catch (e) {
			simError = e.message;
		} finally {
			simLoading = false;
		}
	}

	async function startSimulate(email) {
		simBusy = true;
		try {
			await fetch('/api/admin/simulate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email }),
			});
			location.reload();
		} catch {
			simBusy = false;
		}
	}

	function closeSimulate() {
		simOpen = false;
	}

	function handleSimKeydown(e) {
		if (e.key === 'Escape') closeSimulate();
	}
</script>

<header class="nav">
	<div class="nav-inner">
		<div class="nav-left">
			<a href="/" class="wordmark">
				<div class="wordmark-icon">
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
						<polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
						<line x1="12" y1="22.08" x2="12" y2="12"/>
					</svg>
				</div>
				<span>Product Portal</span>
			</a>

			<nav class="nav-links">
				<!-- Stats (direct link) -->
				{#if showStats}
					<a href="/" class="nav-link" class:active={active === 'stats'}>Stats</a>
				{/if}

				<!-- Sales dropdown -->
				{#if showSales}
					<div class="nav-group" class:active={salesActive}>
						<button class="nav-top" class:active={salesActive}>
							Sales
							<svg class="chevron" width="10" height="10" viewBox="0 0 10 10" fill="none">
								<path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
						</button>
						<div class="dropdown">
							<div class="dropdown-inner">
								{#each salesItems as item}
									<a href={item.href} class="dropdown-item" class:active={active === item.key}>{item.label}</a>
								{/each}
							</div>
						</div>
					</div>
				{/if}

				<!-- Orders dropdown -->
				{#if showOrders}
					<div class="nav-group" class:active={orderActive}>
						<button class="nav-top" class:active={orderActive}>
							Orders
							<svg class="chevron" width="10" height="10" viewBox="0 0 10 10" fill="none">
								<path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
						</button>
						<div class="dropdown">
							<div class="dropdown-inner">
								{#each orderItems as item}
									<a href={item.href} class="dropdown-item" class:active={active === item.key}>{item.label}</a>
								{/each}
							</div>
						</div>
					</div>
				{/if}

				<!-- Data (direct link) -->
				{#if showData}
					<a href="/data" class="nav-link" class:active={active === 'data'}>Data</a>
				{/if}

				<!-- Mail dropdown -->
				{#if showMail}
					<div class="nav-group" class:active={mailActive}>
						<button class="nav-top" class:active={mailActive}>
							Mail
							<svg class="chevron" width="10" height="10" viewBox="0 0 10 10" fill="none">
								<path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
						</button>
						<div class="dropdown">
							<div class="dropdown-inner">
								{#each mailItems as item}
									<a href={item.href} class="dropdown-item" class:active={active === item.key}>{item.label}</a>
								{/each}
							</div>
						</div>
					</div>
				{/if}

				<!-- Admin dropdown (admin only) -->
				{#if user?.role === 'admin'}
					<div class="nav-group" class:active={adminActive}>
						<button class="nav-top" class:active={adminActive}>
							Admin
							<svg class="chevron" width="10" height="10" viewBox="0 0 10 10" fill="none">
								<path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
						</button>
						<div class="dropdown">
							<div class="dropdown-inner">
								<a href="/translations" class="dropdown-item" class:active={active === 'translations'}>Translations</a>
								<a href="/admin/users" class="dropdown-item" class:active={active === 'admin'}>Users</a>
								<a href="/admin/permissions" class="dropdown-item" class:active={active === 'permissions'}>Permission Sets</a>
								<a href="/admin/targets" class="dropdown-item" class:active={active === 'targets'}>Targets</a>
								<a href="/admin/publishers" class="dropdown-item" class:active={active === 'publishers'}>Publisher Mapping</a>
								<a href="/verify" class="dropdown-item" class:active={active === 'verify'}>Data Verification</a>
								<a href="/admin/item-library" class="dropdown-item" class:active={active === 'item-library'}>Item Library</a>
								<a href="/admin/sheet-data" class="dropdown-item" class:active={active === 'sheet-data'}>Sheet Data</a>
								<a href="/admin/analytics" class="dropdown-item" class:active={active === 'analytics'}>Analytics</a>
								<a href="/admin/migrate-images" class="dropdown-item" class:active={active === 'migrate-images'}>Migrate Images</a>
							</div>
						</div>
					</div>
				{/if}
			</nav>
		</div>

		<!-- User menu (right side) -->
		{#if user?.email}
			<div class="nav-group user-menu">
				<button class="nav-top user-btn">
					<div class="user-avatar">{displayName[0]?.toUpperCase() ?? '?'}</div>
					{displayName}
					<svg class="chevron" width="10" height="10" viewBox="0 0 10 10" fill="none">
						<path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</button>
				<div class="dropdown dropdown-right">
					<div class="dropdown-inner">
						{#if user.role === 'admin'}
							<button class="dropdown-item dropdown-btn" onclick={openSimulate}>
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
									<path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
								</svg>
								Simulate user
							</button>
							<div class="dropdown-divider"></div>
						{/if}
						<a href="/logout" class="dropdown-item dropdown-signout">
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
							</svg>
							Sign out
						</a>
					</div>
				</div>
			</div>
		{/if}
	</div>
</header>

<!-- ── Simulate user modal ──────────────────────────────────────────────────── -->
{#if simOpen}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="modal-backdrop" role="dialog" aria-modal="true" onkeydown={handleSimKeydown}>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="modal-overlay" onclick={closeSimulate}></div>
		<div class="modal">
			<div class="modal-header">
				<div>
					<h2 class="modal-title">Simulate user</h2>
					<p class="modal-sub">Browse the portal as another user to preview their experience.</p>
				</div>
				<button class="modal-close" onclick={closeSimulate} aria-label="Close">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
					</svg>
				</button>
			</div>
			<div class="modal-body">
				{#if simLoading}
					<div class="sim-state">
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin">
							<path d="M21 12a9 9 0 11-6.219-8.56"/>
						</svg>
						Loading users…
					</div>
				{:else if simError}
					<div class="sim-error">{simError}</div>
				{:else if simUsers.length === 0}
					<div class="sim-state">No other users found.</div>
				{:else}
					<ul class="user-list">
						{#each simUsers as u (u.email)}
							<li>
								<button
									class="user-row"
									onclick={() => startSimulate(u.email)}
									disabled={simBusy}
								>
									<div class="u-avatar">
										{(u.first_name?.[0] ?? u.email[0]).toUpperCase()}
									</div>
									<div class="u-info">
										<span class="u-name">
											{#if u.first_name}{u.first_name}{:else}<span class="u-no-name">{u.email}</span>{/if}
										</span>
										{#if u.first_name}
											<span class="u-email">{u.email}</span>
										{/if}
									</div>
									<span class="u-role" class:admin={u.role === 'admin'}>{u.role}</span>
									<svg class="u-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<polyline points="9 18 15 12 9 6"/>
									</svg>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	@keyframes spin { to { transform: rotate(360deg); } }
	.spin { animation: spin 0.8s linear infinite; }

	.nav {
		background: white;
		border-bottom: 1px solid var(--border);
		padding: 0 28px;
		position: relative;
		z-index: 100;
	}

	.nav-inner {
		max-width: 1140px;
		margin: 0 auto;
		height: 54px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
	}

	.nav-left {
		display: flex;
		align-items: center;
		gap: 20px;
		min-width: 0;
	}

	.wordmark {
		display: flex;
		align-items: center;
		gap: 9px;
		font-size: 14px;
		font-weight: 800;
		color: #18181B;
		letter-spacing: -0.3px;
		flex-shrink: 0;
		text-decoration: none;
		transition: opacity 0.15s;
	}
	.wordmark:hover { opacity: 0.85; }

	.wordmark-icon {
		width: 30px;
		height: 30px;
		background: #F57832;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		box-shadow: 0 2px 8px rgba(245, 120, 50, 0.35);
	}

	.nav-links {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	/* Direct link (Data) */
	.nav-link {
		padding: 5px 12px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 600;
		color: #8A7550;
		text-decoration: none;
		transition: background 0.15s, color 0.15s;
		white-space: nowrap;
	}
	.nav-link:hover { background: #FFE6A5; color: #7B3803; }
	.nav-link.active { background: #FFE6A5; color: #7B3803; }

	/* Dropdown group */
	.nav-group {
		position: relative;
	}

	.nav-top {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 5px 12px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 600;
		color: #8A7550;
		background: none;
		border: none;
		cursor: pointer;
		font-family: inherit;
		transition: background 0.15s, color 0.15s;
		white-space: nowrap;
	}
	.nav-top:hover { background: #FFE6A5; color: #7B3803; }
	.nav-top.active { background: #FFE6A5; color: #7B3803; }

	/* User menu button — slightly different styling */
	.user-btn {
		color: #52525B;
		gap: 7px;
	}
	.user-btn:hover { background: #F4F4F5; color: #18181B; }

	.user-avatar {
		width: 24px; height: 24px;
		background: #FFE6A5; color: #7B3803;
		border-radius: 50%;
		display: flex; align-items: center; justify-content: center;
		font-size: 11px; font-weight: 800;
		flex-shrink: 0;
	}

	.chevron {
		opacity: 0.6;
		transition: transform 0.15s;
		flex-shrink: 0;
	}

	/* Show dropdown on hover */
	.dropdown {
		display: none;
		position: absolute;
		top: 100%;
		left: 0;
		padding-top: 8px;
		min-width: 160px;
		z-index: 200;
	}

	/* Right-aligned dropdown for user menu */
	.dropdown-right {
		left: auto;
		right: 0;
	}

	.dropdown-inner {
		background: white;
		border: 1px solid var(--border);
		border-radius: 10px;
		box-shadow: 0 6px 24px rgba(0,0,0,0.10);
		padding: 5px;
		display: flex;
		flex-direction: column;
	}

	.nav-group:hover .dropdown { display: block; }
	.nav-group:hover .chevron { transform: rotate(180deg); }

	.dropdown-item {
		padding: 8px 12px;
		border-radius: 7px;
		font-size: 13px;
		font-weight: 600;
		color: #6b5e4e;
		text-decoration: none;
		transition: background 0.12s, color 0.12s;
		white-space: nowrap;
		display: flex; align-items: center; gap: 8px;
	}
	.dropdown-item:hover { background: #FFF5D2; color: #7B3803; }
	.dropdown-item.active { background: #FFE6A5; color: #7B3803; }

	/* Button-style dropdown item */
	.dropdown-btn {
		border: none; background: none; cursor: pointer; font-family: inherit;
		width: 100%; text-align: left;
	}
	.dropdown-btn:hover { background: #FFF5D2; color: #7B3803; }

	.dropdown-divider {
		height: 1px; background: var(--border); margin: 4px 6px;
	}

	.dropdown-signout { color: #71717A; }
	.dropdown-signout:hover { background: #FEF2F2 !important; color: #dc2626 !important; }

	/* ── Simulate modal ─────────────────────────────────────────────────────── */
	.modal-backdrop {
		position: fixed; inset: 0; z-index: 300;
		display: flex; align-items: center; justify-content: center;
		padding: 24px;
	}
	.modal-overlay {
		position: absolute; inset: 0;
		background: rgba(0,0,0,0.35);
		backdrop-filter: blur(2px);
	}
	.modal {
		position: relative; z-index: 1;
		background: white;
		border-radius: 20px;
		box-shadow: 0 24px 60px rgba(0,0,0,0.18);
		width: 100%; max-width: 460px;
		max-height: calc(100vh - 48px);
		display: flex; flex-direction: column;
		overflow: hidden;
	}

	.modal-header {
		display: flex; align-items: flex-start; gap: 16px;
		padding: 22px 24px 16px;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.modal-header > div { flex: 1; }
	.modal-title {
		font-size: 16px; font-weight: 700; color: #18181B;
		margin: 0 0 3px; letter-spacing: -0.2px;
	}
	.modal-sub { font-size: 13px; color: #71717A; margin: 0; }

	.modal-close {
		flex-shrink: 0;
		width: 32px; height: 32px;
		display: flex; align-items: center; justify-content: center;
		border: 1px solid var(--border); border-radius: 8px;
		background: white; color: #71717A; cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.modal-close:hover { background: #F4F4F5; color: #18181B; }

	.modal-body { overflow-y: auto; flex: 1; }

	.sim-state {
		display: flex; align-items: center; justify-content: center; gap: 8px;
		padding: 40px 24px; font-size: 13px; color: #71717A;
	}
	.sim-error {
		margin: 16px; padding: 12px 16px;
		background: #FEF2F2; border: 1px solid #fecaca;
		border-radius: 10px; font-size: 13px; color: #dc2626;
	}

	.user-list {
		list-style: none; margin: 0; padding: 8px;
	}

	.user-row {
		display: flex; align-items: center; gap: 12px;
		width: 100%; padding: 10px 12px;
		border: none; background: none;
		border-radius: 10px; cursor: pointer;
		font-family: inherit; text-align: left;
		transition: background 0.12s;
	}
	.user-row:hover:not(:disabled) { background: #F4F4F5; }
	.user-row:disabled { opacity: 0.5; cursor: default; }

	.u-avatar {
		width: 34px; height: 34px; flex-shrink: 0;
		background: #FFE6A5; color: #7B3803;
		border-radius: 50%;
		display: flex; align-items: center; justify-content: center;
		font-size: 13px; font-weight: 800;
	}
	.u-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
	.u-name { font-size: 14px; font-weight: 600; color: #18181B; }
	.u-no-name { font-weight: 500; color: #52525B; }
	.u-email { font-size: 12px; color: #A1A1AA; }

	.u-role {
		font-size: 11px; font-weight: 700;
		padding: 2px 8px; border-radius: 100px;
		background: #F4F4F5; color: #71717A;
		text-transform: capitalize;
	}
	.u-role.admin { background: #FFF5D2; color: #7B3803; }

	.u-arrow { color: #D1D5DB; flex-shrink: 0; }
	.user-row:hover .u-arrow { color: #A1A1AA; }
</style>
