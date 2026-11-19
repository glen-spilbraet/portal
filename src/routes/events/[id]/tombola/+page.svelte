<script>
	import { onMount, tick } from 'svelte';
	import qrcode from 'qrcode-generator';
	let { data } = $props();

	// ── QR code (SVG path) ─────────────────────────────────────────────────────
	const qr = (() => {
		const q = qrcode(0, 'M');
		q.addData(data.joinUrl);
		q.make();
		const n = q.getModuleCount();
		let d = '';
		for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
		return { n, d };
	})();

	// ── State ──────────────────────────────────────────────────────────────────
	const COLORS = ['#F57832', '#FFC93C', '#2FD88A', '#3EC1F3', '#A66CFF', '#FF5C8A', '#00D1B2', '#FF8F3F'];
	/** @type {Map<string, {x:number,y:number}>} */
	const spots = new Map();

	let status = $state('open');
	let count = $state(0);
	let entries = $state(/** @type {any[]} */ ([]));
	let winners = $state(/** @type {any[]} */ ([]));
	/** entry_id → { id, message } currently shown on that person's bubble */
	let speaking = $state(/** @type {Record<string, {id:string,message:string}>} */ ({}));
	let toasts = $state(/** @type {{id:string,text:string}[]} */ ([]));
	let since = '';
	let loaded = false;
	const seenEntries = new Set();
	const seenShouts = new Set();
	let countPop = $state(0);

	let controlsVisible = $state(true);
	/** @type {any} */
	let hideTimer;
	let sound = $state(true);
	let busy = $state(false);
	let errMsg = $state('');

	const winnerIds = $derived(new Set(winners.map((w) => w.entry_id)));
	const shown = $derived(entries.slice(-120)); // keep the board readable with huge crowds
	const bubbleScale = $derived(shown.length > 80 ? 0.72 : shown.length > 45 ? 0.85 : 1);

	const short = (e) => `${e.first_name} ${(e.last_name || '').charAt(0)}.`.trim();
	const full = (e) => `${e.first_name} ${e.last_name}`.trim();
	function hash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
	const colorOf = (id) => COLORS[hash(id) % COLORS.length];
	const floatOf = (id) => { const h = hash(id + 'f'); return { dur: 5 + (h % 50) / 10, delay: -((h >> 8) % 60) / 10, dx: 6 + (h >> 4) % 10, dy: 8 + (h >> 12) % 12 }; };

	/** Best-candidate placement: pick the spot farthest from the existing bubbles. */
	function spotFor(id) {
		let s = spots.get(id);
		if (s) return s;
		const pts = [...spots.values()];
		let best = { x: 50, y: 50 }, bestD = -1;
		for (let i = 0; i < 14; i++) {
			const c = { x: 6 + Math.random() * 82, y: 14 + Math.random() * 70 };
			let d = Infinity;
			for (const p of pts) d = Math.min(d, (p.x - c.x) ** 2 + ((p.y - c.y) * 1.6) ** 2);
			if (d > bestD) { bestD = d; best = c; }
		}
		spots.set(id, best);
		return best;
	}

	// ── Polling ────────────────────────────────────────────────────────────────
	async function poll() {
		try {
			const r = await fetch(`/api/event-tombola/${data.eventId}/feed${since ? `?since=${encodeURIComponent(since)}` : ''}`);
			if (!r.ok) return;
			const j = await r.json();
			status = j.status;
			if (j.count !== count) { count = j.count; countPop++; }
			// Mid-spin, keep the fresh winner secret (no crown / list entry until the reveal).
			winners = draw?.phase === 'spin' ? j.winners.filter((w) => w.entry_id !== draw?.winner.entry_id) : j.winners;
			const fresh = j.entries.filter((e) => !seenEntries.has(e.id));
			for (const e of fresh) { seenEntries.add(e.id); spotFor(e.id); }
			if (fresh.length) {
				entries = [...entries, ...fresh];
				if (loaded) for (const e of fresh.slice(-4)) toast(`🎉 ${short(e)} joined!`), sound && blip(660, 0.08, 'triangle', 0.08);
			}
			for (const s of j.shoutouts) {
				if (seenShouts.has(s.id)) continue;
				seenShouts.add(s.id);
				if (loaded) showShout(s);
			}
			since = j.now;
			loaded = true;
		} catch { /* offline for a moment — next poll catches up */ }
	}

	function toast(text) {
		const id = crypto.randomUUID();
		toasts = [...toasts.slice(-3), { id, text }];
		setTimeout(() => (toasts = toasts.filter((t) => t.id !== id)), 4200);
	}

	/** Shoutouts queue per person so a burst of messages each gets its moment. */
	const queues = new Map();
	function showShout(s) {
		if (!seenEntries.has(s.entry_id)) return;
		const q = queues.get(s.entry_id) ?? [];
		q.push(s);
		queues.set(s.entry_id, q);
		if (q.length === 1) nextShout(s.entry_id);
	}
	function nextShout(entryId) {
		const q = queues.get(entryId);
		if (!q?.length) { const { [entryId]: _, ...rest } = speaking; speaking = rest; return; }
		const s = q[0];
		speaking = { ...speaking, [entryId]: { id: s.id, message: s.message } };
		if (sound) blip(880, 0.06, 'sine', 0.06);
		setTimeout(() => { q.shift(); nextShout(entryId); }, 9000);
	}

	async function hideShout(entryId, shoutId) {
		const q = queues.get(entryId);
		if (q?.[0]?.id === shoutId) { q.shift(); q.unshift({ id: '_', message: '' }); }
		const { [entryId]: _, ...rest } = speaking; speaking = rest;
		await fetch(`/api/event-tombola/${data.eventId}/shoutouts/${shoutId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hidden: true }) });
	}

	// ── Controls ───────────────────────────────────────────────────────────────
	function poke() {
		controlsVisible = true;
		clearTimeout(hideTimer);
		hideTimer = setTimeout(() => (controlsVisible = false), 3500);
	}
	function fullscreen() {
		if (document.fullscreenElement) document.exitFullscreen();
		else document.documentElement.requestFullscreen?.();
	}
	async function toggleStatus() {
		const next = status === 'open' ? 'closed' : 'open';
		if (next === 'closed' && !confirm('Close sign-ups? New people won’t be able to join (everyone already in stays in the draw).')) return;
		const r = await fetch(`/api/event-tombola/${data.eventId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: next }) });
		if (r.ok) status = next;
	}

	// ── Sound (WebAudio, no files) ─────────────────────────────────────────────
	let ac;
	function audio() { ac ??= new (window.AudioContext || /** @type {any} */ (window).webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); return ac; }
	function blip(freq, dur = 0.05, type = 'square', vol = 0.05, at = 0) {
		try {
			const a = audio(), o = a.createOscillator(), g = a.createGain(), t = a.currentTime + at;
			o.type = type; o.frequency.setValueAtTime(freq, t);
			g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
			o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
		} catch {}
	}
	function fanfare() {
		[523, 659, 784, 1047].forEach((f, i) => blip(f, 0.22, 'triangle', 0.12, i * 0.12));
		[523, 659, 784, 1047].forEach((f) => blip(f, 1.4, 'triangle', 0.07, 0.55));
	}

	// ── The draw ───────────────────────────────────────────────────────────────
	let draw = $state(/** @type {null | {phase:'spin'|'reveal', names:string[], winner:any, offset:number}} */ (null));
	const ROW = 1; // reel row height in "em" of .reel

	async function startDraw() {
		if (busy) return;
		errMsg = '';
		busy = true;
		try {
			const r = await fetch(`/api/event-tombola/${data.eventId}/draw`, { method: 'POST' });
			const j = await r.json().catch(() => ({}));
			if (!r.ok) { errMsg = j.error === 'empty' ? (count ? 'Everyone has already won!' : 'No participants yet.') : 'Could not draw — try again.'; setTimeout(() => (errMsg = ''), 4000); return; }
			const w = j.winner;
			// Build the reel from the remaining pool (fall back to everyone), winner last.
			const pool = entries.filter((e) => !winnerIds.has(e.id) && e.id !== w.entry_id);
			const src = pool.length ? pool : entries.filter((e) => e.id !== w.entry_id);
			const names = [];
			const len = Math.max(36, Math.min(70, src.length * 3));
			for (let i = 0; i < len; i++) names.push(src.length ? full(src[Math.floor(Math.random() * src.length)]) : '★ ★ ★');
			names.push(full(w));
			names.push(src.length ? full(src[Math.floor(Math.random() * src.length)]) : ''); // a name peeking below
			draw = { phase: 'spin', names, winner: w, offset: 0 };
			await tick();
			await spin(names.length - 2);
			draw.phase = 'reveal';
			if (sound) fanfare();
			burstConfetti();
			winners = [...winners.filter((x) => x.entry_id !== w.entry_id), { ...w, drawn_at: '' }];
		} finally { busy = false; }
	}

	/** Spin the reel to `target` with an ease-out, ticking as names pass. */
	function spin(target) {
		return new Promise((resolve) => {
			const dur = 6800, t0 = performance.now();
			const ease = (t) => 1 - Math.pow(1 - t, 4.2);
			let lastIdx = -1;
			const frame = (now) => {
				const t = Math.min(1, (now - t0) / dur);
				const pos = ease(t) * target;
				if (draw) draw.offset = pos;
				const idx = Math.floor(pos + 0.5);
				if (idx !== lastIdx) { lastIdx = idx; if (sound) blip(1200 + (idx % 3) * 120, 0.03, 'square', 0.035); }
				if (t < 1) requestAnimationFrame(frame);
				else setTimeout(resolve, 450);
			};
			requestAnimationFrame(frame);
		});
	}

	function closeDraw() { draw = null; stopConfetti(); }

	// ── Confetti (canvas) ──────────────────────────────────────────────────────
	let canvas = $state();
	/** @type {any[]} */
	let parts = [];
	let raf = 0;
	function burstConfetti() {
		const W = canvas.width = window.innerWidth * devicePixelRatio;
		const H = canvas.height = window.innerHeight * devicePixelRatio;
		const add = (x, y, angle, spread, n, speed) => {
			for (let i = 0; i < n; i++) {
				const a = angle + (Math.random() - 0.5) * spread, v = speed * (0.55 + Math.random() * 0.7);
				parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: (8 + Math.random() * 10) * devicePixelRatio, h: (5 + Math.random() * 7) * devicePixelRatio,
					r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.35, c: COLORS[i % COLORS.length], life: 0, wob: Math.random() * 10 });
			}
		};
		const s = 26 * devicePixelRatio;
		add(0, H * 0.75, -Math.PI / 3.2, 0.9, 170, s);
		add(W, H * 0.75, -Math.PI + Math.PI / 3.2, 0.9, 170, s);
		add(W / 2, H * 0.45, -Math.PI / 2, Math.PI * 1.6, 200, s * 0.8);
		// Second and third waves: gentle rain from the top.
		setTimeout(() => { for (let i = 0; i < 160; i++) add(Math.random() * W, -20, Math.PI / 2, 0.6, 1, 4 * devicePixelRatio); }, 900);
		setTimeout(() => { for (let i = 0; i < 160; i++) add(Math.random() * W, -20, Math.PI / 2, 0.6, 1, 4 * devicePixelRatio); }, 2200);
		if (!raf) raf = requestAnimationFrame(stepConfetti);
	}
	function stepConfetti() {
		const ctx = canvas?.getContext('2d');
		if (!ctx) { raf = 0; return; }
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		const g = 0.42 * devicePixelRatio;
		parts = parts.filter((p) => p.y < canvas.height + 40 && p.life < 900);
		for (const p of parts) {
			p.life++; p.vy += g * 0.5; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx + Math.sin((p.life + p.wob) / 9) * 1.2; p.y += p.vy; p.r += p.vr;
			ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.scale(1, Math.cos(p.life / 6 + p.wob));
			ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
		}
		raf = parts.length ? requestAnimationFrame(stepConfetti) : 0;
	}
	function stopConfetti() { parts = []; }

	onMount(() => {
		poll();
		const iv = setInterval(() => { if (!document.hidden) poll(); }, 2000);
		poke();
		const onKey = (e) => {
			if (e.target?.tagName === 'INPUT') return;
			if (e.key === 'Escape' && draw?.phase === 'reveal') closeDraw();
			if (e.key === 'f') fullscreen();
		};
		addEventListener('keydown', onKey);
		return () => { clearInterval(iv); removeEventListener('keydown', onKey); cancelAnimationFrame(raf); };
	});
</script>

<svelte:head><title>Tombola — {data.eventTitle}</title></svelte:head>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="board" class:hide-cursor={!controlsVisible && !draw} onmousemove={poke}>
	<div class="glow g1"></div><div class="glow g2"></div><div class="glow g3"></div>

	<!-- Left: QR + count + winners -->
	<aside class="side">
		<div class="brand">🎟️ Tombola</div>
		<h1 class="title">{data.eventTitle}</h1>
		<div class="qr-card" class:closed={status !== 'open'}>
			<svg viewBox="-2 -2 {qr.n + 4} {qr.n + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width={qr.n + 4} height={qr.n + 4} fill="#fff" /><path d={qr.d} fill="#1b1033" /></svg>
			{#if status !== 'open'}<div class="qr-closed">Sign-ups closed</div>{/if}
		</div>
		{#if status === 'open'}
			<div class="scan">Scan to join!</div>
			<div class="url">{data.joinHost}</div>
		{/if}

		<div class="count-box">
			{#key countPop}<div class="count">{count}</div>{/key}
			<div class="count-label">{count === 1 ? 'player' : 'players'} in the draw</div>
		</div>

		{#if winners.length}
			<div class="winners">
				<div class="winners-head">🏆 Winners</div>
				{#each winners as w, i (w.entry_id)}<div class="winner-row"><span class="num">{i + 1}</span>{full(w)}</div>{/each}
			</div>
		{/if}
	</aside>

	<!-- Right: floating name bubbles -->
	<section class="stage" style="--s:{bubbleScale}">
		{#if !entries.length}
			<div class="waiting">
				<div class="dots"><span></span><span></span><span></span></div>
				Waiting for players… scan the QR code!
			</div>
		{/if}
		{#each shown as e (e.id)}
			{@const p = spots.get(e.id) ?? spotFor(e.id)}
			{@const fl = floatOf(e.id)}
			<div class="bubble-pos" style="left:{p.x}%; top:{p.y}%; z-index:{speaking[e.id] ? 50 : 1}">
				<div class="bubble-float" style="--dur:{fl.dur}s; --delay:{fl.delay}s; --dx:{fl.dx}px; --dy:{fl.dy}px">
					<div class="bubble" class:talking={speaking[e.id]} class:won={winnerIds.has(e.id)} style="--c:{colorOf(e.id)}">
						{#if winnerIds.has(e.id)}<span class="crown">👑</span>{/if}
						{short(e)}
					</div>
					{#if speaking[e.id]?.message}
						{@const sp = speaking[e.id]}
						{#key sp.id}
							<div class="speech" class:below={p.y < 30} class:left={p.x > 70} class:right={p.x < 18}>
								{sp.message}
								<button class="hide-shout" title="Hide this shoutout" onclick={() => hideShout(e.id, sp.id)}>✕</button>
							</div>
						{/key}
					{/if}
				</div>
			</div>
		{/each}
		<div class="toasts">
			{#each toasts as t (t.id)}<div class="toast">{t.text}</div>{/each}
		</div>
	</section>

	<!-- Controls -->
	<div class="controls" class:visible={controlsVisible && !draw}>
		<a class="ctl ghost" href="/events/{data.eventId}">← Event</a>
		<button class="ctl ghost" onclick={fullscreen}>⛶ Fullscreen</button>
		<button class="ctl ghost" onclick={() => (sound = !sound)}>{sound ? '🔊 Sound on' : '🔇 Sound off'}</button>
		<button class="ctl ghost" onclick={toggleStatus}>{status === 'open' ? '🔒 Close sign-ups' : '🔓 Re-open sign-ups'}</button>
		<button class="ctl draw" onclick={startDraw} disabled={busy}>🎲 DRAW WINNER</button>
		{#if errMsg}<span class="ctl-err">{errMsg}</span>{/if}
	</div>

	<!-- Draw overlay -->
	{#if draw}
		<div class="overlay" class:revealed={draw.phase === 'reveal'}>
			{#if draw.phase === 'spin'}
				<div class="drum">And the winner is…</div>
				<div class="reel-window">
					<div class="reel-mask"></div>
					<div class="reel" style="transform: translateY({-(draw.offset - 1) * ROW}em)">
						{#each draw.names as n, i}<div class="reel-row" class:hit={Math.round(draw.offset) === i}>{n}</div>{/each}
					</div>
					<div class="reel-frame"></div>
				</div>
			{:else}
				<div class="rays"></div>
				<div class="reveal">
					<div class="reveal-label">🏆 WINNER 🏆</div>
					<div class="reveal-name">{draw.winner.first_name}<br />{draw.winner.last_name}</div>
					<div class="reveal-actions">
						<button class="ctl draw" onclick={() => { closeDraw(); startDraw(); }}>🎲 Draw again</button>
						<button class="ctl ghost" onclick={closeDraw}>Close</button>
					</div>
				</div>
			{/if}
		</div>
	{/if}
	<canvas class="confetti" bind:this={canvas}></canvas>
</div>

<style>
	.board {
		position: fixed; inset: 0; overflow: hidden; display: grid; grid-template-columns: minmax(300px, 27vw) 1fr;
		background: radial-gradient(120% 90% at 70% 0%, #3d1f75 0%, #1b1033 55%, #0e0820 100%);
		color: #fff; font-family: Nunito, system-ui, sans-serif; user-select: none; z-index: 100;
	}
	.hide-cursor { cursor: none; }
	.glow { position: absolute; border-radius: 50%; filter: blur(80px); opacity: .45; pointer-events: none; animation: drift 22s ease-in-out infinite alternate; }
	.g1 { width: 40vw; height: 40vw; background: #F57832; left: 45%; top: 55%; opacity: .22; }
	.g2 { width: 35vw; height: 35vw; background: #6a3fd1; left: 70%; top: -10%; animation-duration: 28s; }
	.g3 { width: 30vw; height: 30vw; background: #00d1b2; left: 25%; top: -15%; opacity: .18; animation-duration: 34s; }
	@keyframes drift { to { transform: translate(-8vw, 6vh) scale(1.15); } }

	/* Side panel */
	.side { position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; padding: 3vh 2vw; gap: 1.4vh; background: rgba(255,255,255,.04); border-right: 1px solid rgba(255,255,255,.08); backdrop-filter: blur(6px); overflow: hidden; }
	.brand { background: #F57832; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; font-size: clamp(12px, 1vw, 20px); padding: .35em 1em; border-radius: 99px; }
	.title { margin: 0; text-align: center; font-weight: 900; font-size: clamp(20px, 2.1vw, 44px); line-height: 1.1; }
	.qr-card { position: relative; width: min(19vw, 34vh); aspect-ratio: 1; background: #fff; border-radius: 1.4vw; padding: 1vw; box-shadow: 0 0 0 6px rgba(245,120,50,.5), 0 20px 60px rgba(0,0,0,.5); animation: qrpulse 2.4s ease-in-out infinite; }
	.qr-card svg { width: 100%; height: 100%; display: block; }
	.qr-card.closed { animation: none; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
	.qr-card.closed svg { opacity: .12; }
	.qr-closed { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; color: #1b1033; font-weight: 900; font-size: clamp(18px, 1.8vw, 36px); }
	@keyframes qrpulse { 50% { box-shadow: 0 0 0 14px rgba(245,120,50,.18), 0 20px 60px rgba(0,0,0,.5); } }
	.scan { font-weight: 900; font-size: clamp(20px, 2vw, 42px); color: #FFC93C; }
	.url { font-family: ui-monospace, monospace; font-size: clamp(12px, .95vw, 20px); opacity: .7; margin-top: -1vh; }
	.count-box { text-align: center; margin-top: .5vh; }
	.count { font-size: clamp(56px, 7vw, 150px); font-weight: 900; line-height: 1; background: linear-gradient(180deg, #fff, #ffc93c); -webkit-background-clip: text; background-clip: text; color: transparent; animation: pop .45s cubic-bezier(.2,1.8,.4,1); }
	.count-label { font-weight: 800; opacity: .75; font-size: clamp(14px, 1.2vw, 26px); }
	.winners { width: 100%; background: rgba(255,201,60,.1); border: 1px solid rgba(255,201,60,.35); border-radius: 14px; padding: 1vh 1vw; overflow: auto; min-height: 0; }
	.winners-head { font-weight: 900; color: #FFC93C; margin-bottom: .5vh; font-size: clamp(14px, 1.1vw, 24px); }
	.winner-row { display: flex; gap: .6em; align-items: center; font-weight: 800; font-size: clamp(13px, 1vw, 22px); padding: .2em 0; }
	.num { display: inline-grid; place-items: center; width: 1.6em; height: 1.6em; border-radius: 50%; background: #FFC93C; color: #2a1300; font-size: .8em; flex-shrink: 0; }

	/* Stage + bubbles */
	.stage { position: relative; z-index: 1; }
	.waiting { position: absolute; inset: 0; display: flex; flex-direction: column; gap: 2vh; align-items: center; justify-content: center; font-size: clamp(22px, 2.4vw, 52px); font-weight: 900; opacity: .85; }
	.dots { display: flex; gap: 1vw; }
	.dots span { width: 1.6vw; height: 1.6vw; border-radius: 50%; background: #F57832; animation: bounce 1.2s infinite ease-in-out; }
	.dots span:nth-child(2) { animation-delay: .15s; background: #FFC93C; }
	.dots span:nth-child(3) { animation-delay: .3s; background: #2FD88A; }
	@keyframes bounce { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-2vh); } }
	.bubble-pos { position: absolute; transform: translate(-50%, -50%); }
	.bubble-float { position: relative; animation: float var(--dur) ease-in-out var(--delay) infinite alternate; }
	@keyframes float { from { transform: translate(calc(var(--dx) * -1), calc(var(--dy) * -1)); } to { transform: translate(var(--dx), var(--dy)); } }
	.bubble {
		position: relative; white-space: nowrap; font-weight: 900; font-size: calc(clamp(15px, 1.35vw, 30px) * var(--s));
		padding: .5em 1em; border-radius: 99px; color: #1b1033; background: var(--c);
		box-shadow: inset 0 -4px 0 rgba(0,0,0,.15), 0 8px 24px rgba(0,0,0,.35); animation: join .7s cubic-bezier(.2,1.8,.4,1) both;
		transition: transform .3s;
	}
	.bubble.talking { transform: scale(1.15); box-shadow: 0 0 0 4px #fff, 0 10px 34px rgba(0,0,0,.5); }
	.bubble.won { background: linear-gradient(135deg, #fff3b0, #ffc93c 50%, #f5a623); box-shadow: 0 0 24px rgba(255,201,60,.8), inset 0 -4px 0 rgba(0,0,0,.15); }
	.crown { position: absolute; top: -.95em; left: 50%; transform: translateX(-50%) rotate(-8deg); font-size: 1.1em; }
	@keyframes join { 0% { transform: scale(0); opacity: 0; } 60% { transform: scale(1.25); opacity: 1; } 100% { transform: scale(1); } }
	.speech {
		position: absolute; bottom: calc(100% + 14px); left: 50%; transform: translateX(-50%); width: max-content; max-width: 26vw;
		background: #fff; color: #1b1033; font-weight: 800; font-size: clamp(15px, 1.25vw, 28px); line-height: 1.25; padding: .6em .9em; border-radius: 18px;
		box-shadow: 0 12px 34px rgba(0,0,0,.45); animation: speech .45s cubic-bezier(.2,1.6,.4,1) both; white-space: normal; word-break: break-word;
	}
	.speech::after { content: ''; position: absolute; top: 100%; left: 50%; margin-left: -10px; border: 10px solid transparent; border-top-color: #fff; }
	.speech.below { bottom: auto; top: calc(100% + 14px); }
	.speech.below::after { top: auto; bottom: 100%; border-top-color: transparent; border-bottom-color: #fff; }
	.speech.left { left: auto; right: -10px; transform: none; }
	.speech.left::after { left: auto; right: 24px; }
	.speech.right { left: -10px; transform: none; }
	.speech.right::after { left: 34px; }
	@keyframes speech { from { opacity: 0; scale: .5; } to { opacity: 1; scale: 1; } }
	.hide-shout { position: absolute; top: -8px; right: -8px; width: 22px; height: 22px; border-radius: 50%; border: 0; background: #d62f4b; color: #fff; font-size: 11px; cursor: pointer; opacity: 0; transition: opacity .2s; }
	.speech:hover .hide-shout { opacity: 1; }
	.toasts { position: absolute; top: 2.5vh; right: 2vw; display: flex; flex-direction: column; gap: 1vh; align-items: flex-end; pointer-events: none; }
	.toast { background: rgba(255,255,255,.95); color: #1b1033; font-weight: 900; font-size: clamp(14px, 1.2vw, 26px); padding: .55em 1.1em; border-radius: 99px; box-shadow: 0 10px 30px rgba(0,0,0,.4); animation: toast 4.2s ease both; }
	@keyframes toast { 0% { transform: translateX(120%); } 10%, 85% { transform: translateX(0); opacity: 1; } 100% { opacity: 0; transform: translateY(-20px); } }

	/* Controls */
	.controls { position: absolute; z-index: 20; left: 50%; bottom: 2.5vh; transform: translate(-50%, 140%); display: flex; gap: 10px; align-items: center; padding: 10px; border-radius: 18px; background: rgba(14,8,32,.75); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,.12); transition: transform .35s; }
	.controls.visible { transform: translate(-50%, 0); }
	.ctl { font: inherit; font-weight: 900; font-size: 15px; border: 0; border-radius: 12px; padding: 11px 16px; cursor: pointer; text-decoration: none; white-space: nowrap; }
	.ctl.ghost { background: rgba(255,255,255,.12); color: #fff; }
	.ctl.ghost:hover { background: rgba(255,255,255,.2); }
	.ctl.draw { background: linear-gradient(135deg, #ffd166, #F57832); color: #2a1300; font-size: 18px; padding: 12px 22px; box-shadow: 0 5px 0 #b8430f; }
	.ctl.draw:disabled { opacity: .6; }
	.ctl-err { color: #ffb3c0; font-weight: 800; }

	/* Draw overlay */
	.overlay { position: absolute; inset: 0; z-index: 30; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4vh; background: rgba(10,5,24,.82); backdrop-filter: blur(8px); animation: fade .4s ease both; }
	.overlay.revealed { background: radial-gradient(circle at 50% 50%, rgba(80,40,150,.75), rgba(10,5,24,.92)); }
	@keyframes fade { from { opacity: 0; } }
	.drum { font-size: clamp(28px, 3.6vw, 80px); font-weight: 900; color: #FFC93C; animation: shake .5s ease-in-out infinite; text-shadow: 0 0 30px rgba(255,201,60,.5); }
	@keyframes shake { 0%, 100% { transform: rotate(-1.5deg) scale(1); } 50% { transform: rotate(1.5deg) scale(1.04); } }
	.reel-window { position: relative; font-size: clamp(40px, 6vw, 130px); height: 3em; width: min(80vw, 1400px); overflow: hidden; border-radius: 28px; background: linear-gradient(180deg, #2a1650, #1b1033 50%, #2a1650); box-shadow: inset 0 0 40px rgba(0,0,0,.6), 0 30px 80px rgba(0,0,0,.6); }
	.reel { position: absolute; left: 0; right: 0; top: 0; will-change: transform; }
	.reel-row { height: 1em; line-height: 1em; text-align: center; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 .4em; opacity: .4; transform: scale(.82); filter: blur(1px); }
	.reel-row.hit { opacity: 1; transform: scale(1); filter: none; color: #fff; text-shadow: 0 0 24px rgba(245,120,50,.9); }
	.reel-mask { position: absolute; inset: 0; z-index: 2; pointer-events: none; background: linear-gradient(180deg, rgba(27,16,51,.95), transparent 30%, transparent 70%, rgba(27,16,51,.95)); }
	.reel-frame { position: absolute; z-index: 3; left: 0; right: 0; top: 1em; height: 1em; border-top: 4px solid #F57832; border-bottom: 4px solid #F57832; box-shadow: 0 0 30px rgba(245,120,50,.6); pointer-events: none; }
	.rays { position: absolute; width: 220vmax; height: 220vmax; left: 50%; top: 50%; margin: -110vmax 0 0 -110vmax; background: repeating-conic-gradient(rgba(255,201,60,.13) 0 6deg, transparent 6deg 18deg); animation: rays 30s linear infinite; mask-image: radial-gradient(circle, #000 0, transparent 55%); -webkit-mask-image: radial-gradient(circle, #000 0, transparent 55%); }
	@keyframes rays { to { transform: rotate(360deg); } }
	.reveal { position: relative; text-align: center; animation: reveal .9s cubic-bezier(.2,1.6,.4,1) both; }
	.reveal-label { font-size: clamp(22px, 2.6vw, 56px); font-weight: 900; letter-spacing: .2em; color: #FFC93C; margin-bottom: 2vh; }
	.reveal-name { font-size: clamp(56px, 9vw, 200px); font-weight: 900; line-height: .98; background: linear-gradient(180deg, #fff 20%, #ffd166 60%, #F57832); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 8px 40px rgba(245,120,50,.55)); word-break: break-word; max-width: 92vw; }
	.reveal-actions { display: flex; gap: 12px; justify-content: center; margin-top: 5vh; }
	@keyframes reveal { 0% { transform: scale(.2) rotate(-6deg); opacity: 0; } 100% { transform: scale(1) rotate(0); opacity: 1; } }
	@keyframes pop { from { transform: scale(1.5); } to { transform: scale(1); } }
	.confetti { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 40; pointer-events: none; }
</style>
