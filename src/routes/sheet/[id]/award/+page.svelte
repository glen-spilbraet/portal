<script>
	import { enhance } from '$app/forms';

	let { data } = $props();

	function formatDate(ts) {
		return new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	// ── Localised scaffolding words (quotes themselves stay in their own language) ──
	const SCAFFOLD = {
		da: { header: 'Presseomtale og priser', nominee: (c, m) => `Nomineret til ${c} af ${m}`, winner: (c, m) => `Vinder af ${c} – ${m}` },
		sv: { header: 'Press & utmärkelser',     nominee: (c, m) => `Nominerad till ${c} av ${m}`, winner: (c, m) => `Vinnare av ${c} – ${m}` },
		no: { header: 'Presseomtale og priser',  nominee: (c, m) => `Nominert til ${c} av ${m}`,  winner: (c, m) => `Vinner av ${c} – ${m}` },
		en: { header: 'Press & awards',          nominee: (c, m) => `Nominated for ${c} by ${m}`, winner: (c, m) => `Winner of ${c} – ${m}` },
	};

	function buildLines(md) {
		const S = SCAFFOLD[data.lang] ?? SCAFFOLD.da;
		const q = (t) => (md ? `*"${t}"*` : `"${t}"`);
		const lines = [];
		for (const i of data.press) {
			const media = i.media ?? '';
			for (const s of i.statements ?? []) {
				const text = (s.statement ?? '').trim();
				const score = s.score;
				if (score != null && score !== '') {
					const stars = '⭐️'.repeat(Math.max(1, Math.round(Number(score))));
					lines.push(`${stars} ${q(text)} – ${media}`);
				} else if (text) {
					lines.push(`📰 ${q(text)} – ${media}`);
				}
			}
			if (i.is_winner && i.award_category) lines.push(`🏆 ${S.winner(i.award_category, media)}`);
			else if (i.is_nominated && i.award_category) lines.push(`👏 ${S.nominee(i.award_category, media)}`);
		}
		const header = md ? `**${S.header}**` : S.header;
		return lines.length ? `${header}\n\n${lines.join('\n\n')}` : '';
	}

	const plainText = $derived(buildLines(false));
	const mdText = $derived(buildLines(true));

	// ── Canvas compositor ──────────────────────────────────────────────────
	const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
	const BADGE_GAP = 2;

	// Which badges are included in the exported photo (all on by default).
	let selected = $state(data.badges.map(() => true));
	const activeBadges = $derived(data.badges.filter((_, i) => selected[i]));

	function loadImage(src) {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => resolve(img);
			img.onerror = reject;
			img.src = src;
		});
	}

	async function render(side) {
		const canvas = document.createElement('canvas');
		canvas.width = side;
		canvas.height = side;
		const ctx = canvas.getContext('2d');
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, side, side);

		if (data.boxImageKey) {
			const box = await loadImage(`/api/img/${data.boxImageKey}?size=1000`);
			const r = Math.min(side / box.naturalWidth, side / box.naturalHeight);
			const w = box.naturalWidth * r;
			const h = box.naturalHeight * r;
			ctx.drawImage(box, (side - w) / 2, (side - h) / 2, w, h);
		}

		const seen = {};
		for (const b of activeBadges) {
			const corner = CORNERS.includes(b.placement) ? b.placement : 'bottom-right';
			const n = seen[corner] ?? 0;
			seen[corner] = n + 1;
			const size = Number(b.size_pct) || 15;
			const p = Number(b.pad_pct) || 0;
			const img = await loadImage(`/api/img/${b.image_key}?size=400`);
			const bw = (size / 100) * side;
			const bh = bw * (img.naturalHeight / img.naturalWidth);
			const offX = ((b.pad_x ? p : 0) + n * (size + BADGE_GAP)) / 100 * side;
			const offY = (b.pad_y ? p : 0) / 100 * side;
			const [vy, vx] = corner.split('-');
			const x = vx === 'left' ? offX : side - offX - bw;
			const y = vy === 'top' ? offY : side - offY - bh;
			ctx.drawImage(img, x, y, bw, bh);
		}
		return canvas;
	}

	let previewEl = $state(null);
	let rendering = $state(true);
	let renderError = $state('');

	$effect(() => {
		// re-render whenever the selection/box change
		void activeBadges; void data.boxImageKey;
		if (!previewEl) return;
		rendering = true;
		renderError = '';
		render(600)
			.then((c) => {
				const ctx = previewEl.getContext('2d');
				previewEl.width = c.width;
				previewEl.height = c.height;
				ctx.drawImage(c, 0, 0);
				rendering = false;
			})
			.catch(() => { renderError = 'Could not load the box photo or badges.'; rendering = false; });
	});

	let downloading = $state(0);

	async function download(side) {
		downloading = side;
		try {
			const canvas = await render(side);
			const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
			const link = `${side}x${side}`;
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = `${data.sku} ${data.name} Awards ${link}.jpg`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(a.href);
		} finally {
			downloading = 0;
		}
	}

	// ── Clipboard ──────────────────────────────────────────────────────────
	let copied = $state('');
	async function copy(which) {
		const text = which === 'md' ? mdText : plainText;
		try {
			await navigator.clipboard.writeText(text);
			copied = which;
			setTimeout(() => { if (copied === which) copied = ''; }, 1600);
		} catch {
			/* ignore */
		}
	}
</script>

<svelte:head><title>Award View — {data.sku}</title></svelte:head>

<div class="page">
	<header class="head">
		<nav class="crumbs">
			<a href="/sheets">Sheets</a>
			<span class="sep">›</span>
			<a href="/sheet/{data.sheetId}?lang={data.lang}">{data.name}</a>
			<span class="sep">›</span>
			<span class="current">Award view</span>
		</nav>
		<div class="title-row">
			<h1>{data.name} <span class="sku">{data.sku}</span></h1>
			<div class="update-box">
				<span class="upd-label" class:never={!data.awardsUpdatedAt}>
					{#if data.awardsUpdatedAt}
						Webshop updated {formatDate(data.awardsUpdatedAt)}
					{:else}
						Never updated
					{/if}
				</span>
				<form method="POST" action="?/markUpdated" use:enhance>
					<button class="btn-mark" type="submit">Mark as updated</button>
				</form>
			</div>
		</div>
	</header>

	<div class="cols">
		<!-- Badged photo -->
		<section class="photo-section">
			{#if !data.boxImageKey}
				<p class="empty">No box photo on this sheet yet — add one in the sheet editor.</p>
			{:else}
				<div class="photo-box">
					<canvas bind:this={previewEl} class="preview" class:loading={rendering}></canvas>
					{#if rendering}<div class="spinner">Rendering…</div>{/if}
				</div>
				{#if renderError}<p class="err">{renderError}</p>{/if}
				{#if !data.badges.length}
					<p class="hint">No active award badges for this SKU — the photo will download without badges.</p>
				{:else}
					<div class="badge-list">
						{#each data.badges as b, i}
							<label class="badge-row" class:off={!selected[i]}>
								<input type="checkbox" bind:checked={selected[i]} />
								<img class="badge-thumb" src="/api/img/{b.image_key}?size=300" alt="" />
								<span class="badge-info">
									<span class="badge-media">{b.media ?? 'Badge'}</span>
									<span class="badge-kind badge-kind-{b.kind}">{b.kind === 'winner' ? 'Winner' : 'Nominee'}</span>
								</span>
							</label>
						{/each}
					</div>
				{/if}
				<div class="dl-row">
					<button class="btn" disabled={downloading === 1000} onclick={() => download(1000)}>
						{downloading === 1000 ? 'Preparing…' : 'Download 1000×1000'}
					</button>
					<button class="btn ghost" disabled={downloading === 300} onclick={() => download(300)}>
						{downloading === 300 ? 'Preparing…' : 'Download 300×300'}
					</button>
				</div>
			{/if}
		</section>

		<!-- Press / awards text -->
		<section class="card">
			<h2>Press & awards text</h2>
			{#if !plainText}
				<p class="empty">No press or awards recorded for this SKU.</p>
			{:else}
				<pre class="text-preview">{plainText}</pre>
				<div class="dl-row">
					<button class="btn" class:done={copied === 'md'} onclick={() => copy('md')}>
						{copied === 'md' ? 'Copied!' : 'Copy for webshop'}
					</button>
					<button class="btn ghost" class:done={copied === 'plain'} onclick={() => copy('plain')}>
						{copied === 'plain' ? 'Copied!' : 'Copy plain text'}
					</button>
				</div>
				<p class="hint">
					<strong>Copy for webshop</strong> gives the markdown version (bold header, italic quotes) to paste
					into the shop admin. Wording follows the sheet language ({data.lang.toUpperCase()}); quotes stay in
					their original language.
				</p>
			{/if}
		</section>
	</div>
</div>

<style>
	.page { max-width: 1100px; margin: 0 auto; padding: 28px 24px 60px; }
	.head { margin-bottom: 22px; }
	.crumbs { display: flex; align-items: center; gap: 8px; font-size: 13px; flex-wrap: wrap; }
	.crumbs a { color: #6D5BD0; text-decoration: none; font-weight: 600; }
	.crumbs a:hover { text-decoration: underline; }
	.crumbs .sep { color: #c7c7c7; }
	.crumbs .current { color: #9a9a9a; font-weight: 600; }

	.title-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-top: 8px; }
	h1 { font-size: 24px; margin: 0; letter-spacing: -0.3px; }
	.sku { font-size: 14px; color: #9a9a9a; font-weight: 500; margin-left: 6px; }

	.update-box { display: flex; align-items: center; gap: 12px; }
	.upd-label { font-size: 12.5px; color: #16843f; font-weight: 600; }
	.upd-label.never { color: #c27803; }
	.btn-mark {
		padding: 8px 16px; border: none; border-radius: 100px; cursor: pointer;
		background: #6D5BD0; color: white; font-size: 13px; font-weight: 600;
		transition: background 0.15s, transform 0.1s;
	}
	.btn-mark:hover { background: #5B49BE; }
	.btn-mark:active { transform: scale(0.98); }

	.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; align-items: start; }
	@media (max-width: 820px) { .cols { grid-template-columns: 1fr; } }

	.card {
		background: white;
		border: 1px solid #ececec;
		border-radius: 16px;
		padding: 20px;
		box-shadow: 0 2px 14px rgba(0, 0, 0, 0.04);
	}
	h2 { font-size: 15px; margin: 0 0 14px; letter-spacing: -0.2px; }

	.photo-section h2 { margin-left: 2px; }
	.photo-box {
		position: relative; background: white; border-radius: 16px; overflow: hidden;
		aspect-ratio: 1/1; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.07);
	}
	.preview { width: 100%; height: 100%; display: block; transition: opacity 0.15s; }
	.preview.loading { opacity: 0.3; }
	.spinner { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 13px; color: #888; }

	.badge-list { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
	.badge-row {
		display: flex; align-items: center; gap: 12px; padding: 8px 12px;
		background: white; border: 1px solid #eee; border-radius: 12px; cursor: pointer;
		transition: border-color 0.15s, opacity 0.15s, background 0.15s;
	}
	.badge-row:hover { border-color: #ddd9f0; }
	.badge-row.off { opacity: 0.5; background: #fafafa; }
	.badge-row input { width: 17px; height: 17px; accent-color: #6D5BD0; cursor: pointer; flex-shrink: 0; }
	.badge-thumb { width: 38px; height: 38px; object-fit: contain; flex-shrink: 0; }
	.badge-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.badge-media { font-size: 13px; font-weight: 600; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.badge-kind { font-size: 11px; font-weight: 600; }
	.badge-kind-winner { color: #c27803; }
	.badge-kind-nominee { color: #6D5BD0; }

	.dl-row { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
	.btn {
		flex: 1; min-width: 140px;
		padding: 9px 16px; border: 1px solid transparent; border-radius: 100px;
		background: #6D5BD0; color: white; font-size: 13px; font-weight: 600;
		cursor: pointer; transition: background 0.15s, transform 0.1s;
	}
	.btn:hover:not(:disabled) { background: #5B49BE; }
	.btn:active:not(:disabled) { transform: scale(0.98); }
	.btn:disabled { opacity: 0.6; cursor: default; }
	.btn.ghost { background: white; color: #5B49BE; border: 1px solid #ddd9f0; }
	.btn.ghost:hover:not(:disabled) { background: #faf9ff; border-color: #c9c2ec; }
	.btn.done { background: #1f9d55; }

	.hint { font-size: 12px; color: #888; margin: 12px 0 0; line-height: 1.5; }
	.hint strong { color: #6D5BD0; }
	.empty { font-size: 13px; color: #999; margin: 0; }
	.err { font-size: 12.5px; color: #c0392b; margin: 10px 0 0; }

	.text-preview {
		background: #fafafa; border: 1px solid #eee; border-radius: 10px;
		padding: 16px; font-size: 14px; line-height: 1.7; white-space: pre-wrap;
		font-family: inherit; margin: 0; max-height: 440px; overflow: auto;
	}
</style>
