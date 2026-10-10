<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { goto, invalidateAll } from '$app/navigation';

	let { data } = $props();
	let busy = $state(false);

	const METRIC_LABEL = { units: 'Units', revenue: 'Revenue', both: 'Units + revenue' };
	function fmtDate(ts) {
		return new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	async function newReport() {
		if (busy) return;
		busy = true;
		try {
			const res = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Untitled report', metric: 'both' }) });
			const b = await res.json();
			if (!res.ok) throw new Error(b.message ?? 'Failed');
			await goto(`/reports/${b.id}`);
		} catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { busy = false; }
	}

	async function del(id, name) {
		if (!confirm(`Delete report "${name}"? The shared link will stop working.`)) return;
		await fetch(`/api/reports/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}
</script>

<svelte:head><title>Reports — Product Portal</title></svelte:head>

<div class="page">
	<AppNav active="reports" user={data.user} />
	<main>
		<div class="page-header">
			<div>
				<h1 class="page-title">Reports</h1>
				<p class="page-sub">Custom sales reports with include/exclude product rules and a shareable link.</p>
			</div>
			<button class="btn primary" onclick={newReport} disabled={busy}>+ New report</button>
		</div>

		{#if data.reports.length === 0}
			<p class="empty">No reports yet. Click “New report” to build one.</p>
		{:else}
			<table class="tbl">
				<colgroup><col /><col class="c-metric" /><col class="c-rules" /><col class="c-date" /><col class="c-act" /></colgroup>
				<thead>
					<tr><th>Report</th><th>Shows</th><th class="num">Rules</th><th>Updated</th><th>Actions</th></tr>
				</thead>
				<tbody>
					{#each data.reports as r (r.id)}
						<tr class="clickable" onclick={() => goto(`/reports/${r.id}`)}>
							<td class="strong">{r.name}</td>
							<td>{METRIC_LABEL[r.metric] ?? r.metric}</td>
							<td class="num">{r.rule_count}</td>
							<td class="muted">{fmtDate(r.updated_at)}</td>
							<td class="acts" onclick={(e) => e.stopPropagation()}>
								<a class="link" href="/reports/{r.id}">Edit</a>
								<a class="link" href="/reports/share/{r.share_token}" target="_blank" rel="noopener">View</a>
								<button class="link danger" onclick={() => del(r.id, r.name)}>Delete</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</main>
</div>

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; }
	main { flex: 1; max-width: 1040px; margin: 0 auto; width: 100%; padding: 32px 28px 80px; }
	.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
	.page-title { font-size: 18px; font-weight: 700; color: #18181B; margin: 0 0 2px; }
	.page-sub { font-size: 13px; color: #A1A1AA; margin: 0; max-width: 560px; }
	.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid var(--border); border-radius: 10px; background: white; font-size: 13px; font-weight: 600; font-family: inherit; color: #18181B; cursor: pointer; }
	.btn.primary { background: #F57832; color: white; border-color: #F57832; }
	.btn.primary:hover:not(:disabled) { background: #e26a26; }
	.btn:disabled { opacity: 0.5; cursor: default; }
	.empty { color: #A1A1AA; font-size: 13px; padding: 20px 0; }

	.tbl { width: 100%; table-layout: fixed; border-collapse: collapse; background: white; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; font-size: 13px; }
	.c-metric { width: 140px; } .c-rules { width: 72px; } .c-date { width: 130px; } .c-act { width: 190px; }
	.tbl th { text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #A1A1AA; padding: 10px 14px; border-bottom: 1px solid var(--border); background: #FAFAFA; }
	.tbl td { padding: 12px 14px; border-bottom: 1px solid var(--border); color: #18181B; overflow: hidden; text-overflow: ellipsis; }
	.tbl tbody tr:last-child td { border-bottom: none; }
	.tbl tr.clickable { cursor: pointer; }
	.tbl tr.clickable:hover td { background: #FAFAFA; }
	.num { text-align: right; }
	.strong { font-weight: 600; white-space: normal; word-break: break-word; }
	.muted { color: #A1A1AA; }
	.acts { white-space: nowrap; display: flex; gap: 12px; }
	.link { background: none; border: none; padding: 0; font: inherit; font-weight: 600; color: #6D5BD0; cursor: pointer; text-decoration: none; }
	.link:hover { text-decoration: underline; }
	.link.danger { color: #c23b26; }
</style>
