<script>
	import { page } from '$app/state';
	const status = $derived(page.status);
	const transient = $derived(status >= 500);
</script>

<svelte:head><title>{status} — Portal</title></svelte:head>

<main class="err">
	<div class="card">
		<p class="code">{status}</p>
		{#if status === 404}
			<h1>Page not found</h1>
			<p>The page doesn't exist or has been moved.</p>
		{:else if status === 403}
			<h1>No access</h1>
			<p>{page.error?.message ?? "You don't have access to this section."}</p>
		{:else if transient}
			<h1>Something went wrong</h1>
			<p>Usually this is momentary — the database was busy. Trying again normally works.</p>
		{:else}
			<h1>Something went wrong</h1>
			<p>{page.error?.message ?? 'Unexpected error.'}</p>
		{/if}
		<div class="actions">
			{#if transient}<button class="btn primary" onclick={() => location.reload()}>Try again</button>{/if}
			<a class="btn" href="/">Go to frontpage</a>
		</div>
	</div>
</main>

<style>
	.err { min-height: 70vh; display: grid; place-items: center; padding: 24px 16px; }
	.card { max-width: 440px; width: 100%; background: #fff; border: 1px solid #ececec; border-radius: 14px; padding: 28px; text-align: center; }
	.code { font-size: 13px; font-weight: 800; letter-spacing: .08em; color: #a1a1aa; margin: 0 0 6px; }
	h1 { font-size: 20px; margin: 0 0 8px; }
	p { color: #52525b; font-size: 14px; margin: 0; }
	.actions { display: flex; gap: 8px; justify-content: center; margin-top: 20px; }
	.btn { border: 1px solid #e4e4e7; background: #fff; border-radius: 8px; padding: 8px 14px; font-size: 13px; font-weight: 700; color: #18181b; text-decoration: none; cursor: pointer; }
	.btn.primary { background: #18181b; color: #fff; border-color: #18181b; }
</style>
