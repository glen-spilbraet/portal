<script>
	import { enhance } from '$app/forms';
	let { data, form } = $props();
</script>

<svelte:head>
	<title>Sign In — Product Portal</title>
</svelte:head>

<div class="page">
	<div class="card">
		<div class="brand">
			<div class="brand-icon">
				<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
					<polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
					<line x1="12" y1="22.08" x2="12" y2="12"/>
				</svg>
			</div>
			<h1>Product Portal</h1>
		</div>
		<p class="subtitle">Enter your password to continue</p>

		<form method="POST" use:enhance>
			<input type="hidden" name="next" value={data.next} />

			{#if form?.error}
				<p class="error">{form.error}</p>
			{/if}

			<div class="field">
				<label for="password">Password</label>
				<input
					id="password"
					name="password"
					type="password"
					placeholder="Enter password"
					autocomplete="current-password"
					required
					autofocus
				/>
			</div>

			<button type="submit" class="btn-primary">Sign in</button>
		</form>
	</div>
</div>

<style>
	.page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		background: #FFF5D2;
	}

	.card {
		background: white;
		border-radius: 20px;
		border: 1px solid var(--border);
		box-shadow: 0 12px 48px rgba(100, 60, 0, 0.12);
		padding: 48px 40px 40px;
		width: 100%;
		max-width: 380px;
		text-align: center;
	}

	.brand {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		margin-bottom: 8px;
	}

	.brand-icon {
		width: 64px;
		height: 64px;
		background: #F57832;
		border-radius: 18px;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 8px 24px rgba(245, 120, 50, 0.4);
	}

	h1 {
		font-size: 22px;
		font-weight: 800;
		color: #18181B;
		letter-spacing: -0.4px;
	}

	.subtitle {
		color: #A89060;
		font-size: 14px;
		font-weight: 500;
		margin-bottom: 32px;
		margin-top: 4px;
	}

	.field {
		text-align: left;
		margin-bottom: 20px;
	}

	label {
		display: block;
		font-size: 13px;
		font-weight: 700;
		margin-bottom: 6px;
		color: #52525B;
	}

	input {
		width: 100%;
		padding: 10px 14px;
		border: 1px solid var(--border);
		border-radius: 10px;
		font-size: 15px;
		font-family: inherit;
		outline: none;
		background: #FFFBF0;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	input:focus {
		border-color: #F57832;
		box-shadow: 0 0 0 3px rgba(245, 120, 50, 0.15);
		background: white;
	}

	.btn-primary {
		width: 100%;
		padding: 12px;
		background: #F57832;
		color: white;
		border: none;
		border-radius: 10px;
		font-size: 15px;
		font-weight: 700;
		font-family: inherit;
		transition: background 0.15s, box-shadow 0.15s;
		box-shadow: 0 4px 14px rgba(245, 120, 50, 0.35);
	}

	.btn-primary:hover {
		background: #E06820;
		box-shadow: 0 6px 20px rgba(245, 120, 50, 0.45);
	}

	.error {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: var(--danger);
		border-radius: 8px;
		padding: 10px 14px;
		font-size: 13px;
		font-weight: 600;
		margin-bottom: 16px;
	}
</style>
