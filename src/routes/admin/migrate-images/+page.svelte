<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	/** Derive a resized variant R2 key from an original key */
	function variantKey(originalKey, size) {
		const lastSlash = originalKey.lastIndexOf('/');
		const lastDot   = originalKey.lastIndexOf('.');
		return lastDot > lastSlash
			? originalKey.slice(0, lastDot) + `_${size}.webp`
			: originalKey + `_${size}.webp`;
	}

	/** Resize a blob to fit within maxSize×maxSize, returns a webp Blob */
	function resizeToBlob(blob, maxSize) {
		return new Promise((resolve) => {
			const img = new Image();
			const objectUrl = URL.createObjectURL(blob);
			img.onload = () => {
				URL.revokeObjectURL(objectUrl);
				const scale = Math.min(1, maxSize / img.naturalWidth, maxSize / img.naturalHeight);
				const w = Math.round(img.naturalWidth  * scale);
				const h = Math.round(img.naturalHeight * scale);
				const canvas = document.createElement('canvas');
				canvas.width  = w;
				canvas.height = h;
				canvas.getContext('2d').drawImage(img, 0, 0, w, h);
				canvas.toBlob(resolve, 'image/webp', 0.88);
			};
			img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(null); };
			img.src = objectUrl;
		});
	}

	// ── State ─────────────────────────────────────────────────────────────
	/** @type {'idle' | 'running' | 'done'} */
	let migrationStatus = $state('idle');
	let progress = $state(0);
	let total    = $state(data.sheets.length);

	/** Per-sheet status: 'pending' | 'ok' | 'skip' | 'error' */
	let statuses = $state(
		/** @type {Record<string, { status: string; msg?: string; sizes?: string[] }>} */
		Object.fromEntries(data.sheets.map(s => [s.id, { status: 'pending' }]))
	);

	async function runMigration() {
		if (migrationStatus === 'running') return;
		migrationStatus = 'running';
		progress = 0;

		for (const sheet of data.sheets) {
			const key = sheet.box_image_key;
			statuses[sheet.id] = { status: 'running' };

			try {
				// Fetch original from R2 (via img proxy)
				const imgRes = await fetch(`/api/img/${key}`);
				if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
				const originalBlob = await imgRes.blob();

				const uploaded = [];
				for (const size of [1000, 300]) {
					const vKey = variantKey(key, size);

					// Check if variant already exists
					const checkRes = await fetch(`/api/img/${vKey}`, { method: 'HEAD' }).catch(() => null);
					if (checkRes?.ok) {
						uploaded.push(`${size}px ✓ (existed)`);
						continue;
					}

					// Resize and upload
					const resizedBlob = await resizeToBlob(originalBlob, size);
					if (!resizedBlob) throw new Error(`Resize to ${size} failed`);

					const fd = new FormData();
					fd.append('file', new File([resizedBlob], `box_${size}.webp`, { type: 'image/webp' }));
					fd.append('sheetId', sheet.id);
					fd.append('type', 'box');
					fd.append('variantKey', vKey);
					const uploadRes = await fetch('/api/images', { method: 'POST', body: fd });
					if (!uploadRes.ok) throw new Error(`Upload ${size} failed: ${uploadRes.status}`);
					uploaded.push(`${size}px ✓`);
				}

				statuses[sheet.id] = { status: 'ok', sizes: uploaded };
			} catch (err) {
				statuses[sheet.id] = { status: 'error', msg: err.message };
			}

			progress++;
		}

		migrationStatus = 'done';
	}

	const doneCount  = $derived(Object.values(statuses).filter(s => s.status === 'ok').length);
	const errorCount = $derived(Object.values(statuses).filter(s => s.status === 'error').length);
</script>

<svelte:head>
	<title>Migrate Box Images — Admin</title>
</svelte:head>

<div class="page">
	<AppNav active="admin" user={data.user} />

	<main>
		<div class="page-header">
			<h1 class="page-title">Box Image Migration</h1>
			<p class="page-sub">
				Generates resized variants (1000px and 300px) for all existing box photos.
				New uploads create these automatically — this tool back-fills the existing ones.
			</p>
		</div>

		<div class="stats-row">
			<div class="stat-card">
				<span class="stat-val">{total}</span>
				<span class="stat-label">sheets with box photos</span>
			</div>
			{#if migrationStatus !== 'idle'}
				<div class="stat-card">
					<span class="stat-val">{progress} / {total}</span>
					<span class="stat-label">processed</span>
				</div>
				<div class="stat-card ok">
					<span class="stat-val">{doneCount}</span>
					<span class="stat-label">succeeded</span>
				</div>
				{#if errorCount > 0}
					<div class="stat-card err">
						<span class="stat-val">{errorCount}</span>
						<span class="stat-label">errors</span>
					</div>
				{/if}
			{/if}
		</div>

		{#if migrationStatus === 'idle'}
			<button class="btn-run" onclick={runMigration} disabled={total === 0}>
				{total === 0 ? 'No box photos found' : `Run migration for ${total} photos`}
			</button>
		{:else if migrationStatus === 'running'}
			<div class="progress-bar-wrap">
				<div class="progress-bar" style="width: {total > 0 ? (progress / total) * 100 : 0}%"></div>
			</div>
			<p class="progress-label">Processing… {progress} / {total}</p>
		{:else}
			<div class="done-banner">
				Migration complete — {doneCount} succeeded{errorCount > 0 ? `, ${errorCount} errors` : ''}.
			</div>
		{/if}

		{#if migrationStatus !== 'idle'}
			<table class="results-table">
				<thead>
					<tr>
						<th>SKU</th>
						<th>Status</th>
						<th>Details</th>
					</tr>
				</thead>
				<tbody>
					{#each data.sheets as sheet}
						{@const s = statuses[sheet.id]}
						<tr class="row-{s.status}">
							<td class="col-sku">{sheet.sku}</td>
							<td class="col-status">
								{#if s.status === 'pending'}
									<span class="badge pending">Pending</span>
								{:else if s.status === 'running'}
									<span class="badge running">Running…</span>
								{:else if s.status === 'ok'}
									<span class="badge ok">Done</span>
								{:else if s.status === 'error'}
									<span class="badge error">Error</span>
								{/if}
							</td>
							<td class="col-detail">
								{#if s.status === 'ok'}
									{s.sizes?.join(', ')}
								{:else if s.status === 'error'}
									<span class="err-msg">{s.msg}</span>
								{:else}
									—
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</main>
</div>

<style>
	.page { display: flex; flex-direction: column; min-height: 100vh; background: #f8f8f6; }
	main  { max-width: 860px; margin: 0 auto; padding: 40px 24px; width: 100%; }

	.page-header { margin-bottom: 28px; }
	.page-title  { font-size: 24px; font-weight: 800; color: #111827; margin-bottom: 6px; }
	.page-sub    { color: #6b7280; font-size: 14px; max-width: 540px; line-height: 1.5; }

	.stats-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; }
	.stat-card {
		background: white; border: 1px solid #e5e7eb; border-radius: 12px;
		padding: 14px 20px; min-width: 120px;
	}
	.stat-card.ok  { border-color: #bbf7d0; background: #f0fdf4; }
	.stat-card.err { border-color: #fecaca; background: #fef2f2; }
	.stat-val   { display: block; font-size: 22px; font-weight: 800; color: #111827; }
	.stat-card.ok  .stat-val  { color: #15803d; }
	.stat-card.err .stat-val  { color: #dc2626; }
	.stat-label { font-size: 12px; color: #6b7280; }

	.btn-run {
		background: #027E3A; color: white; border: none; border-radius: 10px;
		padding: 12px 28px; font-size: 15px; font-weight: 700;
		font-family: 'Nunito', sans-serif; cursor: pointer;
		transition: background 0.15s; margin-bottom: 28px;
	}
	.btn-run:hover:not(:disabled) { background: #025c2a; }
	.btn-run:disabled { background: #d1d5db; color: #9ca3af; cursor: default; }

	.progress-bar-wrap {
		background: #e5e7eb; border-radius: 100px; height: 8px;
		overflow: hidden; margin-bottom: 8px;
	}
	.progress-bar { height: 100%; background: #027E3A; transition: width 0.2s; border-radius: 100px; }
	.progress-label { font-size: 13px; color: #6b7280; margin-bottom: 24px; }

	.done-banner {
		background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px;
		padding: 12px 18px; font-size: 14px; font-weight: 600; color: #15803d;
		margin-bottom: 24px;
	}

	.results-table { width: 100%; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
	.results-table thead th { background: #f9fafb; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; font-weight: 700; padding: 10px 16px; text-align: left; }
	.results-table tbody tr { border-top: 1px solid #f3f4f6; }
	.results-table tbody td { padding: 10px 16px; font-size: 13px; vertical-align: middle; }

	.col-sku    { font-weight: 600; color: #111827; width: 140px; }
	.col-status { width: 100px; }
	.col-detail { color: #6b7280; }

	.badge {
		display: inline-block; padding: 2px 9px; border-radius: 100px;
		font-size: 11px; font-weight: 700;
	}
	.badge.pending { background: #f3f4f6; color: #9ca3af; }
	.badge.running { background: #fef9c3; color: #a16207; }
	.badge.ok      { background: #dcfce7; color: #15803d; }
	.badge.error   { background: #fee2e2; color: #dc2626; }

	.err-msg { color: #dc2626; font-size: 12px; }
</style>
