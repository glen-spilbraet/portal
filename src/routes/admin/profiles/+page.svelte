<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { squareJpeg } from '$lib/profilePhoto.js';

	let { data } = $props();

	/** @typedef {{ email: string, role: string, name: string | null, first_name: string | null, department: string | null, phone: string | null, job_title: string | null, photo_key: string | null, profile_updated_at: string | null }} Profile */

	/** @type {Profile[]} */
	let rows = $state([]);
	$effect.pre(() => { rows = data.profiles.map((/** @type {Profile} */ p) => ({ ...p })); });

	/** Per-row save state, keyed by email. @type {Record<string, 'saving' | 'saved' | 'uploading' | string>} */
	let status = $state({});

	let q = $state('');
	/** @type {'all' | 'photo' | 'title' | 'phone'} */
	let missing = $state('all');
	/** @type {'name' | 'department' | 'updated'} */
	let sortBy = $state('name');
	let sortDir = $state(1);

	const nameOf = (/** @type {Profile} */ p) => p.name || p.first_name || '';
	const counts = $derived({
		all: rows.length,
		photo: rows.filter((r) => !r.photo_key).length,
		title: rows.filter((r) => !r.job_title).length,
		phone: rows.filter((r) => !r.phone).length,
	});

	const shown = $derived.by(() => {
		const needle = q.trim().toLowerCase();
		const list = rows.filter((r) => {
			if (missing === 'photo' && r.photo_key) return false;
			if (missing === 'title' && r.job_title) return false;
			if (missing === 'phone' && r.phone) return false;
			if (!needle) return true;
			return [nameOf(r), r.email, r.department, r.job_title, r.phone].some((v) => (v ?? '').toLowerCase().includes(needle));
		});
		/** @param {Profile} r */
		const key = (r) => sortBy === 'department' ? (r.department ?? '~') : sortBy === 'updated' ? (r.profile_updated_at ?? '') : (nameOf(r) || r.email);
		return list.sort((a, b) => key(a).localeCompare(key(b), 'da', { sensitivity: 'base' }) * sortDir);
	});

	/** @param {'name' | 'department' | 'updated'} col */
	function sort(col) {
		if (sortBy === col) sortDir = -sortDir;
		else { sortBy = col; sortDir = col === 'updated' ? -1 : 1; }
	}

	/** Remember the value a cell had when focused, so blur only saves real changes. */
	let before = '';

	/** @param {Profile} r @param {'name' | 'job_title' | 'phone'} field @param {string} value */
	async function saveField(r, field, value) {
		if (value.trim() === before.trim()) return;
		if (field === 'phone' && value.trim() && value.replace(/\D/g, '').length < 6) { status[r.email] = 'Not a valid phone number'; return; }
		status[r.email] = 'saving';
		try {
			const body = { email: r.email, phone: r.phone ?? '', job_title: r.job_title ?? '', [field]: value };
			const res = await fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
			if (!res.ok) throw new Error((await res.text()) || 'Could not save');
			const out = await res.json();
			r.phone = out.phone || null;
			r.job_title = out.job_title || null;
			if (out.name !== undefined) r.name = out.name || null;
			r.profile_updated_at = new Date().toISOString();
			flashSaved(r.email);
		} catch (e) {
			status[r.email] = e instanceof Error ? e.message : String(e);
		}
	}

	/** @param {string} email */
	function flashSaved(email) {
		status[email] = 'saved';
		setTimeout(() => { if (status[email] === 'saved') delete status[email]; }, 1800);
	}

	/** @param {KeyboardEvent & { currentTarget: HTMLInputElement }} e */
	function cellKey(e) {
		if (e.key === 'Enter') e.currentTarget.blur();
		if (e.key === 'Escape') { e.currentTarget.value = before; e.currentTarget.blur(); }
	}

	/** @type {HTMLInputElement | undefined} */
	let fileInput = $state();
	/** @type {Profile | null} */
	let uploadFor = null;

	/** @param {Profile} r */
	function pickPhoto(r) { uploadFor = r; fileInput?.click(); }

	/** @param {Event & { currentTarget: HTMLInputElement }} e */
	async function upload(e) {
		const input = e.currentTarget;
		const file = input.files?.[0];
		input.value = '';
		const r = uploadFor;
		if (!file || !r) return;
		status[r.email] = 'uploading';
		try {
			const form = new FormData();
			form.append('file', await squareJpeg(file), 'photo.jpg');
			form.append('email', r.email);
			const res = await fetch('/api/profile/photo', { method: 'POST', body: form });
			if (!res.ok) throw new Error((await res.text()) || 'Upload failed');
			r.photo_key = (await res.json()).key;
			r.profile_updated_at = new Date().toISOString();
			flashSaved(r.email);
		} catch (err) {
			status[r.email] = err instanceof Error ? err.message : String(err);
		}
	}

	/** @param {Profile} r */
	async function removePhoto(r) {
		if (!confirm(`Remove ${nameOf(r) || r.email}'s photo?`)) return;
		status[r.email] = 'uploading';
		try {
			const res = await fetch(`/api/profile/photo?email=${encodeURIComponent(r.email)}`, { method: 'DELETE' });
			if (!res.ok) throw new Error((await res.text()) || 'Could not remove');
			r.photo_key = null;
			flashSaved(r.email);
		} catch (err) {
			status[r.email] = err instanceof Error ? err.message : String(err);
		}
	}

	/** @param {string | null} iso */
	function when(iso) {
		if (!iso) return '—';
		const d = new Date(iso);
		const days = Math.floor((Date.now() - d.getTime()) / 86400000);
		if (days < 1) return 'Today';
		if (days < 2) return 'Yesterday';
		if (days < 30) return `${days} days ago`;
		return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	/** @param {Profile} r */
	const complete = (r) => [r.photo_key, r.job_title, r.phone].filter(Boolean).length;
</script>

<svelte:head><title>Profiles · Admin</title></svelte:head>

<AppNav active="admin" user={data.user} />

<input bind:this={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onchange={upload} hidden />

<main class="wrap">
	<div class="head">
		<a class="back" href="/admin">Admin</a>
		<h1>Profiles</h1>
	</div>

	<div class="bar">
		<div class="search">
			<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
			<input bind:value={q} placeholder="Search name, email, title, phone…" />
		</div>
		<div class="chips">
			<button class:on={missing === 'all'} onclick={() => (missing = 'all')}>All <b>{counts.all}</b></button>
			<button class:on={missing === 'photo'} onclick={() => (missing = 'photo')}>No photo <b>{counts.photo}</b></button>
			<button class:on={missing === 'title'} onclick={() => (missing = 'title')}>No title <b>{counts.title}</b></button>
			<button class:on={missing === 'phone'} onclick={() => (missing = 'phone')}>No phone <b>{counts.phone}</b></button>
		</div>
	</div>

	<div class="table">
		<div class="tr th">
			<span></span>
			<button class="sortable" onclick={() => sort('name')}>Name {#if sortBy === 'name'}<i>{sortDir > 0 ? '↑' : '↓'}</i>{/if}</button>
			<span>Title</span>
			<span>Phone</span>
			<button class="sortable" onclick={() => sort('department')}>Department {#if sortBy === 'department'}<i>{sortDir > 0 ? '↑' : '↓'}</i>{/if}</button>
			<button class="sortable" onclick={() => sort('updated')}>Updated {#if sortBy === 'updated'}<i>{sortDir > 0 ? '↑' : '↓'}</i>{/if}</button>
			<span></span>
		</div>

		{#each shown as r (r.email)}
			{@const st = status[r.email]}
			<div class="tr">
				<div class="photo-cell">
					<button class="avatar" onclick={() => pickPhoto(r)} disabled={st === 'uploading'} title={r.photo_key ? 'Change photo' : 'Upload photo'}>
						{#if r.photo_key}<img src={`/api/img/${r.photo_key}`} alt="" loading="lazy" />{:else}<span class="initial">{(nameOf(r) || r.email)[0]?.toUpperCase()}</span>{/if}
						<span class="cam" class:busy={st === 'uploading'}>
							{#if st === 'uploading'}<span class="spin"></span>{:else}
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
							{/if}
						</span>
					</button>
				</div>

				<div class="name-cell">
					<input class="cell strong" value={nameOf(r)} placeholder="Name" maxlength="80"
						onfocus={(e) => (before = e.currentTarget.value)} onkeydown={cellKey}
						onblur={(e) => saveField(r, 'name', e.currentTarget.value)} />
					<span class="email">{r.email}{#if r.role === 'admin'}<em>admin</em>{/if}</span>
				</div>

				<input class="cell" value={r.job_title ?? ''} placeholder="—" maxlength="60"
					onfocus={(e) => (before = e.currentTarget.value)} onkeydown={cellKey}
					onblur={(e) => saveField(r, 'job_title', e.currentTarget.value)} />

				<input class="cell mono" type="tel" value={r.phone ?? ''} placeholder="—" maxlength="24"
					onfocus={(e) => (before = e.currentTarget.value)} onkeydown={cellKey}
					onblur={(e) => saveField(r, 'phone', e.currentTarget.value)} />

				<span class="dept">{#if r.department}<span class="pill">{r.department}</span>{:else}<span class="muted">—</span>{/if}</span>

				<span class="upd">
					<span class="dots" title={`${complete(r)} of 3 filled (photo, title, phone)`}>
						{#each [r.photo_key, r.job_title, r.phone] as f}<i class:f={!!f}></i>{/each}
					</span>
					{when(r.profile_updated_at)}
				</span>

				<div class="acts">
					{#if st === 'saving'}<span class="state">Saving…</span>
					{:else if st === 'saved'}<span class="state ok">✓ Saved</span>
					{:else if st && st !== 'uploading'}<span class="state bad" title={st}>{st}</span>{/if}
					{#if r.photo_key}
						<button class="icon" onclick={() => removePhoto(r)} title="Remove photo" aria-label="Remove photo">
							<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
						</button>
					{/if}
					<a class="icon" href={`/profile?email=${encodeURIComponent(r.email)}`} title="Open profile" aria-label="Open profile">
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
					</a>
				</div>
			</div>
		{:else}
			<div class="empty">No profiles match.</div>
		{/each}
	</div>
</main>

<style>
	.wrap { max-width: 1200px; margin: 0 auto; padding: 24px 28px 64px; }
	.head { margin-bottom: 18px; }
	.back { font-size: 12px; font-weight: 700; color: #B15A12; text-decoration: none; }
	.back::before { content: '‹ '; }
	h1 { font-size: 22px; font-weight: 800; color: #18181B; margin: 2px 0 0; letter-spacing: -0.3px; }

	.bar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
	.search { flex: 1; min-width: 240px; display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 0 12px; color: #A1A1AA; }
	.search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(245, 120, 50, 0.1); }
	.search input { flex: 1; border: 0; outline: 0; background: none; font: inherit; font-size: 14px; padding: 9px 0; color: #18181B; }
	.chips { display: flex; gap: 6px; flex-wrap: wrap; }
	.chips button { border: 1px solid var(--border); background: #fff; border-radius: 999px; padding: 6px 12px; font: inherit; font-size: 12.5px; font-weight: 600; color: #52525B; cursor: pointer; }
	.chips button b { margin-left: 4px; color: #A1A1AA; font-weight: 700; }
	.chips button.on { background: #18181B; border-color: #18181B; color: #fff; }
	.chips button.on b { color: #F4CE7A; }

	.table { background: #fff; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
	.tr { display: grid; grid-template-columns: 64px minmax(200px, 1.6fr) minmax(140px, 1.2fr) minmax(140px, 1fr) 130px 140px 96px; align-items: center; gap: 10px; padding: 8px 14px; border-top: 1px solid #F4EBD3; }
	.tr:not(.th):hover { background: #FFFBF2; }
	.th { border-top: 0; background: #FFF8E8; padding-top: 10px; padding-bottom: 10px; }
	.th, .th button { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #98876e; }
	.sortable { all: unset; cursor: pointer; }
	.sortable:hover { color: #B15A12; }
	.sortable i { font-style: normal; color: var(--accent); }

	.avatar { all: unset; cursor: pointer; position: relative; display: grid; place-items: center; width: 46px; height: 46px; border-radius: 50%; overflow: hidden; background: #F4F4F5; box-shadow: 0 0 0 2px #fff, 0 0 0 3px #F4EBD3; }
	.avatar img { width: 100%; height: 100%; object-fit: cover; }
	.initial { font-size: 18px; font-weight: 800; color: #A1A1AA; }
	.cam { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(24, 24, 27, 0.55); color: #fff; opacity: 0; transition: opacity 0.15s; }
	.avatar:hover .cam, .avatar:focus-visible .cam, .cam.busy { opacity: 1; }
	.spin { width: 16px; height: 16px; border: 2px solid rgba(255, 255, 255, 0.4); border-top-color: #fff; border-radius: 50%; animation: spin 0.8s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }

	.cell { width: 100%; box-sizing: border-box; font: inherit; font-size: 13.5px; color: #27272A; border: 1px solid transparent; background: transparent; border-radius: 8px; padding: 6px 8px; margin-left: -8px; transition: background 0.12s, border-color 0.12s; }
	.cell::placeholder { color: #D4D4D8; }
	.cell:hover { background: #F7F2E6; }
	.cell:focus { outline: 0; background: #fff; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(245, 120, 50, 0.1); }
	.cell.strong { font-weight: 700; color: #18181B; font-size: 14px; }
	.cell.mono { font-variant-numeric: tabular-nums; }
	.name-cell { min-width: 0; }
	.email { display: block; font-size: 12px; color: #A1A1AA; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.email em { font-style: normal; margin-left: 6px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; color: #B15A12; background: #FFF1D6; padding: 1px 6px; border-radius: 999px; }

	.pill { display: inline-block; font-size: 12px; font-weight: 600; color: #52525B; background: #F4F4F5; padding: 3px 9px; border-radius: 999px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
	.muted { color: #D4D4D8; }
	.upd { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: #71717A; white-space: nowrap; }
	.dots { display: inline-flex; gap: 3px; }
	.dots i { width: 6px; height: 6px; border-radius: 50%; background: #E4E4E7; }
	.dots i.f { background: #2BA36A; }

	.acts { display: flex; align-items: center; justify-content: flex-end; gap: 4px; min-width: 0; }
	.state { font-size: 12px; font-weight: 700; color: #A1A1AA; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.state.ok { color: #148246; }
	.state.bad { color: #c23b26; }
	.icon { all: unset; cursor: pointer; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; color: #A1A1AA; flex: none; }
	.icon:hover { background: #F4F4F5; color: #18181B; }
	.tr:not(:hover) .acts button.icon { opacity: 0; }

	.empty { padding: 40px; text-align: center; color: #A1A1AA; font-size: 14px; border-top: 1px solid #F4EBD3; }

	@media (max-width: 900px) {
		.th { display: none; }
		.tr { grid-template-columns: 56px 1fr 1fr; grid-auto-rows: auto; }
		.name-cell { grid-column: 2 / 4; }
		.dept, .upd { display: none; }
		.acts { grid-column: 1 / -1; }
		.tr:not(:hover) .acts button.icon { opacity: 1; }
	}
</style>
