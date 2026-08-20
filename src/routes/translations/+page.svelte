<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	const LABEL_KEYS = [
		{ key: 'sku',        display: 'SKU' },
		{ key: 'ean',        display: 'EAN' },
		{ key: 'height',     display: 'Height' },
		{ key: 'width',      display: 'Width' },
		{ key: 'depth',      display: 'Depth' },
		{ key: 'weight',     display: 'Weight' },
		{ key: 'stock_date', display: 'Est. Stock Date' },
	];

	const MAIL_KEYS = [
		{ key: 'mail_subject',    display: 'Email subject',   textarea: false, placeholder: 'New products in our selection' },
		{ key: 'mail_header',     display: 'Email header',    textarea: false, placeholder: 'New products coming soon' },
		{ key: 'mail_intro',      display: 'Intro text',      textarea: true,  placeholder: 'We are adding products to our selection…' },
		{ key: 'mail_sheet_link', display: 'Sheet link text', textarea: false, placeholder: 'View sales sheet →' },
	];

	const LANGS = [
		{ code: 'en', label: 'English' },
		{ code: 'da', label: 'Dansk' },
		{ code: 'sv', label: 'Svenska' },
		{ code: 'no', label: 'Norsk' }
	];

	let labels = $state(structuredClone(data.globalLabels ?? {}));
	let ctaVersions = $state(structuredClone(data.ctaVersions ?? []));

	async function saveLabel(key, lang, value) {
		const fd = new FormData();
		fd.set('key', key); fd.set('lang', lang); fd.set('label', value);
		await fetch('?/saveLabel', { method: 'POST', body: fd });
	}

	async function addCtaVersion() {
		const name = 'New Version';
		const res = await fetch('/api/cta-versions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name })
		});
		if (res.ok) {
			const { id } = await res.json();
			ctaVersions.push({ id, name, translations: {} });
		}
	}

	async function saveCtaName(version, value) {
		version.name = value;
		await fetch(`/api/cta-versions/${version.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ field: 'name', value })
		});
	}

	async function saveCtaTranslation(version, lang, value) {
		if (!version.translations) version.translations = {};
		version.translations[lang] = value;
		await fetch(`/api/cta-versions/${version.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ field: 'translation', lang, value })
		});
	}

	async function deleteCtaVersion(version) {
		if (ctaVersions.length <= 1) return;
		if (!confirm(`Delete "${version.name}"?`)) return;
		await fetch(`/api/cta-versions/${version.id}`, { method: 'DELETE' });
		ctaVersions = ctaVersions.filter(v => v.id !== version.id);
	}
</script>

<svelte:head>
	<title>Translations — Product Portal</title>
</svelte:head>


<div class="page">
	<AppNav active="translations" user={data.user} />
	<main>
		<div class="page-header">
			<div>
				<h1 class="page-title">Translations</h1>
				<p class="page-sub">Global field labels shown on all sales sheets. Changes apply immediately.</p>
			</div>
		</div>

		<div class="table-wrap">
			<table class="labels-table">
				<thead>
					<tr>
						<th class="col-field">Field</th>
						{#each LANGS as lang}
							<th>{lang.label}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each LABEL_KEYS as { key, display }}
						<tr>
							<td class="col-field-val">{display}</td>
							{#each LANGS as lang}
								<td>
									<input type="text" class="label-input"
										value={labels[key]?.[lang.code] ?? ''}
										oninput={(e) => { if (!labels[key]) labels[key] = {}; labels[key][lang.code] = e.target.value; }}
										onblur={(e) => saveLabel(key, lang.code, e.target.value)}
									/>
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Mail Campaign Texts -->
		<div class="section-header">
			<div>
				<h2 class="section-title">Mail Campaign Texts</h2>
				<p class="section-sub">Text used in outgoing mail campaigns. Supports all 4 languages.</p>
			</div>
		</div>

		<div class="table-wrap">
			<table class="labels-table">
				<thead>
					<tr>
						<th class="col-field">Field</th>
						{#each LANGS as lang}
							<th>{lang.label}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each MAIL_KEYS as { key, display, textarea, placeholder }}
						<tr>
							<td class="col-field-val">{display}</td>
							{#each LANGS as lang}
								<td>
									{#if textarea}
										<textarea class="label-input label-textarea"
											rows="2"
											placeholder={placeholder}
											oninput={(e) => { if (!labels[key]) labels[key] = {}; labels[key][lang.code] = e.target.value; }}
											onblur={(e) => saveLabel(key, lang.code, e.target.value)}
										>{labels[key]?.[lang.code] ?? ''}</textarea>
									{:else}
										<input type="text" class="label-input"
											value={labels[key]?.[lang.code] ?? ''}
											placeholder={placeholder}
											oninput={(e) => { if (!labels[key]) labels[key] = {}; labels[key][lang.code] = e.target.value; }}
											onblur={(e) => saveLabel(key, lang.code, e.target.value)}
										/>
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- CTA Versions -->
		<div class="section-header">
			<div>
				<h2 class="section-title">CTA Versions</h2>
				<p class="section-sub">Create multiple call-to-action banners and select one per sheet.</p>
			</div>
			<button class="btn-add" onclick={addCtaVersion}>
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
				Add version
			</button>
		</div>

		<div class="cta-versions">
			{#each ctaVersions as version (version.id)}
				<div class="cta-card">
					<div class="cta-card-header">
						<input class="cta-name-input" type="text" value={version.name}
							oninput={(e) => version.name = e.target.value}
							onblur={(e) => saveCtaName(version, e.target.value)}
						/>
						<button class="btn-delete" onclick={() => deleteCtaVersion(version)} disabled={ctaVersions.length <= 1} title="Delete version">
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
						</button>
					</div>
					<table class="cta-langs-table">
						{#each LANGS as lang}
							<tr>
								<td class="lang-label">{lang.label}</td>
								<td>
									<input type="text" class="label-input"
										value={version.translations?.[lang.code] ?? ''}
										oninput={(e) => { if (!version.translations) version.translations = {}; version.translations[lang.code] = e.target.value; }}
										onblur={(e) => saveCtaTranslation(version, lang.code, e.target.value)}
									/>
								</td>
							</tr>
						{/each}
					</table>
				</div>
			{/each}
		</div>
	</main>
</div>

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; }
	main { flex: 1; max-width: 1140px; margin: 0 auto; width: 100%; padding: 32px 28px 80px; }
	.page-header { margin-bottom: 24px; }
	.page-title { font-size: 18px; font-weight: 700; color: #18181B; letter-spacing: -0.3px; margin-bottom: 4px; }
	.page-sub { font-size: 13px; color: #71717A; }

	.table-wrap { border: 1px solid var(--border); border-radius: var(--radius-lg); background: white; overflow: hidden; }
	.labels-table { width: 100%; border-collapse: collapse; font-size: 13px; }
	.labels-table thead th { padding: 10px 14px; text-align: left; font-size: 11.5px; font-weight: 700; color: #71717A; text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 1px solid var(--border); background: #FAFAFA; }
	.labels-table thead th.col-field { width: 120px; }
	.labels-table tbody tr:not(:last-child) td { border-bottom: 1px solid var(--border); }
	.labels-table tbody td { padding: 8px 14px; }
	.col-field-val { font-size: 12px; font-weight: 600; color: #52525B; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap; }
	.label-input { width: 100%; border: 1px solid transparent; border-radius: 6px; padding: 6px 8px; font-size: 13px; font-family: inherit; color: #18181B; background: transparent; transition: border-color 0.15s, background 0.15s; outline: none; }
	.label-input:hover { background: #F4F4F5; border-color: var(--border); }
	.label-input:focus { background: white; border-color: #A1A1AA; box-shadow: 0 0 0 3px rgba(0,0,0,0.04); }
	.label-textarea { resize: vertical; min-height: 52px; line-height: 1.5; vertical-align: top; box-sizing: border-box; }

	.section-header { display: flex; align-items: flex-start; justify-content: space-between; margin: 36px 0 16px; }
	.section-title { font-size: 16px; font-weight: 700; color: #18181B; letter-spacing: -0.2px; margin-bottom: 4px; }
	.section-sub { font-size: 13px; color: #71717A; }
	.btn-add { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; background: #F57832; color: white; border: none; border-radius: 100px; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: background 0.15s; flex-shrink: 0; }
	.btn-add:hover { background: #E06820; }

	.cta-versions { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
	.cta-card { background: white; border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; }
	.cta-card-header { display: flex; align-items: center; gap: 8px; padding: 12px 12px 10px; border-bottom: 1px solid var(--border); background: #FAFAFA; }
	.cta-name-input { flex: 1; border: 1px solid transparent; border-radius: 6px; padding: 5px 8px; font-size: 13px; font-weight: 600; font-family: inherit; color: #18181B; background: transparent; outline: none; transition: border-color 0.15s, background 0.15s; }
	.cta-name-input:hover { background: #F4F4F5; border-color: var(--border); }
	.cta-name-input:focus { background: white; border-color: #A1A1AA; box-shadow: 0 0 0 3px rgba(0,0,0,0.04); }
	.btn-delete { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: none; border-radius: 6px; background: none; color: #A1A1AA; cursor: pointer; flex-shrink: 0; transition: background 0.15s, color 0.15s; }
	.btn-delete:hover:not(:disabled) { background: #FEE2E2; color: #EF4444; }
	.btn-delete:disabled { opacity: 0.3; cursor: not-allowed; }
	.cta-langs-table { width: 100%; border-collapse: collapse; font-size: 13px; }
	.cta-langs-table tr:not(:last-child) td { border-bottom: 1px solid var(--border); }
	.cta-langs-table td { padding: 6px 12px; }
	.lang-label { font-size: 11.5px; font-weight: 700; color: #71717A; text-transform: uppercase; letter-spacing: 0.4px; white-space: nowrap; width: 80px; }
</style>
