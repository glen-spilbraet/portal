<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { goto } from '$app/navigation';

	let { data } = $props();
	let busy = $state(false);

	async function newEvent() {
		if (busy) return;
		busy = true;
		try {
			const res = await fetch('/api/events', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: 'Untitled event', status: 'planned' })
			});
			const body = await res.json();
			if (!res.ok) throw new Error(body.message ?? 'Failed');
			await goto(`/events/${body.id}`);
		} catch (e) {
			alert(e instanceof Error ? e.message : String(e));
		} finally {
			busy = false;
		}
	}

	function fmtDate(d) {
		if (!d) return '—';
		try { return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
		catch { return d; }
	}
</script>

<svelte:head><title>Events — Product Portal</title></svelte:head>

<div class="page">
	<AppNav active="events" user={data.user} />

	<main>
		<div class="page-header">
			<div>
				<h1 class="page-title">Events</h1>
				<p class="page-sub">Track events, venues and participants — and share product info & material with venues.</p>
			</div>
			<button class="btn primary" onclick={newEvent} disabled={busy}>+ New event</button>
		</div>

		{#if data.events.length === 0}
			<p class="empty">No events yet. Click “New event” to create one.</p>
		{:else}
			<table class="tbl">
				<thead>
					<tr><th>Date</th><th>Event</th><th>Venue</th><th>Type</th><th>Status</th><th class="num">Participants</th><th class="num">SKUs</th><th class="num">Assets</th></tr>
				</thead>
				<tbody>
					{#each data.events as e (e.id)}
						<tr class="clickable" onclick={() => goto(`/events/${e.id}`)}>
							<td>{fmtDate(e.event_date)}</td>
							<td class="strong">{e.title || 'Untitled event'}</td>
							<td>{e.venue_name ?? '—'}</td>
							<td>{e.type_name ?? '—'}</td>
							<td><span class="status {e.status}">{e.status}</span></td>
							<td class="num">{e.participants_actual ?? e.participants_expected ?? '—'}</td>
							<td class="num">{e.sku_count}</td>
							<td class="num">{e.asset_count}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</main>
</div>

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; }
	main { flex: 1; max-width: 1000px; margin: 0 auto; width: 100%; padding: 32px 28px 80px; }
	.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
	.page-title { font-size: 18px; font-weight: 700; color: #18181B; margin: 0 0 2px; }
	.page-sub { font-size: 13px; color: #A1A1AA; margin: 0; max-width: 560px; }

	.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid var(--border); border-radius: 10px; background: white; font-size: 13px; font-weight: 600; font-family: inherit; color: #18181B; cursor: pointer; }
	.btn:hover:not(:disabled) { background: #FAFAFA; }
	.btn:disabled { opacity: 0.5; cursor: default; }
	.btn.primary { background: #F57832; color: white; border-color: #F57832; }
	.btn.primary:hover:not(:disabled) { background: #e26a26; }

	.tbl { width: 100%; border-collapse: collapse; background: white; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; font-size: 13px; }
	.tbl th { text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #A1A1AA; padding: 10px 14px; border-bottom: 1px solid var(--border); background: #FAFAFA; }
	.tbl td { padding: 12px 14px; border-bottom: 1px solid var(--border); color: #18181B; }
	.tbl tbody tr:last-child td { border-bottom: none; }
	.tbl tr.clickable { cursor: pointer; }
	.tbl tr.clickable:hover td { background: #FAFAFA; }
	.num { text-align: right; }
	.strong { font-weight: 600; }
	.empty { color: #A1A1AA; font-size: 13px; padding: 20px 0; }

	.status { font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 100px; text-transform: capitalize; }
	.status.planned { background: #FEF9C3; color: #a16207; }
	.status.confirmed { background: #DBEAFE; color: #1d4ed8; }
	.status.done { background: #F0FDF4; color: #16a34a; }
	.status.cancelled { background: #FEF2F2; color: #dc2626; }
</style>
