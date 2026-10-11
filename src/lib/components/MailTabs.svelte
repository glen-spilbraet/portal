<script>
	// Tab bar for the Mail section. `active` = 'campaigns' | 'contacts' | 'accounts'.
	let { active = 'campaigns' } = $props();
	const tabs = [
		{ key: 'campaigns', label: 'Campaigns', href: '/mail/campaigns' },
		{ key: 'accounts', label: 'Key Accounts', href: '/mail/accounts' },
		{ key: 'contacts', label: 'Contacts', href: '/mail/contacts' },
	];
</script>

<div class="mail-tabs">
	{#each tabs as t}
		<a href={t.href} class="tab" class:active={active === t.key}>{t.label}</a>
	{/each}
</div>

<style>
	.mail-tabs { display: flex; gap: 4px; max-width: 1140px; margin: 0 auto; width: 100%; padding: 16px 28px 0; }
	.tab { font-family: inherit; font-size: 14px; font-weight: 600; color: #8A7550; text-decoration: none; padding: 9px 16px; border-radius: 10px 10px 0 0; border: 1px solid transparent; border-bottom: none; }
	.tab:hover { background: #FBF7EF; color: #7B3803; }
	.tab.active { background: #fff; color: #18181B; border-color: var(--border); }
</style>
