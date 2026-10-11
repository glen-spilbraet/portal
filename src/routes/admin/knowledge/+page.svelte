<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { goto, invalidateAll } from '$app/navigation';

	let { data } = $props();

	function fmtDate(d) { return d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }
	function fmtTs(ts) { return new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

	async function del(id, title) {
		if (!confirm(`Delete "${title || 'Untitled'}"?`)) return;
		const res = await fetch(`/api/knowledge/${id}`, { method: 'DELETE' });
		if (res.ok) await invalidateAll(); else alert('Delete failed');
	}
</script>

<svelte:head><title>Knowledge overview — Admin</title></svelte:head>

<AppNav active="admin" user={data.user} />
<main class="wrap">
	<div class="head">
		<div>
			<h1>Knowledge overview</h1>
			<p class="sub">Everything submitted to the knowledge base — all teams, all visibility.</p>
		</div>
		<a class="btn" href="/knowledge">← Knowledge</a>
	</div>

	{#if data.items.length === 0}
		<p class="empty">Nothing submitted yet.</p>
	{:else}
		<table class="tbl">
			<colgroup><col /><col class="c-type" /><col class="c-date" /><col class="c-teams" /><col class="c-vis" /><col class="c-by" /><col class="c-act" /></colgroup>
			<thead><tr><th>Title</th><th>Type</th><th>Date</th><th>Teams</th><th>Visibility</th><th>Submitted</th><th></th></tr></thead>
			<tbody>
				{#each data.items as i (i.id)}
					<tr class="clickable" onclick={() => goto(`/knowledge/${i.id}`)}>
						<td class="strong">{i.title || 'Untitled'}</td>
						<td>{i.type}</td>
						<td class="muted">{fmtDate(i.happened_on)}</td>
						<td class="muted">{i.teams || '—'}</td>
						<td>{#if i.visibility === 'all_staff'}<span class="pill all">All staff</span>{:else}<span class="pill">Participants</span>{/if}</td>
						<td class="muted">{i.created_by || '—'}<br /><span class="ts">{fmtTs(i.created_at)}</span></td>
						<td class="acts" onclick={(e) => e.stopPropagation()}>
							<button class="link danger" onclick={() => del(i.id, i.title)}>Delete</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</main>

<style>
	.wrap { max-width: 1040px; margin: 0 auto; padding: 32px 28px 80px; }
	.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
	h1 { font-size: 20px; font-weight: 800; margin: 0 0 3px; }
	.sub { font-size: 13px; color: #A1A1AA; margin: 0; }
	.btn { padding: 8px 14px; border: 1px solid var(--border); border-radius: 9px; background: #fff; font-size: 13px; font-weight: 600; color: #18181B; text-decoration: none; }
	.empty { color: #A1A1AA; font-size: 14px; padding: 30px 0; }
	.tbl { width: 100%; table-layout: fixed; border-collapse: collapse; background: #fff; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; font-size: 13px; }
	.c-type { width: 86px; } .c-date { width: 110px; } .c-teams { width: 160px; } .c-vis { width: 110px; } .c-by { width: 160px; } .c-act { width: 80px; }
	.tbl th { text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #A1A1AA; padding: 10px 14px; border-bottom: 1px solid var(--border); background: #FAFAFA; }
	.tbl td { padding: 11px 14px; border-bottom: 1px solid var(--border); color: #18181B; overflow: hidden; text-overflow: ellipsis; }
	.tbl tbody tr:last-child td { border-bottom: none; }
	.clickable { cursor: pointer; } .clickable:hover td { background: #FAFAFA; }
	.strong { font-weight: 600; white-space: normal; word-break: break-word; }
	.muted { color: #A1A1AA; } .ts { font-size: 11px; color: #c4b99a; }
	.pill { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 100px; background: #F4F4F5; color: #71717A; }
	.pill.all { background: #E7F6EC; color: #16794C; }
	.link { background: none; border: none; font: inherit; font-weight: 600; cursor: pointer; color: #6D5BD0; }
	.link.danger { color: #c23b26; }
</style>
