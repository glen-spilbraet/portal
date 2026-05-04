<script>
  import AppNav from '$lib/components/AppNav.svelte';

  let { data } = $props();

  const LANGUAGES = [
    { code: 'en', label: 'English' },
    { code: 'da', label: 'Dansk' },
    { code: 'sv', label: 'Svenska' },
    { code: 'no', label: 'Norsk' },
  ];

  let accounts = $state(data.accounts);
  let newName = $state('');
  let newLanguage = $state('en');
  let busy = $state(false);
  let err = $state('');
  let editingId = $state(null);
  let editName = $state('');

  async function addAccount() {
    const name = newName.trim();
    if (!name || busy) return;
    busy = true; err = '';
    try {
      const res = await fetch('/api/mail/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, language: newLanguage }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? 'Failed');
      const added = await res.json();
      accounts = [...accounts, { ...added, language: newLanguage }];
      newName = '';
      newLanguage = 'en';
    } catch (e) { err = e.message; }
    busy = false;
  }

  function startEdit(account) {
    editingId = account.id;
    editName = account.name;
  }

  function cancelEdit() {
    editingId = null;
    editName = '';
  }

  async function saveEdit(id) {
    const name = editName.trim();
    if (!name || busy) return;
    busy = true; err = '';
    try {
      const res = await fetch(`/api/mail/accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? 'Failed');
      accounts = accounts.map(a => a.id === id ? { ...a, name } : a);
      editingId = null;
    } catch (e) { err = e.message; }
    busy = false;
  }

  async function saveLanguage(id, language) {
    accounts = accounts.map(a => a.id === id ? { ...a, language } : a);
    await fetch(`/api/mail/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language }),
    });
  }

  async function removeAccount(id) {
    if (!confirm('Delete this key account? This cannot be undone.')) return;
    busy = true; err = '';
    try {
      const res = await fetch(`/api/mail/accounts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).message ?? 'Failed');
      accounts = accounts.filter(a => a.id !== id);
    } catch (e) { err = e.message; }
    busy = false;
  }

  function handleEditKeydown(e, id) {
    if (e.key === 'Enter') saveEdit(id);
    if (e.key === 'Escape') cancelEdit();
  }

  function handleAddKeydown(e) {
    if (e.key === 'Enter') addAccount();
  }

  function langLabel(code) {
    return LANGUAGES.find(l => l.code === code)?.label ?? code;
  }
</script>

<div class="page">
  <AppNav active="mail-accounts" user={data.user} />
  <main>
    <div class="page-header">
      <div>
        <h1 class="page-title">Key Accounts</h1>
        <p class="page-sub">Manage companies for your mail campaigns.</p>
      </div>
    </div>

    {#if err}
      <div class="error-banner">{err}</div>
    {/if}

    <div class="card">
      <!-- Add row -->
      <div class="add-row">
        <input
          class="input"
          type="text"
          placeholder="Company name"
          bind:value={newName}
          onkeydown={handleAddKeydown}
          disabled={busy}
        />
        <select class="select" bind:value={newLanguage} disabled={busy}>
          {#each LANGUAGES as lang}
            <option value={lang.code}>{lang.label}</option>
          {/each}
        </select>
        <button class="btn-primary" onclick={addAccount} disabled={busy || !newName.trim()}>
          + Add Company
        </button>
      </div>

      {#if accounts.length === 0}
        <div class="empty-state">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <p>No key accounts yet. Add your first company above.</p>
        </div>
      {:else}
        <table class="table">
          <thead>
            <tr>
              <th>Company name</th>
              <th class="col-lang">Language</th>
              <th class="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each accounts as account (account.id)}
              <tr>
                <td>
                  {#if editingId === account.id}
                    <input
                      class="input input-inline"
                      type="text"
                      bind:value={editName}
                      onkeydown={(e) => handleEditKeydown(e, account.id)}
                      disabled={busy}
                      autofocus
                    />
                  {:else}
                    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                    <span class="name-cell" onclick={() => startEdit(account)}>{account.name}</span>
                  {/if}
                </td>
                <td class="col-lang">
                  <select
                    class="lang-select"
                    value={account.language ?? 'en'}
                    onchange={(e) => saveLanguage(account.id, e.currentTarget.value)}
                  >
                    {#each LANGUAGES as lang}
                      <option value={lang.code}>{lang.label}</option>
                    {/each}
                  </select>
                </td>
                <td class="col-actions">
                  {#if editingId === account.id}
                    <div class="action-group">
                      <button class="btn-sm btn-primary" onclick={() => saveEdit(account.id)} disabled={busy || !editName.trim()}>Save</button>
                      <button class="btn-sm btn-ghost" onclick={cancelEdit} disabled={busy}>Cancel</button>
                    </div>
                  {:else}
                    <div class="action-group">
                      <button class="btn-sm btn-ghost" onclick={() => startEdit(account)} disabled={busy}>Edit</button>
                      <button class="btn-sm btn-danger" onclick={() => removeAccount(account.id)} disabled={busy}>Delete</button>
                    </div>
                  {/if}
                </td>
              </tr>
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

  .add-row {
    display: flex;
    gap: 10px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border, #E4E4E7);
  }

  .input {
    flex: 1;
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
  }
  .input:focus {
    border-color: #F57832;
    box-shadow: 0 0 0 3px rgba(245, 120, 50, 0.12);
  }

  .input-inline {
    width: 100%;
    max-width: 320px;
  }

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
  .table tbody tr:hover { background: #FAFAF9; }

  .col-lang { width: 140px; }
  .col-actions { width: 160px; }

  .select {
    height: 36px;
    padding: 0 10px;
    border: 1px solid var(--border, #E4E4E7);
    border-radius: var(--radius, 8px);
    font-size: 13px;
    font-family: inherit;
    color: #18181B;
    background: white;
    outline: none;
    cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .select:focus {
    border-color: #F57832;
    box-shadow: 0 0 0 3px rgba(245, 120, 50, 0.12);
  }

  .lang-select {
    height: 30px;
    padding: 0 8px;
    border: 1px solid var(--border, #E4E4E7);
    border-radius: var(--radius, 8px);
    font-size: 12px;
    font-family: inherit;
    color: #18181B;
    background: white;
    outline: none;
    cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s;
    width: 110px;
  }
  .lang-select:focus {
    border-color: #F57832;
    box-shadow: 0 0 0 3px rgba(245, 120, 50, 0.12);
  }

  .name-cell {
    cursor: pointer;
    font-weight: 500;
    border-radius: 4px;
    padding: 2px 4px;
    margin: -2px -4px;
    transition: background 0.12s, color 0.12s;
    display: inline-block;
  }
  .name-cell:hover { background: #FFF5D2; color: #7B3803; }

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
    height: 30px;
  }

  .btn-ghost {
    background: white;
    color: #52525B;
    border-color: var(--border, #E4E4E7);
  }
  .btn-ghost:hover:not(:disabled) { background: #F4F4F5; color: #18181B; }

  .btn-danger {
    background: white;
    color: var(--danger, #dc2626);
    border-color: var(--border, #E4E4E7);
  }
  .btn-danger:hover:not(:disabled) { background: #FEF2F2; border-color: #fecaca; }
</style>
