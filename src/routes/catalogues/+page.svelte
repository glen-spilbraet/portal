<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	const LANG_LABELS = { en: 'English', da: 'Dansk', sv: 'Svenska', no: 'Norsk' };

	function formatDate(ts) {
		return new Date(ts * 1000).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	async function deleteCatalogue(id, name) {
		if (!confirm(`Delete catalogue "${name}"? This cannot be undone.`)) return;
		const res = await fetch(`/api/catalogues/${id}`, { method: 'DELETE' });
		if (res.ok) {
			data = { ...data, catalogues: data.catalogues.filter(c => c.id !== id) };
		}
	}
</script>

<svelte:head>
	<title>Catalogues — Product Portal</title>
</svelte:head>


<div class="page">
	<AppNav active="catalogues" />

	<main>
		<div class="page-header">
			<h1 class="page-title">Catalogues</h1>
			<a href="/catalogues/new" class="btn-new">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
					<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
				</svg>
				New Catalogue
			</a>
		</div>

		{#if data.catalogues.length === 0}
			<div class="empty">
				<div class="empty-icon">
					<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
						<path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
					</svg>
				</div>
				<p class="empty-title">No catalogues yet</p>
				<p class="empty-sub">Create your first catalogue to bundle sheets for customers.</p>
				<a href="/catalogues/new" class="btn-new">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
						<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
					</svg>
					New Catalogue
				</a>
			</div>
		{:else}
			<div class="grid">
				{#each data.catalogues as cat}
					<div class="card">
						<div class="card-body">
							<div class="card-meta">
								<span class="lang-badge">{LANG_LABELS[cat.language] ?? cat.language}</span>
							</div>
							<h2>{cat.name || '(untitled)'}</h2>
							{#if cat.title}
								<p class="cat-title">{cat.title}</p>
							{/if}
							<p class="date">Updated {formatDate(cat.updated_at)}</p>
						</div>

						<div class="card-footer">
							<a href="/catalogues/{cat.id}" class="action-btn">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
									<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
									<path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
								</svg>
								Edit
							</a>
							<a href="/catalogues/{cat.id}/preview" target="_blank" class="action-btn">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
									<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
									<polyline points="15 3 21 3 21 9"/>
									<line x1="10" y1="14" x2="21" y2="3"/>
								</svg>
								Preview
							</a>
							<button
								class="action-btn danger"
								style="margin-left: auto"
								onclick={() => deleteCatalogue(cat.id, cat.name)}
							>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
									<polyline points="3 6 5 6 21 6"/>
									<path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
									<path d="M10 11v6M14 11v6"/>
									<path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
								</svg>
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</main>
</div>

<style>
	.page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	main {
		flex: 1;
		max-width: 1140px;
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
		transition: background 0.15s, transform 0.1s;
		letter-spacing: -0.1px;
	}
	.btn-new:hover { background: #E06820; }
	.btn-new:active { transform: scale(0.98); }

	.empty {
		text-align: center;
		padding: 100px 24px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}

	.empty-icon {
		width: 56px;
		height: 56px;
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
	.empty-sub { font-size: 14px; color: #71717A; margin-bottom: 4px; }

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 18px;
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
	.card:hover {
		box-shadow: var(--shadow-lg);
		transform: translateY(-1px);
	}

	.card-body {
		padding: 18px 20px 12px;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.card-meta {
		margin-bottom: 4px;
	}

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

	h2 {
		font-size: 16px;
		font-weight: 700;
		color: #18181B;
		line-height: 1.3;
		letter-spacing: -0.2px;
	}

	.cat-title {
		font-size: 13px;
		color: #71717A;
		line-height: 1.4;
	}

	.date {
		font-size: 11.5px;
		color: #A1A1AA;
		font-weight: 500;
		margin-top: 4px;
	}

	.card-footer {
		padding: 10px 14px 12px;
		display: flex;
		gap: 4px;
		align-items: center;
		border-top: 1px solid var(--border);
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 5px 10px;
		border-radius: 7px;
		font-size: 12px;
		font-weight: 600;
		color: #52525B;
		background: none;
		border: none;
		text-decoration: none;
		transition: background 0.15s, color 0.15s;
		cursor: pointer;
		font-family: inherit;
	}
	.action-btn:hover { background: #F4F4F5; color: #18181B; }
	.action-btn.danger { color: #A1A1AA; }
	.action-btn.danger:hover { background: #FEF2F2; color: var(--danger); }
</style>
