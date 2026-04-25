<script>
	import AppNav from '$lib/components/AppNav.svelte';
	let { data } = $props();

	let products = $state(data.products);
	let creating = $state(false);
	let newName = $state('');

	function formatDate(ts) {
		return new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	async function create() {
		if (!newName.trim() || creating) return;
		creating = true;
		try {
			const res = await fetch('/api/data-products', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: newName.trim() })
			});
			if (res.ok) {
				const { id } = await res.json();
				window.location.href = `/data/${id}`;
			}
		} finally {
			creating = false;
		}
	}

	async function deleteProduct(id, name) {
		if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
		await fetch(`/api/data-products/${id}`, { method: 'DELETE' });
		products = products.filter(p => p.id !== id);
	}
</script>

<svelte:head>
	<title>Data — Product Portal</title>
</svelte:head>


<div class="page">
	<AppNav active="data" />

	<main>
		<div class="page-header">
			<h1 class="page-title">Projects</h1>
			<div class="create-wrap">
				<input
					class="name-input"
					type="text"
					placeholder="New project name…"
					bind:value={newName}
					onkeydown={(e) => e.key === 'Enter' && create()}
				/>
				<button class="btn-new" onclick={create} disabled={creating || !newName.trim()}>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
						<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
					</svg>
					{creating ? 'Creating…' : 'New Project'}
				</button>
			</div>
		</div>

		{#if products.length === 0}
			<div class="empty">
				<div class="empty-icon">
					<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0018 0V5"/><path d="M3 12a9 3 0 0018 0"/>
					</svg>
				</div>
				<p class="empty-title">No data products yet</p>
				<p class="empty-sub">Create a product to start mapping and exporting data.</p>
			</div>
		{:else}
			<div class="list">
				{#each products as product}
					{@const headers = JSON.parse(product.template_headers || '[]')}
					{@const skus = JSON.parse(product.skus || '[]')}
					{@const mappings = JSON.parse(product.mappings || '{}')}
					{@const mappedCount = Object.values(mappings).filter(Boolean).length}
					<div class="row">
						<a href="/data/{product.id}" class="row-main">
							<div class="row-icon">
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
									<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0018 0V5"/><path d="M3 12a9 3 0 0018 0"/>
								</svg>
							</div>
							<div class="row-info">
								<span class="row-name">{product.name}</span>
								<span class="row-meta">
									{#if headers.length > 0}
										{headers.length} columns · {mappedCount} mapped
									{:else}
										No template
									{/if}
									{#if skus.length > 0}
										 · {skus.length} SKUs
									{/if}
								</span>
							</div>
							<span class="row-date">{formatDate(product.updated_at)}</span>
						</a>
						<div class="row-actions">
							<a href="/data/{product.id}" class="action-btn">Open</a>
							<button class="action-btn danger" onclick={() => deleteProduct(product.id, product.name)}>Delete</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</main>
</div>

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; background: #FFF5D2; }

	main {
		flex: 1;
		max-width: 860px;
		margin: 0 auto;
		width: 100%;
		padding: 32px 28px 80px;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 24px;
		gap: 16px;
	}

	.page-title { font-size: 18px; font-weight: 700; color: #18181B; letter-spacing: -0.3px; }

	.create-wrap { display: flex; gap: 8px; align-items: center; }

	.name-input {
		padding: 7px 14px;
		border: 1px solid var(--border);
		border-radius: 100px;
		font-size: 13px;
		font-family: inherit;
		color: #18181B;
		background: white;
		outline: none;
		width: 220px;
		transition: border-color 0.15s;
	}
	.name-input:focus { border-color: #A1A1AA; }
	.name-input::placeholder { color: #A1A1AA; }

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
		font-family: inherit;
		cursor: pointer;
		transition: background 0.15s;
		white-space: nowrap;
	}
	.btn-new:hover:not(:disabled) { background: #E06820; }
	.btn-new:disabled { opacity: 0.5; cursor: not-allowed; }

	/* Empty state */
	.empty {
		text-align: center;
		padding: 100px 24px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
	}
	.empty-icon {
		width: 56px; height: 56px;
		background: white;
		border: 1px solid var(--border);
		border-radius: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #A1A1AA;
		margin-bottom: 4px;
	}
	.empty-title { font-size: 16px; font-weight: 700; color: #18181B; }
	.empty-sub { font-size: 14px; color: #71717A; }

	/* List */
	.list { display: flex; flex-direction: column; gap: 2px; }

	.row {
		display: flex;
		align-items: center;
		background: white;
		border: 1px solid var(--border);
		border-radius: 12px;
		overflow: hidden;
		transition: box-shadow 0.15s;
	}
	.row:hover { box-shadow: var(--shadow); }

	.row-main {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 18px;
		text-decoration: none;
		color: inherit;
		min-width: 0;
	}

	.row-icon {
		width: 40px; height: 40px;
		background: #F4F4F5;
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #71717A;
		flex-shrink: 0;
	}

	.row-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.row-name { font-size: 14px; font-weight: 700; color: #18181B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.row-meta { font-size: 12px; color: #A1A1AA; font-weight: 500; }
	.row-date { font-size: 12px; color: #A1A1AA; white-space: nowrap; flex-shrink: 0; }

	.row-actions {
		display: flex;
		gap: 2px;
		padding: 0 10px;
		flex-shrink: 0;
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		padding: 5px 10px;
		border-radius: 7px;
		font-size: 12px;
		font-weight: 600;
		color: #52525B;
		background: none;
		border: none;
		text-decoration: none;
		cursor: pointer;
		font-family: inherit;
		transition: background 0.15s, color 0.15s;
	}
	.action-btn:hover { background: #F4F4F5; color: #18181B; }
	.action-btn.danger:hover { background: #FEF2F2; color: var(--danger); }
</style>
