<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();
	const p = $derived(data.profile);
	const displayName = $derived(p.name || p.first_name || p.email);

	let phone = $state('');
	let title = $state('');
	$effect.pre(() => { phone = p.phone ?? ''; title = p.job_title ?? ''; });

	let saving = $state(false);
	let saved = $state(false);
	let uploading = $state(false);
	let problem = $state('');
	/** @type {HTMLInputElement | undefined} */
	let fileInput = $state();

	/** Admins editing someone else send the email along. */
	const who = $derived(data.own ? {} : { email: p.email });

	async function save() {
		saving = true; saved = false; problem = '';
		try {
			const res = await fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...who, phone, job_title: title }) });
			if (!res.ok) throw new Error((await res.text()) || 'Could not save');
			const out = await res.json();
			phone = out.phone; title = out.job_title;
			saved = true;
			await invalidateAll();
		} catch (e) { problem = e instanceof Error ? e.message : String(e); } finally { saving = false; }
	}

	/** Centre-crop to a square and scale to 600 px, as JPEG: small, and the same shape everywhere. */
	/** @param {Blob} file @returns {Promise<Blob>} */
	async function squareJpeg(file) {
		const img = await createImageBitmap(file);
		const side = Math.min(img.width, img.height);
		const size = Math.min(600, side);
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = size;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Could not read the image');
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, size, size);
		ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
		return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read the image'))), 'image/jpeg', 0.88));
	}

	/** @param {Event & { currentTarget: HTMLInputElement }} e */
	async function upload(e) {
		const input = e.currentTarget;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		uploading = true; problem = '';
		try {
			const form = new FormData();
			form.append('file', await squareJpeg(file), 'photo.jpg');
			if (!data.own) form.append('email', p.email);
			const res = await fetch('/api/profile/photo', { method: 'POST', body: form });
			if (!res.ok) throw new Error((await res.text()) || 'Upload failed');
			await invalidateAll();
		} catch (err) { problem = err instanceof Error ? err.message : String(err); } finally { uploading = false; }
	}

	async function removePhoto() {
		if (!confirm('Remove the photo?')) return;
		uploading = true;
		try {
			await fetch(`/api/profile/photo${data.own ? '' : `?email=${encodeURIComponent(p.email)}`}`, { method: 'DELETE' });
			await invalidateAll();
		} finally { uploading = false; }
	}
</script>

<svelte:head><title>{data.own ? 'My profile' : displayName} — Portal</title></svelte:head>

<AppNav user={data.user} />
<main class="wrap">
	<h1>{data.own ? 'My profile' : displayName}</h1>

	<section class="card">
		<div class="photo-row">
			<div class="avatar">
				{#if p.photo_key}<img src={`/api/img/${p.photo_key}`} alt="" />{:else}<span>{displayName[0]?.toUpperCase()}</span>{/if}
			</div>
			<div class="photo-actions">
				<input bind:this={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onchange={upload} hidden />
				<button class="btn primary" onclick={() => fileInput?.click()} disabled={uploading}>{uploading ? 'Uploading…' : p.photo_key ? 'Change photo' : 'Upload photo'}</button>
				{#if p.photo_key}<button class="btn" onclick={removePhoto} disabled={uploading}>Remove</button>{/if}
				<small>A clear head-and-shoulders photo works best; it is cropped to a square.</small>
			</div>
		</div>

		<div class="fields">
			<label>Name<input class="in" value={p.name || p.first_name || ''} disabled /></label>
			<label>Email<input class="in" value={p.email} disabled /></label>
			<label>Title <span class="opt">optional</span><input class="in" bind:value={title} maxlength="60" placeholder="Key Account Manager" /></label>
			<label>Phone<input class="in" bind:value={phone} type="tel" maxlength="24" placeholder="+45 12 34 56 78" /></label>
		</div>

		<div class="foot">
			<button class="btn primary" onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
			{#if saved}<span class="ok">Saved</span>{/if}
			{#if problem}<span class="bad">{problem}</span>{/if}
		</div>
	</section>
</main>

<style>
	.wrap { max-width: 640px; margin: 0 auto; padding: 32px 28px 80px; }
	h1 { font-size: 20px; font-weight: 800; margin: 0 0 18px; }
	.card { background: #fff; border: 1px solid var(--border); border-radius: 14px; padding: 20px; display: grid; gap: 20px; }
	.photo-row { display: flex; gap: 18px; align-items: center; }
	.avatar { flex: none; width: 96px; height: 96px; border-radius: 50%; overflow: hidden; background: #F4F4F5; display: grid; place-items: center; }
	.avatar img { width: 100%; height: 100%; object-fit: cover; }
	.avatar span { font-size: 36px; font-weight: 800; color: #A1A1AA; }
	.photo-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
	.photo-actions small { flex-basis: 100%; color: #A1A1AA; font-size: 12px; }
	.fields { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
	label { display: block; font-size: 12px; font-weight: 700; color: #52525B; }
	.opt { font-weight: 500; color: #A1A1AA; margin-left: 4px; }
	.in { width: 100%; margin-top: 5px; font-family: inherit; font-size: 14px; border: 1px solid var(--border); border-radius: 9px; padding: 9px 12px; background: #fff; }
	.in:disabled { background: #FAFAFA; color: #71717A; }
	.btn { padding: 8px 14px; border: 1px solid var(--border); border-radius: 9px; background: #fff; font-size: 13px; font-weight: 600; color: #18181B; cursor: pointer; font-family: inherit; }
	.btn.primary { background: #F57832; color: #fff; border-color: #F57832; }
	.btn:disabled { opacity: 0.6; }
	.foot { display: flex; align-items: center; gap: 12px; }
	.ok { color: #148246; font-weight: 700; font-size: 13px; }
	.bad { color: #c23b26; font-weight: 700; font-size: 13px; }
	@media (max-width: 560px) { .fields { grid-template-columns: 1fr; } }
</style>
