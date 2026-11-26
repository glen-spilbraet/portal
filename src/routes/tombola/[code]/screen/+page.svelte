<script>
	import { enhance } from '$app/forms';
	import TombolaBoard from '$lib/components/events/TombolaBoard.svelte';
	let { data, form } = $props();
	let busy = $state(false);
</script>

<svelte:head><title>Tombola — {data.eventTitle}</title></svelte:head>

{#if data.authed}
	<TombolaBoard {data} />
{:else}
	<div class="pin-page">
		<form class="pin-card" method="POST" action="?/pin" use:enhance={() => { busy = true; return async ({ update }) => { await update(); busy = false; }; }}>
			<div class="tag">🎟️ Tombola</div>
			<h1>{data.eventTitle}</h1>
			<label for="pin">Enter PIN to open the big screen</label>
			<!-- svelte-ignore a11y_autofocus -->
			<input id="pin" name="pin" type="password" inputmode="numeric" autocomplete="off" pattern="[0-9]*" maxlength="8" required autofocus />
			{#if form?.error}<p class="err">{form.error}</p>{/if}
			<button disabled={busy}>{busy ? 'Checking…' : 'Open big screen'}</button>
		</form>
	</div>
{/if}

<style>
	.pin-page {
		position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: 16px;
		background: radial-gradient(110% 85% at 72% 0%, #127a40 0%, #00411E 48%, #002a13 100%);
		font-family: Nunito, system-ui, sans-serif;
	}
	.pin-page::before { content: ''; position: absolute; inset: 0; pointer-events: none; background: url(/pattern-tile-white.svg) repeat; background-size: 560px auto; opacity: .06; }
	.pin-card { position: relative; width: min(420px, 100%); background: #fff; color: #00411E; border-radius: 22px; padding: 28px 26px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,.4); border-bottom: 6px solid #F57832; }
	.tag { display: inline-block; background: #F57832; color: #fff; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; font-size: 12px; padding: 5px 12px; border-radius: 99px; }
	h1 { margin: 10px 0 18px; font-size: 26px; font-weight: 900; line-height: 1.15; }
	label { display: block; font-weight: 800; font-size: 14px; color: #2d5a3d; margin-bottom: 10px; }
	input { width: 100%; box-sizing: border-box; font: inherit; font-size: 34px; font-weight: 900; letter-spacing: .5em; text-align: center; padding: 12px 0 12px .5em; border: 2px solid #E1EAD6; border-radius: 14px; color: #00411E; outline: none; }
	input:focus { border-color: #F57832; }
	.err { color: #d62f4b; font-weight: 800; font-size: 14px; margin: 10px 0 0; }
	button { width: 100%; margin-top: 16px; font: inherit; font-size: 18px; font-weight: 900; color: #00411E; background: linear-gradient(135deg, #FFE6A5, #F57832 55%); border: 0; border-radius: 14px; padding: 14px; cursor: pointer; box-shadow: 0 5px 0 #7B3803; }
	button:disabled { opacity: .7; }
</style>
