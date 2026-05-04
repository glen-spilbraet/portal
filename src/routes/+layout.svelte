<script>
	import '../app.css';
	let { children, data } = $props();
</script>

<svelte:head>
	<title>Product Portal</title>
	<meta name="robots" content="noindex, nofollow" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
</svelte:head>

{#if data?.simulatedAs}
	<div class="sim-bar">
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
			<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
			<path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
		</svg>
		Simulating
		<strong>{data.simulatedAs.first_name ?? data.simulatedAs.email}</strong>
		<span class="sim-email">({data.simulatedAs.email})</span>
		<a href="/api/admin/simulate/end" class="sim-end">End simulation</a>
	</div>
{/if}

{@render children()}

<style>
	.sim-bar {
		position: sticky;
		top: 0;
		z-index: 200;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 20px;
		height: 40px;
		background: #1e3a5f;
		color: #bfdbfe;
		font-size: 13px;
		font-weight: 500;
		font-family: 'Nunito', sans-serif;
	}
	.sim-bar strong { color: white; font-weight: 700; }
	.sim-email { color: #93c5fd; font-size: 12px; }
	.sim-end {
		margin-left: auto;
		padding: 5px 14px;
		background: rgba(255,255,255,0.12);
		border: 1px solid rgba(255,255,255,0.2);
		border-radius: 7px;
		color: white;
		font-size: 12px;
		font-weight: 700;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.15s;
	}
	.sim-end:hover { background: rgba(255,255,255,0.22); }
</style>
