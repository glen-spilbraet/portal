<script>
	let { data } = $props();

	const errorMessages = {
		not_allowed: data.blockedEmail
			? `${data.blockedEmail} doesn't have access. Contact an admin.`
			: 'Your Google account doesn\'t have access. Contact an admin.',
		access_denied: 'Sign-in was cancelled.',
		token_exchange_failed: 'Something went wrong. Please try again.',
		invalid_token: 'Something went wrong. Please try again.',
		no_email: 'Could not read your Google email address.',
	};
	const errorText = data.error ? (errorMessages[data.error] ?? 'Sign-in failed. Please try again.') : null;
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
		<p class="subtitle">Sign in with your Google account to continue</p>

		{#if errorText}
			<div class="error">{errorText}</div>
		{/if}

		<a href="/auth/google?next={encodeURIComponent(data.next)}" class="google-btn">
			<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
				<path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
				<path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
				<path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
				<path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
			</svg>
			Sign in with Google
		</a>

		<p class="hint">Only pre-approved accounts can access this portal.</p>
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
		margin-bottom: 28px;
		margin-top: 4px;
	}

	.google-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		width: 100%;
		padding: 11px 16px;
		background: white;
		color: #3c4043;
		border: 1px solid #dadce0;
		border-radius: 10px;
		font-size: 15px;
		font-weight: 600;
		font-family: inherit;
		text-decoration: none;
		transition: background 0.15s, box-shadow 0.15s;
		box-shadow: 0 1px 4px rgba(0,0,0,0.08);
	}
	.google-btn:hover {
		background: #f8f8f8;
		box-shadow: 0 2px 8px rgba(0,0,0,0.12);
	}

	.hint {
		margin-top: 20px;
		font-size: 12px;
		color: #bbb;
	}

	.error {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #dc2626;
		border-radius: 8px;
		padding: 10px 14px;
		font-size: 13px;
		font-weight: 600;
		margin-bottom: 20px;
		text-align: left;
	}
</style>
