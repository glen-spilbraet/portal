<script>
	import { enhance } from '$app/forms';
	let { form } = $props();

	let sku = $state('');
	let loading = $state(false);
	let preview = $state(null);
	let existingSheet = $state(null); // { id, sku } if a sheet for this SKU already exists

	const LANGUAGES = [
		{ code: 'en', label: 'English' },
		{ code: 'da', label: 'Dansk' },
		{ code: 'sv', label: 'Svenska' },
		{ code: 'no', label: 'Norsk' }
	];

	async function lookupSku() {
		const trimmed = sku.trim();
		if (!trimmed) { preview = null; existingSheet = null; return; }

		const [rbRes, sheetRes] = await Promise.all([
			fetch(`/api/rackbeat/${encodeURIComponent(trimmed)}`),
			fetch(`/api/sheets?sku=${encodeURIComponent(trimmed)}`),
		]);

		preview       = rbRes.ok   ? await rbRes.json()   : null;
		existingSheet = sheetRes.ok ? (await sheetRes.json()).sheet : null;
	}

	let debounceTimer;
	function onSkuInput(e) {
		sku = e.target.value;
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(lookupSku, 600);
	}
</script>

<div class="page">
	<header>
		<a href="/" class="back">← Back</a>
		<h1>New Sales Sheet</h1>
	</header>

	<main>
		<div class="card">
			<form
				method="POST"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => { loading = false; update(); };
				}}
			>
				{#if form?.error}
					<p class="error">{form.error}</p>
				{/if}

				<div class="field">
					<label for="sku">Product SKU</label>
					<p class="hint">Enter the SKU to auto-fill product data from Rackbeat</p>
					<input
						id="sku"
						name="sku"
						type="text"
						placeholder="e.g. PROD-001"
						required
						oninput={onSkuInput}
					/>
				</div>

				{#if existingSheet}
					<div class="duplicate-card">
						<div class="duplicate-icon">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
							</svg>
						</div>
						<div class="duplicate-text">
							<strong>A sheet for this SKU already exists</strong>
							<span>You can edit the existing sheet instead of creating a duplicate.</span>
						</div>
						<a href="/sheet/{existingSheet.id}" class="btn-edit-existing">Edit existing →</a>
					</div>
				{:else if preview}
					<div class="preview-card">
						<span class="found-badge">✓ Found in Rackbeat</span>
						<strong>{preview.name}</strong>
						{#if preview.ean}<p class="preview-ean">EAN: {preview.ean}</p>{/if}
					</div>
				{/if}

				<div class="field">
					<label for="primary_language">Primary language</label>
					<p class="hint">You'll enter content in this language first. Other languages inherit it until translated.</p>
					<select id="primary_language" name="primary_language">
						{#each LANGUAGES as lang}
							<option value={lang.code}>{lang.label}</option>
						{/each}
					</select>
				</div>

				<div class="actions">
					<a href="/" class="btn-outline">Cancel</a>
					<button type="submit" class="btn-primary" disabled={loading || !!existingSheet}>
						{loading ? 'Creating…' : 'Create Sheet →'}
					</button>
				</div>
			</form>
		</div>
	</main>
</div>

<style>
	.page { min-height: 100vh; padding: 24px; }

	header {
		max-width: 500px;
		margin: 0 auto 24px;
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.back { color: #6b7280; text-decoration: none; font-size: 14px; }
	.back:hover { color: var(--accent); }
	h1 { font-size: 20px; font-weight: 700; }

	main { max-width: 500px; margin: 0 auto; }

	.card {
		background: white;
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		padding: 32px;
	}

	.field { margin-bottom: 24px; }

	label {
		display: block;
		font-size: 14px;
		font-weight: 600;
		margin-bottom: 4px;
	}

	.hint { font-size: 12px; color: #6b7280; margin-bottom: 8px; }

	input, select {
		width: 100%;
		padding: 10px 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 15px;
		outline: none;
		background: white;
		transition: border-color 0.15s;
	}

	input:focus, select:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
	}

	.duplicate-card {
		display: flex;
		align-items: center;
		gap: 12px;
		background: #fffbeb;
		border: 1px solid #fcd34d;
		border-radius: 10px;
		padding: 14px 16px;
		margin-bottom: 24px;
	}

	.duplicate-icon {
		flex-shrink: 0;
		width: 32px; height: 32px;
		background: #fef3c7;
		border-radius: 8px;
		display: flex; align-items: center; justify-content: center;
		color: #d97706;
	}

	.duplicate-text {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.duplicate-text strong { font-size: 13px; font-weight: 700; color: #92400e; }
	.duplicate-text span   { font-size: 12px; color: #b45309; }

	.btn-edit-existing {
		flex-shrink: 0;
		padding: 7px 14px;
		background: #f57832;
		color: white;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 700;
		text-decoration: none;
		white-space: nowrap;
		transition: background 0.15s;
	}
	.btn-edit-existing:hover { background: #e06820; }

	.preview-card {
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		border-radius: 6px;
		padding: 12px 16px;
		margin-bottom: 24px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.found-badge { font-size: 12px; color: #16a34a; font-weight: 500; }
	.preview-ean { font-size: 13px; color: #374151; }

	.actions { display: flex; gap: 12px; justify-content: flex-end; }

	.btn-primary {
		padding: 10px 20px;
		background: var(--accent);
		color: white;
		border: none;
		border-radius: var(--radius);
		font-size: 14px;
		font-weight: 500;
		transition: background 0.15s;
	}
	.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
	.btn-primary:disabled { opacity: 0.6; }

	.btn-outline {
		padding: 10px 20px;
		background: white;
		color: #374151;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 14px;
		font-weight: 500;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
	}
	.btn-outline:hover { background: #f9fafb; }

	.error {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: var(--danger);
		border-radius: 6px;
		padding: 10px 14px;
		font-size: 13px;
		margin-bottom: 16px;
	}
</style>
