<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	const LANGS = ['en', 'da', 'sv', 'no'];

	function formatDate(ts) {
		return new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	function displayName(s) {
		return s.name_en || s.name_da || s.name_sv || s.name_no || '';
	}
</script>

<svelte:head><title>Award view — Sheets</title></svelte:head>

<div class="page">
	<AppNav active="sheets" user={data.user} />

	<main>
		<div class="page-header">
			<div class="title-row">
				<a class="back" href="/sheets">← All sheets</a>
				<h1 class="page-title">Award view</h1>
				<span class="total-badge">{data.sheets.length} need update</span>
			</div>
		</div>

		<p class="intro">
			Products with press or awards created since the webshop was last updated (or never updated).
			Open a product's Award View to grab the badged photo and text, then mark it as updated.
		</p>

		{#if data.sheets.length === 0}
			<div class="empty">
				<p class="empty-title">Everything's up to date 🎉</p>
				<p class="empty-sub">No products have new press or awards waiting for the webshop.</p>
			</div>
		{:else}
			<div class="grid">
				{#each data.sheets as sheet}
					<a class="card" href="/sheet/{sheet.id}/award">
						<div class="card-thumb">
							{#if sheet.box_image_key}
								<img src="/api/img/{sheet.box_image_key}?size=300" alt={displayName(sheet) || sheet.sku} />
							{:else}
								<div class="no-img">📦</div>
							{/if}
							<span class="status-pill" class:never={!sheet.awards_updated_at}>
								{sheet.awards_updated_at ? 'New press' : 'Never updated'}
							</span>
						</div>
						<div class="card-body">
							<div class="card-meta">
								<span class="sku">{sheet.sku}</span>
								<span class="press-count">{sheet.press_count} press/award{sheet.press_count === 1 ? '' : 's'}</span>
							</div>
							<h2>{displayName(sheet) || '(untitled)'}</h2>
							<p class="date">
								{#if sheet.awards_updated_at}
									Updated {formatDate(sheet.awards_updated_at)} · newest {formatDate(sheet.last_created)}
								{:else}
									Newest press {formatDate(sheet.last_created)}
								{/if}
							</p>
						</div>
						<div class="card-footer">
							<span class="open-award">Open Award View →</span>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</main>
</div>

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; }
	main { flex: 1; max-width: 1140px; margin: 0 auto; width: 100%; padding: 32px 28px 80px; }

	.page-header { margin-bottom: 8px; }
	.title-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
	.back { font-size: 13px; color: #6D5BD0; text-decoration: none; font-weight: 600; }
	.back:hover { text-decoration: underline; }
	.page-title { font-size: 18px; font-weight: 700; color: #18181B; letter-spacing: -0.3px; }
	.total-badge { font-size: 12px; font-weight: 600; color: #c27803; background: #fdf3e2; border-radius: 100px; padding: 2px 10px; }

	.intro { font-size: 13px; color: #71717A; margin: 0 0 24px; max-width: 640px; line-height: 1.5; }

	.empty { text-align: center; padding: 90px 24px; }
	.empty-title { font-size: 16px; font-weight: 700; color: #18181B; }
	.empty-sub { font-size: 14px; color: #71717A; margin-top: 6px; }

	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(272px, 1fr)); gap: 18px; }

	.card {
		background: white; border-radius: var(--radius-lg); border: 1px solid var(--border);
		box-shadow: var(--shadow); overflow: hidden; display: flex; flex-direction: column;
		text-decoration: none; color: inherit; transition: box-shadow 0.2s, transform 0.15s;
	}
	.card:hover { box-shadow: var(--shadow-lg); transform: translateY(-1px); }

	.card-thumb { position: relative; height: 176px; background: white; overflow: hidden; border-bottom: 1px solid var(--border); }
	.card-thumb img { width: 100%; height: 100%; object-fit: contain; padding: 20px; }
	.no-img { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 40px; opacity: 0.25; }

	.status-pill {
		position: absolute; top: 10px; left: 10px; font-size: 10.5px; font-weight: 700;
		padding: 3px 9px; border-radius: 100px; background: #e6f4ea; color: #16843f; letter-spacing: 0.2px;
	}
	.status-pill.never { background: #fdf3e2; color: #c27803; }

	.card-body { padding: 14px 18px 10px; flex: 1; display: flex; flex-direction: column; gap: 3px; }
	.card-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
	.sku { font-size: 11px; font-weight: 600; color: #71717A; letter-spacing: 0.4px; text-transform: uppercase; }
	.press-count { font-size: 11px; color: #A1A1AA; font-weight: 500; }
	h2 { font-size: 15px; font-weight: 700; color: #18181B; line-height: 1.3; letter-spacing: -0.2px; }
	.date { font-size: 11.5px; color: #A1A1AA; font-weight: 500; margin-top: 1px; }

	.card-footer { padding: 10px 18px 13px; border-top: 1px solid var(--border); }
	.open-award { font-size: 12.5px; font-weight: 600; color: #6D5BD0; }
</style>
