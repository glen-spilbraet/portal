<script>
	let { active = 'sheets', user = null } = $props();

	// Permissions — default to full access so the nav never breaks if not provided
	const p = $derived(user?.permissions ?? { sheets: true, catalogues: true, planograms: true, data: true, mail: true, price_lists: true, stats: true, orders: true, product: true, forecast: true, awards: true, rest_check: true, price_sync: true, events: true, order_conf: true, reports: true, knowledge: true, credit_notes: true });

	const mailActive = $derived(active.startsWith('mail-'));
	const salesItems = $derived([
		p.sheets       && { href: '/sheets',       label: 'Sheets',      key: 'sheets' },
		p.catalogues   && { href: '/catalogues',   label: 'Catalogues',  key: 'catalogues' },
		p.planograms   && { href: '/planograms',   label: 'Planograms',  key: 'planograms' },
		p.awards       && { href: '/awards',       label: 'Awards & Press', key: 'awards' },
		p.mail         && { href: '/mail/campaigns', label: 'Mail',      key: 'mail' },
	].filter(Boolean));

	const showSales = $derived(salesItems.length > 0);

	// Events group (own top-level menu)
	const eventItems = $derived([
		p.events && { href: '/events',        label: 'Events', key: 'events' },
		p.events && { href: '/events/venues', label: 'Venues', key: 'events-venues' },
		p.events && { href: '/events/types',  label: 'Types',  key: 'events-types' },
		p.events && { href: '/events/gurus',  label: 'Gurus',  key: 'events-gurus' },
		p.events && { href: '/events/emails', label: 'Emails', key: 'events-emails' },
	].filter(Boolean));
	const showEvents = $derived(eventItems.length > 0);

	// Stats menu: Overview (stats perm) + Product (product perm) + Forecast
	// (forecast perm). One item → a plain link; more → a dropdown.
	const statsItems = $derived([
		p.stats    && { href: '/',         label: 'Overview', key: 'stats' },
		p.product  && { href: '/product',  label: 'Product',  key: 'product' },
		p.forecast && { href: '/forecast', label: 'Forecast', key: 'forecast' },
		p.reports  && { href: '/reports',  label: 'Reports',  key: 'reports' },
		p.credit_notes && { href: '/credit-notes', label: 'Credit Notes', key: 'credit_notes' },
	].filter(Boolean));
	const showStats = $derived(statsItems.length > 0);
	const statsActive = $derived(active === 'stats' || active === 'product' || active === 'forecast' || active === 'reports' || active === 'credit_notes');
	const showData  = $derived(p.data);
	const showKnowledge = $derived(!!p.knowledge);
	const showOrders = $derived(!!p.orders || !!p.rest_check || !!p.price_sync || !!p.order_conf);

	const orderItems = $derived([
		p.orders     && { href: '/orders',                 label: 'Orders',        key: 'orders' },
		p.orders     && { href: '/orders/rackbeat-drafts', label: 'Create Orders', key: 'create-orders' },
		p.order_conf && { href: '/orders/order-confirmations', label: 'Order Confirmations', key: 'order-confirmations' },
		p.rest_check && { href: '/orders/rest-check',      label: 'Rest Check',    key: 'rest-check' },
		p.price_sync && { href: '/orders/price-sync',      label: 'Price Sync',    key: 'price-sync' },
	].filter(Boolean));

	const I = (paths) => `<svg class="nav-ico" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
	const ICONS = {
		stats: I('<circle cx="12" cy="12" r="9"/><path d="M12 3v9h9"/>'),
		sales: I('<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>'),
		events: I('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
		orders: I('<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>'),
		data: I('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>'),
		knowledge: I('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
		admin: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
	};

	const adminRoutes = ['translations', 'admin', 'permissions', 'item-library', 'sheet-data', 'analytics', 'migrate-images', 'targets', 'verify', 'publishers', 'phone-numbers', 'categories'];
	const salesActive  = $derived(salesItems.some(i => i.key === active) || mailActive);
	const eventsActive = $derived(eventItems.some(i => i.key === active));
	const orderActive  = $derived(orderItems.some(i => i.key === active));
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
				<!-- Stats -->
				{#if showStats}
					{#if statsItems.length === 1}
						<a href={statsItems[0].href} class="nav-link" class:active={statsActive}>{@html ICONS.stats}Stats</a>
					{:else}
						<div class="nav-group" class:active={statsActive}>
							<button class="nav-top" class:active={statsActive}>{@html ICONS.stats}Stats
							</button>
							<div class="dropdown"><div class="dropdown-inner">
								{#each statsItems as item}<a href={item.href} class="dropdown-item" class:active={active === item.key}>{item.label}</a>{/each}
							</div></div>
						</div>
					{/if}
				{/if}

				<!-- Sales (incl. Mail) -->
				{#if showSales}
					<div class="nav-group" class:active={salesActive}>
						<button class="nav-top" class:active={salesActive}>{@html ICONS.sales}Sales
						</button>
						<div class="dropdown"><div class="dropdown-inner">
							{#each salesItems as item}<a href={item.href} class="dropdown-item" class:active={active === item.key || (item.key === 'mail' && mailActive)}>{item.label}</a>{/each}
						</div></div>
					</div>
				{/if}

				<!-- Events -->
				{#if showEvents}
					<div class="nav-group" class:active={eventsActive}>
						<button class="nav-top" class:active={eventsActive}>{@html ICONS.events}Events
						</button>
						<div class="dropdown"><div class="dropdown-inner">
							{#each eventItems as item}<a href={item.href} class="dropdown-item" class:active={active === item.key}>{item.label}</a>{/each}
						</div></div>
					</div>
				{/if}

				<!-- Orders -->
				{#if showOrders}
					<div class="nav-group" class:active={orderActive}>
						<button class="nav-top" class:active={orderActive}>{@html ICONS.orders}Orders
						</button>
						<div class="dropdown"><div class="dropdown-inner">
							{#each orderItems as item}<a href={item.href} class="dropdown-item" class:active={active === item.key}>{item.label}</a>{/each}
						</div></div>
					</div>
				{/if}

				<!-- Data -->
				{#if showData}
					<a href="/data" class="nav-link" class:active={active === 'data'}>{@html ICONS.data}Data</a>
				{/if}

				<!-- Knowledge -->
				{#if showKnowledge}
					<a href="/knowledge" class="nav-link" class:active={active === 'knowledge'}>{@html ICONS.knowledge}Knowledge</a>
				{/if}

				<!-- Admin -->
				{#if user?.role === 'admin'}
					<a href="/admin" class="nav-link" class:active={adminActive}>{@html ICONS.admin}Admin</a>
				{/if}
			</nav>
		</div>

		<!-- User menu (right side) -->
		{#if user?.email}
			<div class="nav-group user-menu">
				<button class="nav-top user-btn">
					<div class="user-avatar">{displayName[0]?.toUpperCase() ?? '?'}</div>
					{displayName}
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
		gap: 10px;
	}

	/* Direct link */
	.nav-link {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 6px 13px;
		border-radius: 8px;
		font-size: 14.5px;
		font-weight: 600;
		color: #8A7550;
		text-decoration: none;
		transition: background 0.15s, color 0.15s;
		white-space: nowrap;
	}
	.nav-ico { flex-shrink: 0; opacity: 0.85; }
	.nav-link:hover { background: #FFE6A5; color: #7B3803; }
	.nav-link.active { background: #FFE6A5; color: #7B3803; }

	/* Dropdown group */
	.nav-group {
		position: relative;
	}

	.nav-top {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 6px 13px;
		border-radius: 8px;
		font-size: 14.5px;
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
