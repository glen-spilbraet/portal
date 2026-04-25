<script>
	import { goto } from '$app/navigation';

	const LANGUAGES = [
		{ code: 'en', label: 'English' },
		{ code: 'da', label: 'Dansk' },
		{ code: 'sv', label: 'Svenska' },
		{ code: 'no', label: 'Norsk' }
	];

	let name = $state('');
	let language = $state('en');
	let loading = $state(false);
	let error = $state('');

	async function submit(e) {
		e.preventDefault();
		if (!name.trim()) { error = 'Name is required.'; return; }
		loading = true;
		error = '';
		try {
			const res = await fetch('/api/catalogues', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: name.trim(), language })
			});
			if (!res.ok) { error = 'Failed to create catalogue.'; loading = false; return; }
			const { id } = await res.json();
			goto(`/catalogues/${id}`);
		} catch {
			error = 'Something went wrong.';
			loading = false;
		}
	}
</script>

<div class="page">
	<header>
		<a href="/catalogues" class="back">← Back</a>
		<h1>New Catalogue</h1>
	</header>

	<main>
		<div class="card">
			<form onsubmit={submit}>
				{#if error}
					<p class="error-msg">{error}</p>
				{/if}

				<div class="field">
					<label for="name">Catalogue name</label>
					<p class="hint">Internal name for identifying this catalogue.</p>
					<input
						id="name"
						type="text"
						placeholder="e.g. Spring 2025 Catalogue"
						bind:value={name}
						required
					/>
				</div>

				<div class="field">
					<label for="language">Language</label>
					<p class="hint">The primary language for this catalogue's content.</p>
					<select id="language" bind:value={language}>
						{#each LANGUAGES as lang}
							<option value={lang.code}>{lang.label}</option>
						{/each}
					</select>
				</div>

				<div class="actions">
					<a href="/catalogues" class="btn-outline">Cancel</a>
					<button type="submit" class="btn-primary" disabled={loading}>
						{loading ? 'Creating…' : 'Create Catalogue →'}
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
		font-family: inherit;
		transition: border-color 0.15s;
	}

	input:focus, select:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
	}

	.actions { display: flex; gap: 12px; justify-content: flex-end; }

	.btn-primary {
		padding: 10px 20px;
		background: var(--accent);
		color: white;
		border: none;
		border-radius: var(--radius);
		font-size: 14px;
		font-weight: 500;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.15s;
	}
	.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
	.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

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

	.error-msg {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: var(--danger);
		border-radius: 6px;
		padding: 10px 14px;
		font-size: 13px;
		margin-bottom: 16px;
	}
</style>
