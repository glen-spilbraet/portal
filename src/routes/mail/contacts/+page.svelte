<script>
  import AppNav from '$lib/components/AppNav.svelte';

  let { data } = $props();

  let contacts = $state(data.contacts);
  let keyAccounts = $state(data.keyAccounts);

  let search = $state('');
  let showAdd = $state(false);
  let newFirstName = $state('');
  let newEmail = $state('');
  let newKeyAccountId = $state('');
  let busy = $state(false);
  let err = $state('');

  let editingId = $state(null);
  let editFirstName = $state('');
  let editEmail = $state('');
  let editKeyAccountId = $state('');

  const filtered = $derived(
    search.trim()
      ? contacts.filter(c =>
          c.first_name.toLowerCase().includes(search.toLowerCase()) ||
          c.email.toLowerCase().includes(search.toLowerCase()) ||
          (c.key_account_name ?? '').toLowerCase().includes(search.toLowerCase())
        )
      : contacts
  );

  function accountName(id) {
    return keyAccounts.find(a => a.id === id)?.name ?? '';
  }

  async function addContact() {
    const fn = newFirstName.trim();
    const em = newEmail.trim();
    if (!fn || !em || busy) return;
    busy = true; err = '';
    try {
      const res = await fetch('/api/mail/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name: fn, email: em, key_account_id: newKeyAccountId || null }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? 'Failed');
      const added = await res.json();
      const ka = keyAccounts.find(a => a.id === added.key_account_id);
      contacts = [...contacts, { ...added, key_account_name: ka?.name ?? null }];
      newFirstName = ''; newEmail = ''; newKeyAccountId = '';
      showAdd = false;
    } catch (e) { err = e.message; }
    busy = false;
  }

  function startEdit(c) {
    editingId = c.id;
    editFirstName = c.first_name;
    editEmail = c.email;
    editKeyAccountId = c.key_account_id ?? '';
  }

  function cancelEdit() {
    editingId = null;
  }

  async function saveEdit(id) {
    if (!editFirstName.trim() || !editEmail.trim() || busy) return;
    busy = true; err = '';
    try {
      const patch = {
        first_name: editFirstName.trim(),
        email: editEmail.trim(),
        key_account_id: editKeyAccountId || null,
      };
      const res = await fetch(`/api/mail/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? 'Failed');
      const ka = keyAccounts.find(a => a.id === patch.key_account_id);
      contacts = contacts.map(c =>
        c.id === id ? { ...c, ...patch, key_account_name: ka?.name ?? null } : c
      );
      editingId = null;
    } catch (e) { err = e.message; }
    busy = false;
  }

  async function removeContact(id) {
    if (!confirm('Delete this contact? This cannot be undone.')) return;
    busy = true; err = '';
    try {
      const res = await fetch(`/api/mail/contacts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).message ?? 'Failed');
      contacts = contacts.filter(c => c.id !== id);
    } catch (e) { err = e.message; }
    busy = false;
  }

  function cancelAdd() {
    showAdd = false;
    newFirstName = ''; newEmail = ''; newKeyAccountId = '';
  }
</script>

<div class="page">
  <AppNav active="mail-contacts" user={data.user} />
  <main>
    <div class="page-header">
      <div>
        <h1 class="page-title">Contacts</h1>
        <p class="page-sub">Manage individual contacts for your mail campaigns.</p>
      </div>
      <button class="btn-primary" onclick={() => { showAdd = true; }} disabled={showAdd}>
        + New Contact
      </button>
    </div>

    {#if err}
      <div class="error-banner">{err}</div>
    {/if}

    <div class="card">
      <!-- Toolbar -->
      <div class="toolbar">
        <div class="search-wrap">
          <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input class="search-input" type="search" placeholder="Search contacts…" bind:value={search} />
        </div>
        <span class="count">{filtered.length} contact{filtered.length === 1 ? '' : 's'}</span>
      </div>

      <!-- Add form -->
      {#if showAdd}
        <div class="add-form">
          <div class="add-form-fields">
            <input class="input" type="text" placeholder="First name" bind:value={newFirstName} disabled={busy} />
            <input class="input" type="email" placeholder="Email address" bind:value={newEmail} disabled={busy} />
            <select class="input select" bind:value={newKeyAccountId} disabled={busy}>
              <option value="">No company</option>
              {#each keyAccounts as ka}
                <option value={ka.id}>{ka.name}</option>
              {/each}
            </select>
          </div>
          <div class="add-form-actions">
            <button class="btn-primary" onclick={addContact} disabled={busy || !newFirstName.trim() || !newEmail.trim()}>Add Contact</button>
            <button class="btn-ghost" onclick={cancelAdd} disabled={busy}>Cancel</button>
          </div>
        </div>
      {/if}

      {#if contacts.length === 0 && !showAdd}
        <div class="empty-state">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <p>No contacts yet. Click "+ New Contact" to add your first.</p>
        </div>
      {:else if filtered.length === 0 && contacts.length > 0}
        <div class="empty-state">
          <p>No contacts match your search.</p>
        </div>
      {:else if filtered.length > 0}
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Company</th>
              <th class="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each filtered as contact (contact.id)}
              {#if editingId === contact.id}
                <tr class="edit-row">
                  <td>
                    <input class="input input-inline" type="text" bind:value={editFirstName} disabled={busy} autofocus />
                  </td>
                  <td>
                    <input class="input input-inline" type="email" bind:value={editEmail} disabled={busy} />
                  </td>
                  <td>
                    <select class="input input-inline select" bind:value={editKeyAccountId} disabled={busy}>
                      <option value="">No company</option>
                      {#each keyAccounts as ka}
                        <option value={ka.id}>{ka.name}</option>
                      {/each}
                    </select>
                  </td>
                  <td class="col-actions">
                    <div class="action-group">
                      <button class="btn-sm btn-primary" onclick={() => saveEdit(contact.id)} disabled={busy || !editFirstName.trim() || !editEmail.trim()}>Save</button>
                      <button class="btn-sm btn-ghost" onclick={cancelEdit} disabled={busy}>Cancel</button>
                    </div>
                  </td>
                </tr>
              {:else}
                <tr>
                  <td class="cell-name">{contact.first_name}</td>
                  <td class="cell-email">{contact.email}</td>
                  <td>
                    {#if contact.key_account_name}
                      <span class="company-badge">{contact.key_account_name}</span>
                    {:else}
                      <span class="cell-none">—</span>
                    {/if}
                  </td>
                  <td class="col-actions">
                    <div class="action-group">
                      <button class="btn-sm btn-ghost" onclick={() => startEdit(contact)} disabled={busy}>Edit</button>
                      <button class="btn-sm btn-danger" onclick={() => removeContact(contact.id)} disabled={busy}>Delete</button>
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </main>
</div>

<style>
  .page { min-height: 100vh; background: #FAFAF9; }

  main {
    max-width: 1140px;
    margin: 0 auto;
    padding: 32px 28px 80px;
  }

  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 28px;
    gap: 16px;
  }

  .page-title {
    font-size: 22px;
    font-weight: 800;
    color: #18181B;
    margin: 0 0 4px;
    letter-spacing: -0.4px;
  }

  .page-sub {
    font-size: 13px;
    color: #71717A;
    margin: 0;
  }

  .error-banner {
    background: #FEF2F2;
    border: 1px solid #fecaca;
    border-radius: var(--radius-lg, 12px);
    padding: 12px 16px;
    font-size: 13px;
    color: #dc2626;
    margin-bottom: 16px;
  }

  .card {
    background: white;
    border: 1px solid var(--border, #E4E4E7);
    border-radius: var(--radius-lg, 12px);
    box-shadow: var(--shadow, 0 1px 3px rgba(0,0,0,0.06));
    overflow: hidden;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 20px;
    border-bottom: 1px solid var(--border, #E4E4E7);
  }

  .search-wrap {
    position: relative;
    flex: 1;
    max-width: 320px;
  }

  .search-icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: #A1A1AA;
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    height: 34px;
    padding: 0 12px 0 32px;
    border: 1px solid var(--border, #E4E4E7);
    border-radius: var(--radius, 8px);
    font-size: 13px;
    font-family: inherit;
    color: #18181B;
    background: #FAFAF9;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  }
  .search-input:focus {
    background: white;
    border-color: #F57832;
    box-shadow: 0 0 0 3px rgba(245, 120, 50, 0.12);
  }

  .count {
    font-size: 12px;
    color: #A1A1AA;
    white-space: nowrap;
    margin-left: auto;
  }

  .add-form {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border, #E4E4E7);
    background: #FAFAF9;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .add-form-fields {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .add-form-actions {
    display: flex;
    gap: 8px;
  }

  .input {
    height: 36px;
    padding: 0 12px;
    border: 1px solid var(--border, #E4E4E7);
    border-radius: var(--radius, 8px);
    font-size: 13px;
    font-family: inherit;
    color: #18181B;
    background: white;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
    min-width: 0;
  }
  .input:focus {
    border-color: #F57832;
    box-shadow: 0 0 0 3px rgba(245, 120, 50, 0.12);
  }

  .add-form-fields .input { flex: 1; min-width: 160px; }

  .input-inline { width: 100%; }

  .select { cursor: pointer; }

  .btn-primary {
    height: 36px;
    padding: 0 16px;
    background: #F57832;
    color: white;
    border: none;
    border-radius: var(--radius, 8px);
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: opacity 0.15s;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .btn-primary:hover:not(:disabled) { opacity: 0.88; }
  .btn-primary:disabled { opacity: 0.45; cursor: default; }

  .btn-ghost {
    height: 36px;
    padding: 0 14px;
    background: white;
    color: #52525B;
    border: 1px solid var(--border, #E4E4E7);
    border-radius: var(--radius, 8px);
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .btn-ghost:hover:not(:disabled) { background: #F4F4F5; color: #18181B; }
  .btn-ghost:disabled { opacity: 0.45; cursor: default; }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 56px 24px;
    color: #A1A1AA;
    text-align: center;
  }
  .empty-state p { font-size: 13px; margin: 0; }

  .table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .table th {
    padding: 10px 20px;
    text-align: left;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #A1A1AA;
    border-bottom: 1px solid var(--border, #E4E4E7);
    background: #FAFAF9;
  }

  .table td {
    padding: 13px 20px;
    border-bottom: 1px solid var(--border, #E4E4E7);
    color: #18181B;
    vertical-align: middle;
  }

  .table tbody tr:last-child td { border-bottom: none; }
  .table tbody tr:hover:not(.edit-row) { background: #FAFAF9; }
  .edit-row { background: #FFFBF5; }

  .col-actions { width: 160px; }

  .cell-name { font-weight: 600; }
  .cell-email { color: #52525B; }
  .cell-none { color: #D1D5DB; }

  .company-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    background: #FFF5D2;
    color: #7B3803;
    border-radius: 100px;
    font-size: 11px;
    font-weight: 600;
  }

  .action-group {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .btn-sm {
    height: 30px;
    padding: 0 12px;
    border-radius: var(--radius, 8px);
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, opacity 0.12s;
    border: 1px solid transparent;
    white-space: nowrap;
  }
  .btn-sm:disabled { opacity: 0.45; cursor: default; }

  .btn-sm.btn-primary {
    background: #F57832;
    color: white;
    border-color: #F57832;
  }

  .btn-sm.btn-ghost {
    background: white;
    color: #52525B;
    border-color: var(--border, #E4E4E7);
  }
  .btn-sm.btn-ghost:hover:not(:disabled) { background: #F4F4F5; color: #18181B; }

  .btn-sm.btn-danger {
    background: white;
    color: var(--danger, #dc2626);
    border-color: var(--border, #E4E4E7);
  }
  .btn-sm.btn-danger:hover:not(:disabled) { background: #FEF2F2; border-color: #fecaca; }
</style>
