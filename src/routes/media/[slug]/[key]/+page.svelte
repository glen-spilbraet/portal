<script>
	let { data } = $props();

	const fmtDate = (d) => {
		try { return new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
		catch { return d; }
	};
	const totalProducts = $derived(data.sections.reduce((n, s) => n + s.products.length, 0));

	let busy = $state({}); // id -> true while zipping
	const setBusy = (id, v) => (busy = { ...busy, [id]: v });

	const extOf = (key) => { const m = /\.([a-z0-9]+)$/i.exec(key || ''); return m ? m[1].toLowerCase() : 'jpg'; };
	const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

	// Compact "3D box · Flat · 2 content · 3 people" summary chips for a card.
	function groupSummary(assets) {
		const c = { box3d: 0, flat: 0, content: 0, people: 0 };
		for (const a of assets) c[a.group] = (c[a.group] ?? 0) + 1;
		const out = [];
		if (c.box3d) out.push('3D box');
		if (c.flat) out.push('Flat front');
		if (c.content) out.push(`${c.content} content`);
		if (c.people) out.push(`${c.people} people`);
		return out;
	}

	async function fetchBlob(key) {
		const res = await fetch(`/api/img/${key}`);
		if (!res.ok) throw new Error('image fetch failed');
		return res.blob();
	}
	function saveBlob(blob, name) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url; a.download = name;
		document.body.appendChild(a); a.click(); a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 2000);
	}

	async function zipAssets(assets, folder, zip) {
		const target = folder ? zip.folder(folder) : zip;
		let i = 0;
		for (const a of assets) {
			i++;
			const blob = await fetchBlob(a.key);
			target.file(`${slug(a.label) || 'image'}-${i}.${extOf(a.key)}`, blob);
		}
	}

	async function downloadProduct(p) {
		if (!p.assetCount || busy[p.sku]) return;
		setBusy(p.sku, true);
		try {
			const { default: JSZip } = await import('jszip');
			const zip = new JSZip();
			await zipAssets(p.assets, null, zip);
			const out = await zip.generateAsync({ type: 'blob' });
			saveBlob(out, `${slug(p.name) || p.sku}-${p.sku}.zip`);
		} catch (e) {
			alert('Sorry — the download failed. Please try again.');
		} finally {
			setBusy(p.sku, false);
		}
	}

	async function downloadSection(section) {
		const id = `sec-${section.date}`;
		const withAssets = section.products.filter((p) => p.assetCount);
		if (!withAssets.length || busy[id]) return;
		setBusy(id, true);
		try {
			const { default: JSZip } = await import('jszip');
			const zip = new JSZip();
			for (const p of withAssets) await zipAssets(p.assets, `${slug(p.name) || p.sku}-${p.sku}`, zip);
			const out = await zip.generateAsync({ type: 'blob' });
			saveBlob(out, `${slug(data.media.name)}-${section.date}.zip`);
		} catch (e) {
			alert('Sorry — the download failed. Please try again.');
		} finally {
			setBusy(id, false);
		}
	}
</script>

<svelte:head>
	<title>{data.media.name} · Media Assets · Spilbræt</title>
	<meta name="robots" content="noindex, nofollow" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
</svelte:head>

<div class="page">
	<header class="hero">
		<img class="logo" src={data.logo} alt="Spilbræt" />
		<div class="hero-txt">
			<h1>{data.media.name}</h1>
			<p>Press &amp; media asset library{#if totalProducts} · {totalProducts} product{totalProducts === 1 ? '' : 's'}{/if}</p>
		</div>
	</header>

	<main class="wrap">
		{#if !data.sections.length}
			<div class="empty">No assets have been shared here yet.</div>
		{:else}
			{#each data.sections as section (section.date)}
				{@const secId = `sec-${section.date}`}
				<section class="date-sec">
					<div class="sec-head">
						<div>
							<h2>{fmtDate(section.date)}</h2>
							<span class="sub">{section.products.length} product{section.products.length === 1 ? '' : 's'}</span>
						</div>
						<button class="dl-all" onclick={() => downloadSection(section)} disabled={busy[secId] || !section.products.some((p) => p.assetCount)}>
							{#if busy[secId]}<span class="spin"></span>Preparing…{:else}Download all{/if}
						</button>
					</div>

					<div class="grid">
						{#each section.products as p (p.sku)}
							<article class="card">
								<div class="thumb">
									{#if p.thumb}
										<img src={`/api/img/${p.thumb}?size=400`} alt={p.name} loading="lazy" />
									{:else}
										<div class="noimg">No image</div>
									{/if}
								</div>
								<div class="meta">
									<div class="pname" title={p.name}>{p.name}</div>
									<div class="psku">{p.sku}</div>
									{#if p.assetCount}
										<div class="chips">
											{#each groupSummary(p.assets) as g}<span class="chip">{g}</span>{/each}
										</div>
										<button class="dl" onclick={() => downloadProduct(p)} disabled={busy[p.sku]}>
											{#if busy[p.sku]}<span class="spin dark"></span>Preparing…{:else}⤓ Download {p.assetCount} asset{p.assetCount === 1 ? '' : 's'}{/if}
										</button>
									{:else}
										<div class="none">No downloadable assets</div>
									{/if}
								</div>
							</article>
						{/each}
					</div>
				</section>
			{/each}
		{/if}
	</main>

	<footer class="foot">Spilbræt · shared media assets</footer>
</div>

<style>
	:global(body) { margin: 0; background: #F4F1EA; }
	.page { font-family: 'Nunito', system-ui, sans-serif; color: #1F1B16; min-height: 100vh; display: flex; flex-direction: column; }

	.hero {
		display: flex; align-items: center; gap: 22px;
		padding: 28px 28px; max-width: 1120px; margin: 0 auto; width: 100%; box-sizing: border-box;
	}
	.logo { height: 44px; width: auto; flex-shrink: 0; }
	.hero-txt h1 { margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.4px; }
	.hero-txt p { margin: 3px 0 0; font-size: 14px; font-weight: 600; color: #8A7550; }

	.wrap { max-width: 1120px; margin: 0 auto; width: 100%; box-sizing: border-box; padding: 4px 28px 40px; flex: 1; }

	.empty { padding: 80px 20px; text-align: center; color: #8A7550; font-weight: 600; }

	.date-sec { margin-top: 26px; }
	.sec-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding-bottom: 12px; border-bottom: 2px solid #E6DEC9; }
	.sec-head h2 { margin: 0; font-size: 18px; font-weight: 800; letter-spacing: -0.2px; }
	.sec-head .sub { font-size: 13px; font-weight: 600; color: #A08C64; }

	.dl-all, .dl {
		display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
		font-family: inherit; font-weight: 800; border-radius: 10px; white-space: nowrap;
		transition: background 0.14s, transform 0.05s, opacity 0.14s;
	}
	.dl-all { font-size: 13px; padding: 9px 16px; background: #F57832; color: #fff; border: none; box-shadow: 0 2px 10px rgba(245, 120, 50, 0.35); }
	.dl-all:hover:not(:disabled) { background: #E4692A; }
	.dl-all:disabled, .dl:disabled { opacity: 0.55; cursor: default; box-shadow: none; }

	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 18px; margin-top: 18px; }
	.card { background: #fff; border: 1px solid #ECE4D2; border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 1px 3px rgba(60, 40, 10, 0.05); transition: box-shadow 0.15s, transform 0.15s; }
	.card:hover { box-shadow: 0 10px 28px rgba(60, 40, 10, 0.12); transform: translateY(-2px); }
	.thumb { aspect-ratio: 1 / 1; background: #FBF8F1; display: flex; align-items: center; justify-content: center; overflow: hidden; }
	.thumb img { width: 100%; height: 100%; object-fit: contain; padding: 14px; box-sizing: border-box; }
	.noimg { color: #C9Bda0; font-size: 13px; font-weight: 700; }

	.meta { padding: 13px 15px 15px; display: flex; flex-direction: column; gap: 7px; flex: 1; }
	.pname { font-size: 14.5px; font-weight: 800; line-height: 1.25; }
	.psku { font-size: 11.5px; font-weight: 700; color: #A08C64; letter-spacing: 0.3px; margin-top: -3px; }
	.chips { display: flex; flex-wrap: wrap; gap: 5px; margin: 2px 0 4px; }
	.chip { font-size: 10.5px; font-weight: 800; color: #7B3803; background: #FFE6A5; padding: 2px 8px; border-radius: 100px; }
	.dl { margin-top: auto; justify-content: center; font-size: 12.5px; padding: 8px 12px; background: #1F1B16; color: #fff; border: none; }
	.dl:hover:not(:disabled) { background: #000; }
	.none { margin-top: auto; font-size: 12px; font-weight: 600; color: #B6A684; font-style: italic; }

	.foot { text-align: center; padding: 26px; font-size: 12px; font-weight: 700; color: #B6A684; }

	.spin { width: 13px; height: 13px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff; animation: sp 0.7s linear infinite; }
	.spin.dark { border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff; }
	@keyframes sp { to { transform: rotate(360deg); } }

	@media (max-width: 560px) {
		.hero { padding: 20px 18px; gap: 16px; }
		.hero-txt h1 { font-size: 21px; }
		.wrap { padding: 4px 18px 30px; }
		.grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
	}
</style>
