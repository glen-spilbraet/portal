<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	// ── Data ────────────────────────────────────────────────────────────────────
	let orders    = $state([]);
	let loading   = $state(true);
	let loadError = $state('');
	let userRole  = $state('');

	// ── Filters ─────────────────────────────────────────────────────────────────
	let query        = $state('');
	let filterStatus = $state('all'); // 'all' | 'booked' | 'unbooked' | 'shipped'

	// ── Derived ─────────────────────────────────────────────────────────────────
	let filtered = $derived(() => {
		let result = orders;
		if (filterStatus !== 'all') {
			result = result.filter(o => {
				if (filterStatus === 'booked')   return o.is_booked && !o.is_shipped;
				if (filterStatus === 'unbooked') return !o.is_booked;
				if (filterStatus === 'shipped')  return o.is_shipped;
				return true;
			});
		}
		if (query.trim()) {
			const q = query.toLowerCase().trim();
			result = result.filter(o => {
				const num    = String(o.number ?? '').toLowerCase();
				const cust   = (o.customer?.name ?? '').toLowerCase();
				const ref    = (o.our_reference?.name ?? '').toLowerCase();
				const email  = (o.our_reference?.contact_email ?? '').toLowerCase();
				return num.includes(q) || cust.includes(q) || ref.includes(q) || email.includes(q);
			});
		}
		return result;
	});

	// ── Load orders ─────────────────────────────────────────────────────────────
	async function load() {
		loading = true; loadError = '';
		try {
			const res = await fetch('/api/orders');
			if (!res.ok) {
				const b = await res.json().catch(() => ({}));
				throw new Error(b.message ?? `Error ${res.status}`);
			}
			const body = await res.json();
			orders   = body.orders ?? [];
			userRole = body.userRole ?? '';
		} catch (e) {
			loadError = e.message;
		} finally {
			loading = false;
		}
	}

	load();

	// ── Helpers ─────────────────────────────────────────────────────────────────
	function formatDate(str) {
		if (!str) return '—';
		return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	function formatAmount(amount, currency) {
		if (amount == null) return '—';
		return new Intl.NumberFormat('en-DK', {
			style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2
		}).format(amount) + (currency ? ` ${currency}` : '');
	}

	function statusLabel(o) {
		if (o.is_shipped)  return { label: 'Shipped',  cls: 'shipped' };
		if (o.is_booked)   return { label: 'Booked',   cls: 'booked' };
		return                    { label: 'Draft',    cls: 'draft' };
	}

	// Tab counts
	let countAll      = $derived(orders.length);
	let countBooked   = $derived(orders.filter(o => o.is_booked && !o.is_shipped).length);
	let countUnbooked = $derived(orders.filter(o => !o.is_booked).length);
	let countShipped  = $derived(orders.filter(o => o.is_shipped).length);

	// ── Order details modal ──────────────────────────────────────────────────────
	let detailOrder   = $state(null);   // the order object we're viewing
	let lines         = $state([]);
	let linesLoading  = $state(false);
	let linesError    = $state('');

	async function openDetails(order) {
		detailOrder  = order;
		lines        = [];
		linesError   = '';
		linesLoading = true;
		try {
			const res = await fetch(`/api/orders/${order.number}/lines`);
			if (!res.ok) {
				const b = await res.json().catch(() => ({}));
				throw new Error(b.message ?? `Error ${res.status}`);
			}
			const body = await res.json();
			lines = (body.lines ?? []).sort((a, b) => a.sort_index - b.sort_index);
		} catch (e) {
			linesError = e.message;
		} finally {
			linesLoading = false;
		}
	}

	function closeDetails() {
		detailOrder = null;
		lines = [];
		linesError = '';
	}

	function handleModalKeydown(e) {
		if (e.key === 'Escape') closeDetails();
	}
</script>

<svelte:head>
	<title>Orders — Product Portal</title>
</svelte:head>

<div class="page">
	<AppNav active="orders" user={data.user} />

	<main>
		<div class="page-header">
			<div>
				<h1 class="page-title">Orders</h1>
				<p class="page-sub">
					{#if loading}
						Loading…
					{:else if userRole === 'admin'}
						All non-invoiced orders
					{:else}
						Your non-invoiced orders
					{/if}
				</p>
			</div>
			{#if userRole === 'admin'}
				<a class="create-drafts-link" href="/orders/rackbeat-drafts">Create drafts from HubSpot</a>
			{/if}
		</div>

		{#if loadError}
			<div class="error-banner">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
				</svg>
				{loadError}
				<button class="retry-btn" onclick={load}>Retry</button>
			</div>
		{:else if loading}
			<div class="loading-state">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin">
					<path d="M21 12a9 9 0 11-6.219-8.56"/>
				</svg>
				Fetching orders from Rackbeat…
			</div>
		{:else}
			<!-- Toolbar: filters + search -->
			<div class="toolbar">
				<div class="tabs">
					<button class="tab" class:active={filterStatus === 'all'}      onclick={() => filterStatus = 'all'}>
						All <span class="tab-count">{countAll}</span>
					</button>
					<button class="tab" class:active={filterStatus === 'unbooked'} onclick={() => filterStatus = 'unbooked'}>
						Draft <span class="tab-count">{countUnbooked}</span>
					</button>
					<button class="tab" class:active={filterStatus === 'booked'}   onclick={() => filterStatus = 'booked'}>
						Booked <span class="tab-count">{countBooked}</span>
					</button>
					<button class="tab" class:active={filterStatus === 'shipped'}  onclick={() => filterStatus = 'shipped'}>
						Shipped <span class="tab-count">{countShipped}</span>
					</button>
				</div>
				<div class="search-wrap">
					<svg class="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
					</svg>
					<input class="search-input" type="search" placeholder="Order #, customer, reference…" bind:value={query} />
				</div>
				<button class="refresh-btn" onclick={load} title="Refresh">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
						<path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
					</svg>
				</button>
			</div>

			{#if orders.length === 0}
				<div class="empty">
					<div class="empty-icon">
						<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/>
							<path d="M16 10a4 4 0 01-8 0"/>
						</svg>
					</div>
					<p class="empty-title">No open orders</p>
					<p class="empty-sub">All orders are invoiced or none are assigned to you.</p>
				</div>
			{:else if filtered().length === 0}
				<div class="no-results">No orders match "<strong>{query || filterStatus}</strong>"</div>
			{:else}
				<div class="table-wrap">
					<table class="table">
						<thead>
							<tr>
								<th>Order #</th>
								<th>Customer</th>
								<th>Date</th>
								<th>Delivery</th>
								{#if userRole === 'admin'}<th>Our reference</th>{/if}
								<th>Amount</th>
								<th>Status</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{#each filtered() as o, i (o.number ?? i)}
								{@const st = statusLabel(o)}
								<tr>
									<td class="order-num">
										<span class="order-num-text">{o.number}</span>
									</td>
									<td class="customer-cell">
										<span class="customer-name">{o.customer?.name ?? '—'}</span>
										{#if o.customer?.number}
											<span class="customer-num">{o.customer.number}</span>
										{/if}
									</td>
									<td class="date-cell">{formatDate(o.order_date)}</td>
									<td class="date-cell">
										{#if o.deliver_at}
											<span class:overdue={new Date(o.deliver_at) < new Date() && !o.is_shipped}>
												{formatDate(o.deliver_at)}
											</span>
										{:else}
											—
										{/if}
									</td>
									{#if userRole === 'admin'}
										<td class="ref-cell">
											{#if o.our_reference?.name}
												<span class="ref-name">{o.our_reference.name}</span>
											{/if}
											{#if o.our_reference?.contact_email}
												<span class="ref-email">{o.our_reference.contact_email}</span>
											{/if}
											{#if !o.our_reference?.name && !o.our_reference?.contact_email}
												<span class="ref-empty">—</span>
											{/if}
										</td>
									{/if}
									<td class="amount-cell">
										{formatAmount(o.total_total, o.currency)}
									</td>
									<td>
										<span class="status-badge {st.cls}">{st.label}</span>
									</td>
									<td class="actions-cell">
										<button class="details-btn" onclick={() => openDetails(o)}>
											Details
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="result-count">
					Showing {filtered().length} of {orders.length} open order{orders.length !== 1 ? 's' : ''}
				</p>
			{/if}
		{/if}
	</main>
</div>

<!-- ── Order details modal ──────────────────────────────────────────────────── -->
{#if detailOrder}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="modal-backdrop" role="dialog" aria-modal="true" onkeydown={handleModalKeydown}>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="modal-overlay" onclick={closeDetails}></div>
		<div class="modal">
			<!-- Header -->
			<div class="modal-header">
				<div class="modal-title-group">
					<h2 class="modal-title">Order #{detailOrder.number}</h2>
					<div class="modal-meta">
						<span class="modal-customer">{detailOrder.customer?.name ?? '—'}</span>
						{#if detailOrder.order_date}
							<span class="modal-sep">·</span>
							<span class="modal-date">{formatDate(detailOrder.order_date)}</span>
						{/if}
						<span class="modal-sep">·</span>
						<span class="status-badge {statusLabel(detailOrder).cls}">{statusLabel(detailOrder).label}</span>
					</div>
				</div>
				<button class="modal-close" onclick={closeDetails} aria-label="Close">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
					</svg>
				</button>
			</div>

			<!-- Body -->
			<div class="modal-body">
				{#if linesLoading}
					<div class="lines-loading">
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin">
							<path d="M21 12a9 9 0 11-6.219-8.56"/>
						</svg>
						Loading line items…
					</div>
				{:else if linesError}
					<div class="lines-error">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
						</svg>
						{linesError}
					</div>
				{:else if lines.length === 0}
					<div class="lines-empty">No line items found for this order.</div>
				{:else}
					<table class="lines-table">
						<thead>
							<tr>
								<th>Item</th>
								<th class="col-sku">SKU</th>
								<th class="col-num">Qty</th>
								<th class="col-num">Shipped</th>
								<th class="col-unit">Unit</th>
								<th class="col-disc">Disc.</th>
								<th class="col-amount">Line total</th>
							</tr>
						</thead>
						<tbody>
							{#each lines as line (line.id)}
								<tr>
									<td class="line-name">{line.name}</td>
									<td class="line-sku">{line.item?.number ?? '—'}</td>
									<td class="line-num">{line.quantity}</td>
									<td class="line-num">{line.quantity_shipped}</td>
									<td class="line-unit">{line.unit?.name ?? '—'}</td>
									<td class="line-disc">
										{line.discount_percentage > 0 ? `${line.discount_percentage}%` : '—'}
									</td>
									<td class="line-amount">
										{formatAmount(line.line_total, detailOrder.currency)}
									</td>
								</tr>
							{/each}
						</tbody>
						<tfoot>
							<tr>
								<td colspan={6} class="foot-label">Total</td>
								<td class="foot-amount">{formatAmount(detailOrder.total_total, detailOrder.currency)}</td>
							</tr>
						</tfoot>
					</table>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	@keyframes spin { to { transform: rotate(360deg); } }
	.spin { animation: spin 0.8s linear infinite; }

	.page { min-height: 100vh; display: flex; flex-direction: column; }

	main {
		flex: 1;
		max-width: 1200px;
		margin: 0 auto;
		width: 100%;
		padding: 32px 28px 80px;
	}

	.page-header {
		display: flex; align-items: flex-start; justify-content: space-between;
		gap: 16px; margin-bottom: 24px;
	}
	.create-drafts-link {
		display: inline-flex; align-items: center;
		padding: 7px 14px; border: 1px solid var(--border); border-radius: 10px;
		background: white; color: #18181B;
		font-size: 13px; font-weight: 600; text-decoration: none;
		white-space: nowrap; transition: background 0.15s;
	}
	.create-drafts-link:hover { background: #F4F4F5; }
	.page-title {
		font-size: 18px; font-weight: 700;
		color: #18181B; letter-spacing: -0.3px; margin: 0 0 2px;
	}
	.page-sub { font-size: 13px; color: #A1A1AA; margin: 0; }

	/* Error */
	.error-banner {
		display: flex; align-items: center; gap: 10px;
		padding: 14px 18px; background: #FEF2F2;
		border: 1px solid #fecaca; border-radius: 12px;
		font-size: 14px; color: #dc2626;
	}
	.retry-btn {
		margin-left: auto;
		padding: 5px 12px; border: 1px solid #fecaca;
		border-radius: 7px; background: white; color: #dc2626;
		font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer;
	}
	.retry-btn:hover { background: #FEF2F2; }

	/* Loading */
	.loading-state {
		display: flex; align-items: center; gap: 10px;
		padding: 60px 0; justify-content: center;
		font-size: 14px; color: #71717A;
	}

	/* Toolbar */
	.toolbar {
		display: flex; align-items: center; gap: 10px;
		margin-bottom: 16px; flex-wrap: wrap;
	}

	.tabs {
		display: flex; gap: 2px;
		background: white;
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 3px;
	}
	.tab {
		display: inline-flex; align-items: center; gap: 6px;
		padding: 5px 12px; border: none; border-radius: 7px;
		font-size: 13px; font-weight: 600; font-family: inherit;
		color: #71717A; background: none; cursor: pointer;
		transition: background 0.15s, color 0.15s; white-space: nowrap;
	}
	.tab:hover { color: #18181B; }
	.tab.active { background: #F57832; color: white; }
	.tab-count {
		font-size: 11px; font-weight: 700;
		background: rgba(255,255,255,0.25);
		border-radius: 100px; padding: 1px 6px;
		color: inherit;
	}
	.tab:not(.active) .tab-count { background: #F4F4F5; color: #71717A; }

	.search-wrap {
		flex: 1; position: relative; display: flex; align-items: center;
		min-width: 200px; max-width: 320px;
	}
	.search-icon {
		position: absolute; left: 10px; color: #A1A1AA; pointer-events: none;
	}
	.search-input {
		width: 100%; padding: 7px 12px 7px 30px;
		border: 1px solid var(--border); border-radius: 100px;
		font-size: 13px; font-family: inherit; color: #18181B;
		background: white; outline: none;
		transition: border-color 0.15s, box-shadow 0.15s;
	}
	.search-input:focus { border-color: #A1A1AA; box-shadow: 0 0 0 3px rgba(0,0,0,0.05); }

	.refresh-btn {
		display: flex; align-items: center; justify-content: center;
		width: 34px; height: 34px; border-radius: 10px;
		border: 1px solid var(--border); background: white;
		color: #71717A; cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.refresh-btn:hover { background: #F4F4F5; color: #18181B; }

	/* Empty / no-results */
	.empty {
		display: flex; flex-direction: column; align-items: center;
		gap: 10px; padding: 80px 24px; text-align: center;
	}
	.empty-icon {
		width: 52px; height: 52px; background: white;
		border: 1px solid var(--border); border-radius: 14px;
		display: flex; align-items: center; justify-content: center;
		color: #A1A1AA; margin-bottom: 4px;
	}
	.empty-title { font-size: 15px; font-weight: 700; color: #18181B; }
	.empty-sub   { font-size: 13px; color: #71717A; }
	.no-results  { padding: 48px 0; text-align: center; font-size: 14px; color: #71717A; }

	/* Orders table */
	.table-wrap {
		background: white;
		border: 1px solid var(--border);
		border-radius: 16px;
		overflow: hidden;
		box-shadow: var(--shadow);
	}
	.table { width: 100%; border-collapse: collapse; }
	.table thead tr { border-bottom: 1px solid var(--border); }
	.table th {
		padding: 11px 18px;
		font-size: 11px; font-weight: 700;
		color: #A1A1AA; text-align: left;
		text-transform: uppercase; letter-spacing: 0.05em;
		white-space: nowrap;
	}
	.table tbody tr { border-bottom: 1px solid #F4F4F5; transition: background 0.1s; }
	.table tbody tr:last-child { border-bottom: none; }
	.table tbody tr:hover { background: #FAFAFA; }
	.table td { padding: 12px 18px; font-size: 13px; color: #18181B; vertical-align: middle; }

	.order-num { white-space: nowrap; }
	.order-num-text { font-weight: 700; }

	.customer-cell { display: flex; flex-direction: column; gap: 2px; }
	.customer-name { font-weight: 600; color: #18181B; }
	.customer-num  { font-size: 11px; color: #A1A1AA; }

	.date-cell { white-space: nowrap; color: #52525B; }
	.overdue   { color: #dc2626; font-weight: 600; }

	.ref-cell  { display: flex; flex-direction: column; gap: 2px; }
	.ref-name  { font-weight: 600; font-size: 12px; color: #18181B; }
	.ref-email { font-size: 11px; color: #A1A1AA; }
	.ref-empty { color: #D1D5DB; }

	.amount-cell { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }

	.actions-cell { text-align: right; white-space: nowrap; padding-right: 14px; }
	.details-btn {
		padding: 5px 12px;
		border: 1px solid var(--border);
		border-radius: 7px;
		background: white;
		font-size: 12px; font-weight: 600; font-family: inherit;
		color: #52525B; cursor: pointer;
		transition: background 0.15s, border-color 0.15s, color 0.15s;
	}
	.details-btn:hover {
		background: #F4F4F5; border-color: #D1D5DB; color: #18181B;
	}

	.status-badge {
		display: inline-flex; align-items: center;
		padding: 3px 9px; border-radius: 100px;
		font-size: 11px; font-weight: 700;
		text-transform: uppercase; letter-spacing: 0.3px;
		white-space: nowrap;
	}
	.status-badge.draft    { background: #F4F4F5; color: #71717A; }
	.status-badge.booked   { background: #EFF6FF; color: #1D4ED8; }
	.status-badge.shipped  { background: #F0FDF4; color: #15803D; }

	.result-count { font-size: 12px; color: #A1A1AA; margin-top: 10px; text-align: right; }

	/* ── Modal ──────────────────────────────────────────────────────────────── */
	.modal-backdrop {
		position: fixed; inset: 0; z-index: 100;
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
		width: 100%; max-width: 780px;
		max-height: calc(100vh - 48px);
		display: flex; flex-direction: column;
		overflow: hidden;
	}

	.modal-header {
		display: flex; align-items: flex-start; gap: 16px;
		padding: 22px 24px 18px;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.modal-title-group { flex: 1; min-width: 0; }
	.modal-title {
		font-size: 17px; font-weight: 700; color: #18181B;
		margin: 0 0 5px; letter-spacing: -0.3px;
	}
	.modal-meta {
		display: flex; align-items: center; gap: 6px;
		flex-wrap: wrap;
	}
	.modal-customer { font-size: 13px; font-weight: 600; color: #52525B; }
	.modal-date     { font-size: 13px; color: #A1A1AA; }
	.modal-sep      { color: #D1D5DB; font-size: 13px; }

	.modal-close {
		flex-shrink: 0;
		width: 32px; height: 32px;
		display: flex; align-items: center; justify-content: center;
		border: 1px solid var(--border); border-radius: 8px;
		background: white; color: #71717A; cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.modal-close:hover { background: #F4F4F5; color: #18181B; }

	.modal-body {
		overflow-y: auto;
		padding: 0;
		flex: 1;
	}

	/* Line items loading / error / empty */
	.lines-loading, .lines-empty {
		display: flex; align-items: center; justify-content: center; gap: 8px;
		padding: 48px 24px; font-size: 13px; color: #71717A;
	}
	.lines-error {
		display: flex; align-items: center; gap: 8px;
		margin: 16px 24px; padding: 12px 16px;
		background: #FEF2F2; border: 1px solid #fecaca;
		border-radius: 10px; font-size: 13px; color: #dc2626;
	}

	/* Line items table */
	.lines-table {
		width: 100%; border-collapse: collapse;
	}
	.lines-table thead tr {
		border-bottom: 1px solid var(--border);
		position: sticky; top: 0; background: #FAFAFA;
	}
	.lines-table th {
		padding: 10px 20px;
		font-size: 11px; font-weight: 700;
		color: #A1A1AA; text-align: left;
		text-transform: uppercase; letter-spacing: 0.05em;
		white-space: nowrap;
	}
	.lines-table tbody tr { border-bottom: 1px solid #F4F4F5; }
	.lines-table tbody tr:last-child { border-bottom: none; }
	.lines-table tbody tr:hover { background: #FAFAFA; }
	.lines-table td { padding: 11px 20px; font-size: 13px; color: #18181B; vertical-align: middle; }

	.lines-table tfoot tr { border-top: 2px solid var(--border); background: #FAFAFA; }
	.lines-table tfoot td { padding: 11px 20px; font-size: 13px; }

	.line-name { font-weight: 600; }
	.line-sku  { font-size: 12px; color: #71717A; font-family: monospace; }
	.col-sku   { min-width: 80px; }
	.col-num, .line-num   { text-align: center; }
	.col-unit, .line-unit { color: #71717A; }
	.col-disc, .line-disc { text-align: center; color: #71717A; }
	.col-amount, .line-amount { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }

	.foot-label  { color: #71717A; font-weight: 600; text-align: right; }
	.foot-amount { text-align: right; font-weight: 700; color: #18181B; font-variant-numeric: tabular-nums; white-space: nowrap; }
</style>
