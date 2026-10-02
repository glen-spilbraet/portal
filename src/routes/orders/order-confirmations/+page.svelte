<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { renderOrderPdf } from '$lib/orderConfirmationPdf.js';

	let { data } = $props();

	let input = $state('');
	let running = $state(false);
	let error = $state('');
	/** @type {any[]} */
	let orders = $state([]);
	/** @type {any[]} */
	let unresolved = $state([]);

	const LANG_LABEL = { da: 'Danish', sv: 'Swedish', no: 'Norwegian', en: 'English' };

	let tokens = $derived([...new Set(input.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean))]);

	const money = (n) => new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
	function safe(name) { return (name || 'order').replace(/[^a-z0-9æøåäö\- _]/gi, '').trim().slice(0, 60) || 'order'; }

	async function generate() {
		if (!tokens.length || running) return;
		running = true; error = ''; orders = []; unresolved = [];
		try {
			const res = await fetch('/api/order-confirmations/run', {
				method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body.message ?? `Error ${res.status}`);
			orders = body.orders ?? [];
			unresolved = body.unresolved ?? [];
			if (orders.length) await downloadPdfs();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			running = false;
		}
	}

	async function downloadPdfs() {
		if (orders.length === 1) {
			const doc = await renderOrderPdf(orders[0]);
			doc.save(`${safe(orders[0].dealName || orders[0].dealId)}.pdf`);
			return;
		}
		const { default: JSZip } = await import('jszip');
		const zip = new JSZip();
		const seen = {};
		for (const o of orders) {
			const doc = await renderOrderPdf(o);
			let base = safe(o.dealName || o.dealId);
			seen[base] = (seen[base] || 0) + 1;
			if (seen[base] > 1) base = `${base} (${seen[base]})`;
			zip.file(`${base}.pdf`, doc.output('blob'));
		}
		const blob = await zip.generateAsync({ type: 'blob' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url; a.download = `order-confirmations-${new Date().toISOString().slice(0, 10)}.zip`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 2000);
	}

	async function downloadOne(o) {
		const doc = await renderOrderPdf(o);
		doc.save(`${safe(o.dealName || o.dealId)}.pdf`);
	}
</script>

<svelte:head><title>Order Confirmations — Product Portal</title></svelte:head>

<div class="page">
	<AppNav active="order-confirmations" user={data.user} />

	<main>
		<div class="page-header">
			<div>
				<h1 class="page-title">Order Confirmations</h1>
				<p class="page-sub">Paste HubSpot deal IDs or exact order names — get a localised order-confirmation PDF per order (DA/SE/NO/EN by market).</p>
			</div>
		</div>

		<div class="card">
			<label class="field-label" for="input">HubSpot deal ids or order names</label>
			<textarea id="input" rows="5" bind:value={input} disabled={running}
				placeholder="One per line — e.g. 508102277349 or Proshop - Christmas Order"></textarea>
			<div class="actions">
				<span class="muted">{tokens.length} item{tokens.length === 1 ? '' : 's'}</span>
				<button class="btn primary" onclick={generate} disabled={running || tokens.length === 0}>
					{running ? 'Generating…' : `Generate ${tokens.length || ''} confirmation${tokens.length === 1 ? '' : 's'}`}
				</button>
			</div>
		</div>

		{#if error}<div class="banner err">{error}</div>{/if}

		{#if unresolved.length}
			<div class="banner warn">
				<strong>{unresolved.length} not matched:</strong>
				<ul>{#each unresolved as u}<li>“{u.input}” — {u.reason}{#if u.candidates}: {u.candidates.map((c) => `${c.name} (${c.id})`).join(', ')}{/if}</li>{/each}</ul>
			</div>
		{/if}

		{#if orders.length}
			<table class="tbl">
				<thead><tr><th>Order</th><th>Buyer</th><th>Market</th><th class="num">Lines</th><th class="num">Total</th><th></th></tr></thead>
				<tbody>
					{#each orders as o (o.dealId)}
						<tr>
							<td class="strong">{o.dealName || o.dealId}</td>
							<td>{o.buyer?.name ?? '—'}</td>
							<td>{LANG_LABEL[o.lang] ?? o.lang}</td>
							<td class="num">{o.lines.length}</td>
							<td class="num">{money(o.total)} {o.currency}</td>
							<td class="num"><button class="btn sm" onclick={() => downloadOne(o)}>PDF</button></td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if orders.length > 1}
				<div class="redownload"><button class="btn" onclick={downloadPdfs}>⬇ Download ZIP again</button></div>
			{/if}
		{/if}
	</main>
</div>

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; }
	main { flex: 1; max-width: 1000px; margin: 0 auto; width: 100%; padding: 32px 28px 80px; }
	.page-header { margin-bottom: 20px; }
	.page-title { font-size: 18px; font-weight: 700; color: #18181B; margin: 0 0 2px; }
	.page-sub { font-size: 13px; color: #A1A1AA; margin: 0; max-width: 620px; }

	.card { background: white; border: 1px solid var(--border); border-radius: 14px; padding: 20px; margin-bottom: 18px; }
	.field-label { display: block; font-size: 13px; font-weight: 700; color: #18181B; margin-bottom: 8px; }
	textarea { width: 100%; padding: 10px 12px; resize: vertical; border: 1px solid var(--border); border-radius: 10px; font-size: 13px; font-family: inherit; color: #18181B; background: white; outline: none; }
	textarea:focus { border-color: #A1A1AA; }
	.actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; }
	.muted { font-size: 13px; color: #71717A; }

	.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid var(--border); border-radius: 10px; background: white; font-size: 13px; font-weight: 600; font-family: inherit; color: #18181B; cursor: pointer; }
	.btn:hover:not(:disabled) { background: #FAFAFA; }
	.btn:disabled { opacity: 0.5; cursor: default; }
	.btn.primary { background: #F57832; color: white; border-color: #F57832; }
	.btn.primary:hover:not(:disabled) { background: #e26a26; }
	.btn.sm { padding: 5px 10px; font-size: 12px; }

	.banner { padding: 12px 16px; border-radius: 12px; font-size: 13px; margin-bottom: 16px; }
	.banner.err { background: #FEF2F2; border: 1px solid #fecaca; color: #dc2626; }
	.banner.warn { background: #FEF9C3; border: 1px solid #FDE68A; color: #92400E; }
	.banner ul { margin: 6px 0 0; padding-left: 18px; }

	.tbl { width: 100%; border-collapse: collapse; background: white; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; font-size: 13px; }
	.tbl th { text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #A1A1AA; padding: 10px 14px; border-bottom: 1px solid var(--border); background: #FAFAFA; }
	.tbl td { padding: 11px 14px; border-bottom: 1px solid var(--border); color: #18181B; }
	.tbl tbody tr:last-child td { border-bottom: none; }
	.num { text-align: right; }
	.strong { font-weight: 600; }
	.redownload { margin-top: 12px; }
</style>
