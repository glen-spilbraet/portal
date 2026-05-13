<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	function formatDate(ts) {
		if (!ts) return '—';
		return new Date(ts * 1000).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
		});
	}
</script>

<svelte:head>
	<title>Analytics — Admin</title>
</svelte:head>

<AppNav active="analytics" user={data.user} />

<main class="page">
	<div class="page-header">
		<div>
			<h1 class="page-title">Catalogue Analytics</h1>
			<p class="page-sub">Visits via share links</p>
		</div>
	</div>

	{#if data.catalogues.length === 0}
		<div class="empty">
			<svg
				width="32"
				height="32"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M3 3l18 18M10.584 10.587a2 2 0 002.828 2.83" />
				<path
					d="M9.363 5.365A9.466 9.466 0 0112 5c4.478 0 8.268 2.943 9.543 7a9.89 9.89 0 01-1.807 3.13M6.72 6.717A9.81 9.81 0 002.457 12c1.274 4.057 5.065 7 9.543 7a9.468 9.468 0 004.885-1.35"
				/>
			</svg>
			<p>No share link visits recorded yet.</p>
			<span>Analytics appear once someone opens a catalogue via a share link.</span>
		</div>
	{:else}
		<div class="table-wrap">
			<table class="table">
				<thead>
					<tr>
						<th>Catalogue</th>
						<th class="th-num">Sessions</th>
						<th class="th-num">Events</th>
						<th>Last visit</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.catalogues as cat (cat.id)}
						<tr>
							<td class="td-name">
								<span class="cat-name">{cat.name}</span>
								{#if cat.language}
									<span class="lang-badge">{cat.language.toUpperCase()}</span>
								{/if}
							</td>
							<td class="td-num">{cat.session_count}</td>
							<td class="td-num muted">{cat.event_count}</td>
							<td class="td-date">{formatDate(cat.last_visit)}</td>
							<td class="td-action">
								<a href="/admin/analytics/{cat.id}" class="view-btn">
									View log
									<svg
										width="12"
										height="12"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2.5"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<polyline points="9 18 15 12 9 6" />
									</svg>
								</a>
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
		max-width: 860px;
		margin: 0 auto;
		padding: 40px 28px 80px;
	}

	.page-header {
		margin-bottom: 28px;
	}

	.page-title {
		font-size: 26px;
		font-weight: 800;
		color: #18181b;
		letter-spacing: -0.5px;
		margin: 0 0 4px;
	}

	.page-sub {
		font-size: 14px;
		color: #a89060;
		font-weight: 500;
		margin: 0;
	}

	/* ── Empty ───────────────────────────────────────────────────────────────── */

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 80px 0;
		color: #a0998a;
		text-align: center;
	}

	.empty p {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		color: #71717a;
	}

	.empty span {
		font-size: 13px;
	}

	/* ── Table ───────────────────────────────────────────────────────────────── */

	.table-wrap {
		background: white;
		border: 1px solid var(--border);
		border-radius: 14px;
		overflow: hidden;
	}

	.table {
		width: 100%;
		border-collapse: collapse;
	}

	.table thead tr {
		border-bottom: 1px solid var(--border);
	}

	.table th {
		padding: 10px 20px;
		font-size: 11px;
		font-weight: 700;
		color: #a0998a;
		text-align: left;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: #fafaf8;
	}

	.th-num {
		text-align: right;
	}

	.table tbody tr {
		border-bottom: 1px solid #f5f3ef;
		transition: background 0.1s;
	}

	.table tbody tr:last-child {
		border-bottom: none;
	}

	.table tbody tr:hover {
		background: #fdfcfa;
	}

	.table td {
		padding: 14px 20px;
		font-size: 14px;
		color: #3a3228;
		vertical-align: middle;
	}

	.td-name {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.cat-name {
		font-weight: 600;
		color: #18181b;
	}

	.lang-badge {
		font-size: 10px;
		font-weight: 700;
		padding: 1px 6px;
		border-radius: 5px;
		background: #f0f0ff;
		color: #4338ca;
		letter-spacing: 0.04em;
	}

	.td-num {
		text-align: right;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.td-num.muted {
		color: #a0998a;
		font-weight: 400;
	}

	.td-date {
		color: #a0998a;
		font-size: 13px;
	}

	.td-action {
		text-align: right;
	}

	.view-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 6px 12px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 600;
		color: #6b5e4e;
		text-decoration: none;
		background: #f5f3ef;
		border: 1px solid var(--border);
		transition: background 0.12s, color 0.12s;
	}

	.view-btn:hover {
		background: #fff5d2;
		color: #7b3803;
		border-color: #f5d87a;
	}
</style>
