<script>
	let { active = 'sheets' } = $props();
</script>

<header class="nav">
	<div class="nav-inner">
		<div class="nav-left">
			<a href="/" class="wordmark">
				<div class="wordmark-icon">
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
						<polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
						<line x1="12" y1="22.08" x2="12" y2="12"/>
					</svg>
				</div>
				<span>Product Portal</span>
			</a>

			<nav class="nav-links">
				<a href="/" class="nav-link" class:active={active === 'sheets'}>Sheets</a>
				<a href="/catalogues" class="nav-link" class:active={active === 'catalogues'}>Catalogues</a>
				<a href="/data" class="nav-link" class:active={active === 'data'}>Data</a>
				<a href="/translations" class="nav-link" class:active={active === 'translations'}>Translations</a>
				<a href="/planograms" class="nav-link" class:active={active === 'planograms'}>Planograms</a>
			</nav>
		</div>

		<a href="/logout" class="sign-out">Sign out</a>
	</div>
</header>

<style>
	.nav {
		background: white;
		border-bottom: 1px solid var(--border);
		padding: 0 28px;
	}

	.nav-inner {
		max-width: 1140px;
		margin: 0 auto;
		height: 54px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
	}

	.nav-left {
		display: flex;
		align-items: center;
		gap: 20px;
	}

	.wordmark {
		display: flex;
		align-items: center;
		gap: 9px;
		font-size: 14px;
		font-weight: 800;
		color: #18181B;
		letter-spacing: -0.3px;
		flex-shrink: 0;
		text-decoration: none;
		transition: opacity 0.15s;
	}
	.wordmark:hover { opacity: 0.85; }

	.wordmark-icon {
		width: 30px;
		height: 30px;
		background: #F57832;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		box-shadow: 0 2px 8px rgba(245, 120, 50, 0.35);
	}

	.nav-links {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.nav-link {
		padding: 5px 12px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 600;
		color: #8A7550;
		text-decoration: none;
		transition: background 0.15s, color 0.15s;
	}

	.nav-link:hover:not(.active) {
		background: #FFE6A5;
		color: #7B3803;
	}

	.nav-link.active {
		background: #FFE6A5;
		color: #7B3803;
	}

	.sign-out {
		font-size: 13px;
		color: #A89060;
		text-decoration: none;
		font-weight: 600;
		transition: color 0.15s;
		flex-shrink: 0;
	}
	.sign-out:hover { color: #F57832; }
</style>
