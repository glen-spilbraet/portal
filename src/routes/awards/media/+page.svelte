<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	let open = $state(false);
	let editingId = $state(null);
	let saving = $state(false);
	let form = $state(blank());
	function blank() { return { name: '', country: '', review_scale: '', notes: '', contacts: [] }; }

	function openNew() { editingId = null; form = blank(); open = true; }
	async function openEdit(id) {
		editingId = id; open = true; form = blank();
		const m = await (await fetch(`/api/awards/media/${id}`)).json();
		form = { name: m.name ?? '', country: m.country ?? '', review_scale: m.review_scale ?? '', notes: m.notes ?? '', contacts: m.contacts?.map((c) => ({ name: c.name ?? '', email: c.email ?? '', phone: c.phone ?? '', role: c.role ?? '' })) ?? [] };
	}
	function close() { open = false; }
	function addContact() { form.contacts = [...form.contacts, { name: '', email: '', phone: '', role: '' }]; }
	function removeContact(i) { form.contacts = form.contacts.filter((_, x) => x !== i); }

	async function save() {
		if (!form.name.trim() || saving) return;
		saving = true;
		try {
			const url = editingId ? `/api/awards/media/${editingId}` : '/api/awards/media';
			const res = await fetch(url, { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
			if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? 'Failed');
			open = false;
			await invalidateAll();
		} catch (e) { alert(e.message); } finally { saving = false; }
	}

	async function del(id, name) {
		if (!confirm(`Delete "${name}"?\n\nThis also deletes all its press instances and statements.`)) return;
		await fetch(`/api/awards/media/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}
</script>

<svelte:head><title>Media · Awards & Press · Product Portal</title></svelte:head>

<AppNav active="awards" user={data.user} />

<main class="wrap">
	<div class="head">
		<h1><a class="crumb" href="/awards">Awards &amp; Press</a><span class="sep">›</span>Media</h1>
		<button class="btn primary" onclick={openNew}>+ New media</button>
	</div>

	{#if data.media.length}
		<div class="table-card">
			<table>
				<thead><tr><th>Media</th><th>Country</th><th class="num">Review scale</th><th class="num">Contacts</th><th class="num">Instances</th><th></th></tr></thead>
				<tbody>
					{#each data.media as m (m.id)}
						<tr>
							<td class="lbl">{m.name}</td>
							<td class="muted">{m.country || '—'}</td>
							<td class="num">{m.review_scale ? `${m.review_scale}★` : '—'}</td>
							<td class="num">{m.contact_count}</td>
							<td class="num">{m.instance_count}</td>
							<td class="actions">
								<button class="link" onclick={() => openEdit(m.id)}>Edit</button>
								<button class="link danger" onclick={() => del(m.id, m.name)}>Delete</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<div class="empty">No media yet. Add the outlets that nominate for awards or give press.</div>
	{/if}
</main>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="backdrop" onclick={close}></div>
	<div class="modal">
		<div class="modal-head"><h2>{editingId ? 'Edit media' : 'New media'}</h2><button class="x" onclick={close}>✕</button></div>
		<div class="modal-body">
			<label class="fld"><span>Name *</span><input bind:value={form.name} placeholder="e.g. Guldbrikken" /></label>
			<div class="row2">
				<label class="fld"><span>Country</span><input bind:value={form.country} placeholder="e.g. Denmark" /></label>
				<label class="fld"><span>Review scale (max stars)</span>
					<select bind:value={form.review_scale}>
						<option value="">None</option>
						<option value="5">5</option>
						<option value="6">6</option>
						<option value="10">10</option>
					</select>
				</label>
			</div>

			<div class="sub-head"><span>Contacts</span><button class="link" onclick={addContact}>+ Add contact</button></div>
			{#each form.contacts as c, i (i)}
				<div class="contact-row">
					<input bind:value={c.name} placeholder="Name" />
					<input bind:value={c.email} placeholder="Email" />
					<input bind:value={c.phone} placeholder="Phone" />
					<input bind:value={c.role} placeholder="Role" />
					<button class="x sm" onclick={() => removeContact(i)}>✕</button>
				</div>
			{/each}

			<label class="fld"><span>Notes</span><textarea bind:value={form.notes} rows="2"></textarea></label>
		</div>
		<div class="modal-foot">
			<button class="btn" onclick={close}>Cancel</button>
			<button class="btn primary" onclick={save} disabled={saving || !form.name.trim()}>{saving ? 'Saving…' : 'Save'}</button>
		</div>
	</div>
{/if}

<style>
	.wrap { max-width: 1040px; margin: 0 auto; padding: 22px 28px 64px; }
	.head { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 18px; }
	.head h1 { font-size: 18px; font-weight: 800; color: #18181B; margin: 0; display: flex; align-items: center; }
	.crumb { color: #B15A12; text-decoration: none; } .crumb:hover { text-decoration: underline; }
	.sep { color: #C0AC7C; margin: 0 8px; }
	.btn { font-family: inherit; font-size: 13px; font-weight: 700; padding: 9px 15px; border-radius: 9px; border: 1px solid var(--border); background: #fff; color: #524431; cursor: pointer; }
	.btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
	.btn:disabled { opacity: 0.6; cursor: default; }

	.table-card { background: #fff; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
	table { width: 100%; border-collapse: collapse; font-size: 13px; }
	th { text-align: left; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; color: #A88B52; padding: 10px 16px; background: #FBF7EF; border-bottom: 1px solid var(--border); }
	th.num { text-align: right; }
	td { padding: 11px 16px; border-bottom: 1px solid #F1EADB; }
	tbody tr:last-child td { border-bottom: none; }
	.lbl { font-weight: 700; color: #18181B; }
	.muted { color: #98876e; }
	td.num { text-align: right; font-variant-numeric: tabular-nums; color: #6b5e4e; }
	.actions { text-align: right; white-space: nowrap; }
	.link { background: none; border: none; font-family: inherit; font-size: 13px; font-weight: 700; color: #B15A12; cursor: pointer; padding: 0 0 0 12px; }
	.link:hover { text-decoration: underline; } .link.danger { color: #C4381B; }
	.empty { padding: 40px; text-align: center; color: #98876e; background: #fff; border: 1px solid var(--border); border-radius: 14px; }

	.backdrop { position: fixed; inset: 0; background: rgba(40,25,0,0.35); z-index: 300; }
	.modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); z-index: 310; width: min(640px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow-y: auto; background: #fff; border-radius: 16px; box-shadow: 0 20px 60px rgba(50,30,0,0.28); }
	.modal-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); }
	.modal-head h2 { font-size: 15px; font-weight: 800; margin: 0; color: #18181B; }
	.x { background: none; border: none; font-size: 15px; color: #8A7550; cursor: pointer; } .x.sm { font-size: 12px; }
	.modal-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
	.modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 20px; border-top: 1px solid var(--border); }
	.fld { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 700; color: #6b5e4e; }
	.fld input, .fld select, .fld textarea { font-family: inherit; font-size: 13px; font-weight: 500; color: #18181B; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; }
	.fld input:focus, .fld select:focus, .fld textarea:focus { outline: none; border-color: var(--accent); }
	.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	.sub-head { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; color: #A88B52; margin-top: 4px; }
	.contact-row { display: grid; grid-template-columns: 1fr 1fr 0.8fr 0.8fr auto; gap: 6px; align-items: center; }
	.contact-row input { font-family: inherit; font-size: 12px; border: 1px solid var(--border); border-radius: 7px; padding: 6px 8px; }
</style>
