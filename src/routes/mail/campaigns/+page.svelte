<script>
  import AppNav from '$lib/components/AppNav.svelte';
  import { goto } from '$app/navigation';

  let { data } = $props();

  let campaigns = $state(data.campaigns);
  let newName = $state('');
  let busy = $state(false);
  let err = $state('');

  async function addCampaign() {
    const name = newName.trim();
    if (!name || busy) return;
    busy = true; err = '';
    try {
      const res = await fetch('/api/mail/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? 'Failed');
      const added = await res.json();
      newName = '';
      goto(`/mail/campaigns/${added.id}`);
    } catch (e) { err = e.message; }
    busy = false;
  }

  async function removeCampaign(id, name) {
    if (!confirm(`Delete campaign "${name}"? This cannot be undone.`)) return;
    busy = true; err = '';
    try {
      const res = await fetch(`/api/mail/campaigns/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).message ?? 'Failed');
      campaigns = campaigns.filter(c => c.id !== id);
    } catch (e) { err = e.message; }
    busy = false;
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') addCampaign();
  }

  function formatDate(ts) {
    if (!ts) return '';
    return new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
</script>

<div class="page">
  <AppNav active="mail-campaigns" user={data.user} />
  <main>
    <div class="page-header">
      <div>
        <h1 class="page-title">Campaigns</h1>
        <p class="page-sub">Create and manage your mail campaigns.</p>
      </div>
    </div>

    {#if err}
      <div class="error-banner">{err}</div>
    {/if}

    <div class="card">
      <div class="add-row">
        <input
          class="input"
          type="text"
          placeholder="Campaign name…"
          bind:value={newName}
          onkeydown={handleKeydown}
          disabled={busy}
        />
        <button class="btn-primary" onclick={addCampaign} disabled={busy || !newName.trim()}>
          + New Campaign
        </button>
      </div>

      {#if campaigns.length === 0}
        <div class="empty-state">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          <p>No campaigns yet. Enter a name above to create your first.</p>
        </div>
      {:else}
        <table class="table">
          <thead>
            <tr>
              <th>Campaign name</th>
              <th class="col-num">Sheets</th>
              <th class="col-num">Contacts</th>
              <th class="col-date">Created</th>
              <th class="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each campaigns as campaign (campaign.id)}
              <tr>
                <td>
                  <a class="campaign-link" href="/mail/campaigns/{campaign.id}">{campaign.name}</a>
                </td>
                <td class="col-num">
                  <span class="num-badge">{campaign.sheet_count}</span>
                </td>
                <td class="col-num">
                  <span class="num-badge">{campaign.contact_count}</span>
                </td>
                <td class="col-date cell-muted">{formatDate(campaign.created_at)}</td>
                <td class="col-actions">
                  <div class="action-group">
                    <a class="btn-sm btn-ghost" href="/mail/campaigns/{campaign.id}">Open</a>
                    <button class="btn-sm btn-danger" onclick={() => removeCampaign(campaign.id, campaign.name)} disabled={busy}>Delete</button>
                  </div>
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
    margin-bottom: 28px;
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

  .col-num    { width: 80px; text-align: center; }
  .col-date   { width: 130px; }
  .col-actions { width: 160px; }

  .table .col-num { text-align: center; }

  .campaign-link {
    font-weight: 600;
    color: #18181B;
    text-decoration: none;
    border-radius: 4px;
    padding: 2px 4px;
    margin: -2px -4px;
    transition: background 0.12s, color 0.12s;
    display: inline-block;
  }
  .campaign-link:hover { background: #FFF5D2; color: #7B3803; }

  .num-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 20px;
    padding: 0 6px;
    background: #F4F4F5;
    color: #52525B;
    border-radius: 100px;
    font-size: 11px;
    font-weight: 600;
  }

  .cell-muted { color: #A1A1AA; }

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
    text-decoration: none;
    display: inline-flex;
    align-items: center;
  }
  .btn-sm:disabled { opacity: 0.45; cursor: default; }

  .btn-sm.btn-ghost {
    background: white;
    color: #52525B;
    border-color: var(--border, #E4E4E7);
  }
  .btn-sm.btn-ghost:hover { background: #F4F4F5; color: #18181B; }

  .btn-sm.btn-danger {
    background: white;
    color: var(--danger, #dc2626);
    border-color: var(--border, #E4E4E7);
  }
  .btn-sm.btn-danger:hover:not(:disabled) { background: #FEF2F2; border-color: #fecaca; }
</style>
