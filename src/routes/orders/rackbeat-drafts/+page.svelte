<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	let input   = $state('');
	let running = $state(false);
	/** @type {{ created: number, failed: number, results: any[] } | null} */
	let report  = $state(null);
	let runError = $state('');

	let dealIds = $derived([...new Set(
		input.split(/[\s,;]+/).map((s) => s.trim()).filter((s) => /^\d+$/.test(s))
	)]);

	let invalidTokens = $derived(
		input.split(/[\s,;]+/).map((s) => s.trim()).filter((s) => s && !/^\d+$/.test(s))
	);

	async function run() {
		if (dealIds.length === 0 || running) return;
		running = true;
		runError = '';
		report = null;
		try {
			const res = await fetch('/api/rackbeat-drafts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ dealIds })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body.message ?? `Error ${res.status}`);
			report = body;
		} catch (e) {
			runError = e instanceof Error ? e.message : String(e);
		} finally {
			running = false;
		}
	}
</script>

<svelte:head>
	<title>Rackbeat Drafts — Product Portal</title>
</svelte:head>

<div class="page">
	<AppNav active="orders" user={data.user} />

	<main>
		<div class="page-header">
			<div>
				<h1 class="page-title">Create Rackbeat drafts from HubSpot</h1>
				<p class="page-sub">
					Paste HubSpot deal ids — each deal becomes a draft customer order in Rackbeat.
					A deal is skipped entirely if anything is invalid (no partial orders).
				</p>
			</div>
			<a class="back-link" href="/orders">← Orders</a>
		</div>

		<div class="card">
			<label class="field-label" for="deal-ids">HubSpot deal ids</label>
			<textarea
				id="deal-ids"
				bind:value={input}
				rows="4"
				placeholder="e.g. 12345678901, 12345678902 — separated by commas, spaces or new lines"
				disabled={running}
			></textarea>

			<div class="actions">
				<span class="parse-info">
					{#if dealIds.length > 0}
						{dealIds.length} deal{dealIds.length === 1 ? '' : 's'} ready
					{:else}
						No valid deal ids yet
					{/if}
					{#if invalidTokens.length > 0}
						<span class="parse-warn">· ignoring: {invalidTokens.slice(0, 5).join(', ')}{invalidTokens.length > 5 ? '…' : ''}</span>
					{/if}
				</span>
				<button class="run-btn" onclick={run} disabled={running || dealIds.length === 0}>
					{#if running}
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin">
							<path d="M21 12a9 9 0 11-6.219-8.56"/>
						</svg>
						Creating drafts…
					{:else}
						Create {dealIds.length || ''} draft{dealIds.length === 1 ? '' : 's'}
					{/if}
				</button>
			</div>
		</div>

		{#if runError}
			<div class="error-banner">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
				</svg>
				{runError}
			</div>
		{/if}

		{#if report}
			<div class="report">
				<div class="report-summary">
					<span class="summary-chip ok">{report.created} created</span>
					{#if report.failed > 0}
						<span class="summary-chip fail">{report.failed} failed</span>
					{/if}
				</div>

				<table class="report-table">
					<thead>
						<tr>
							<th>Deal</th>
							<th>Status</th>
							<th>Rackbeat order</th>
							<th class="col-num">Lines</th>
							<th>Details</th>
						</tr>
					</thead>
					<tbody>
						{#each report.results as r (r.dealId)}
							<tr>
								<td class="deal-cell">
									<span class="deal-name">{r.dealName ?? '—'}</span>
									<span class="deal-id">#{r.dealId}{r.customerId ? ` · customer ${r.customerId}` : ''}</span>
								</td>
								<td>
									<span class="status-badge {r.status === 'created' ? 'created' : 'failed'}">
										{r.status === 'created' ? 'Created' : 'Failed'}
									</span>
								</td>
								<td class="order-cell">{r.rackbeatNumber ? `#${r.rackbeatNumber}` : '—'}</td>
								<td class="col-num">{r.lineCount}</td>
								<td class="details-cell">
									{#if r.errors.length === 0 && r.warnings.length === 0}
										—
									{:else}
										<ul class="detail-list">
											{#each r.errors as msg}
												<li class="detail-error">{msg}</li>
											{/each}
											{#each r.warnings as msg}
												<li class="detail-warning">{msg}</li>
											{/each}
										</ul>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</main>
</div>

<style>
	@keyframes spin { to { transform: rotate(360deg); } }
	.spin { animation: spin 0.8s linear infinite; }

	.page { min-height: 100vh; display: flex; flex-direction: column; }

	main {
		flex: 1;
		max-width: 1000px;
		margin: 0 auto;
		width: 100%;
		padding: 32px 28px 80px;
	}

	.page-header {
		display: flex; align-items: flex-start; justify-content: space-between;
		gap: 16px; margin-bottom: 24px;
	}
	.page-title {
		font-size: 18px; font-weight: 700;
		color: #18181B; letter-spacing: -0.3px; margin: 0 0 2px;
	}
	.page-sub { font-size: 13px; color: #A1A1AA; margin: 0; max-width: 560px; }
	.back-link {
		font-size: 13px; font-weight: 600; color: #71717A;
		text-decoration: none; white-space: nowrap; padding-top: 2px;
	}
	.back-link:hover { color: #18181B; }

	/* Input card */
	.card {
		background: white; border: 1px solid var(--border);
		border-radius: 14px; padding: 20px; margin-bottom: 20px;
	}
	.field-label {
		display: block; font-size: 13px; font-weight: 700;
		color: #18181B; margin-bottom: 8px;
	}
	textarea {
		width: 100%; padding: 10px 12px; resize: vertical;
		border: 1px solid var(--border); border-radius: 10px;
		font-size: 13px; font-family: inherit; color: #18181B;
		background: white; outline: none;
		transition: border-color 0.15s, box-shadow 0.15s;
	}
	textarea:focus { border-color: #A1A1AA; box-shadow: 0 0 0 3px rgba(0,0,0,0.05); }
	textarea::placeholder { color: #A1A1AA; }
	textarea:disabled { background: #FAFAFA; color: #71717A; }

	.actions {
		display: flex; align-items: center; justify-content: space-between;
		gap: 12px; margin-top: 12px; flex-wrap: wrap;
	}
	.parse-info { font-size: 13px; color: #71717A; }
	.parse-warn { color: #d97706; }

	.run-btn {
		display: inline-flex; align-items: center; gap: 7px;
		padding: 8px 16px; border: none; border-radius: 10px;
		background: #F57832; color: white;
		font-size: 13px; font-weight: 700; font-family: inherit;
		cursor: pointer; transition: background 0.15s;
	}
	.run-btn:hover:not(:disabled) { background: #e26a26; }
	.run-btn:disabled { opacity: 0.5; cursor: default; }

	/* Error */
	.error-banner {
		display: flex; align-items: center; gap: 10px;
		padding: 14px 18px; background: #FEF2F2;
		border: 1px solid #fecaca; border-radius: 12px;
		font-size: 14px; color: #dc2626; margin-bottom: 20px;
	}

	/* Report */
	.report-summary { display: flex; gap: 8px; margin-bottom: 12px; }
	.summary-chip {
		font-size: 12px; font-weight: 700; padding: 3px 10px;
		border-radius: 100px;
	}
	.summary-chip.ok   { background: #F0FDF4; color: #16a34a; border: 1px solid #bbf7d0; }
	.summary-chip.fail { background: #FEF2F2; color: #dc2626; border: 1px solid #fecaca; }

	.report-table {
		width: 100%; border-collapse: collapse;
		background: white; border: 1px solid var(--border);
		border-radius: 14px; overflow: hidden;
		font-size: 13px;
	}
	.report-table th {
		text-align: left; font-size: 11px; font-weight: 700;
		text-transform: uppercase; letter-spacing: 0.4px;
		color: #A1A1AA; padding: 10px 14px;
		border-bottom: 1px solid var(--border); background: #FAFAFA;
	}
	.report-table td {
		padding: 12px 14px; border-bottom: 1px solid var(--border);
		vertical-align: top; color: #18181B;
	}
	.report-table tbody tr:last-child td { border-bottom: none; }
	.col-num { text-align: right; }

	.deal-cell { display: flex; flex-direction: column; gap: 2px; }
	.deal-name { font-weight: 600; }
	.deal-id { font-size: 12px; color: #A1A1AA; }
	.order-cell { font-weight: 600; white-space: nowrap; }

	.status-badge {
		display: inline-block; font-size: 11px; font-weight: 700;
		padding: 2px 9px; border-radius: 100px; white-space: nowrap;
	}
	.status-badge.created { background: #F0FDF4; color: #16a34a; }
	.status-badge.failed  { background: #FEF2F2; color: #dc2626; }

	.details-cell { max-width: 340px; }
	.detail-list { margin: 0; padding-left: 16px; display: flex; flex-direction: column; gap: 3px; }
	.detail-error   { color: #dc2626; }
	.detail-warning { color: #d97706; }
</style>
