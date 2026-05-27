<script>
  import AppNav from '$lib/components/AppNav.svelte';
  import { goto } from '$app/navigation';

  let { data } = $props();

  const cid = data.campaign.id;
  const allSheets   = data.allSheets;
  const allContacts = data.allContacts;
  const keyAccounts = data.keyAccounts;
  const gl          = data.globalLabels; // { key: { lang: value } }

  // ── Campaign name ──────────────────────────────────────────────────────────
  let campaignName = $state(data.campaign.name);
  let editingName  = $state(false);
  let editNameVal  = $state('');
  let savingName   = $state(false);

  function startEditName() { editNameVal = campaignName; editingName = true; }
  function cancelEditName() { editingName = false; }
  async function saveName() {
    const name = editNameVal.trim();
    if (!name || savingName) return;
    savingName = true;
    try {
      const res = await fetch(`/api/mail/campaigns/${cid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? 'Failed');
      campaignName = name;
      editingName = false;
    } catch (e) { err = e.message; }
    savingName = false;
  }
  function nameKeydown(e) {
    if (e.key === 'Enter') saveName();
    if (e.key === 'Escape') cancelEditName();
  }

  async function deleteCampaign() {
    if (!confirm(`Delete campaign "${campaignName}"? This cannot be undone.`)) return;
    try {
      await fetch(`/api/mail/campaigns/${cid}`, { method: 'DELETE' });
      goto('/mail/campaigns');
    } catch (e) { err = e.message; }
  }

  // ── Sheets ─────────────────────────────────────────────────────────────────
  let attachedSheets   = $state(data.sheets);
  let rawEmailSheets   = $state(data.emailSheets);
  let sheetSearch      = $state('');
  let showSheetDrop    = $state(false);
  let addingSheet      = $state(false);
  let dragSheetIndex   = $state(-1);
  let dragSheetOver    = $state(-1);

  const sheetDropdown = $derived(
    sheetSearch.trim()
      ? allSheets
          .filter(s => {
            const q = sheetSearch.toLowerCase();
            return (
              s.sku.toLowerCase().includes(q) ||
              (s.product_name ?? '').toLowerCase().includes(q)
            ) && !attachedSheets.some(a => a.sheet_id === s.id);
          })
          .slice(0, 8)
      : []
  );

  async function addSheet(sheet) {
    if (addingSheet) return;
    addingSheet = true;
    try {
      const res = await fetch(`/api/mail/campaigns/${cid}/sheets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheet_id: sheet.id }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? 'Failed');
      attachedSheets = [...attachedSheets, {
        sheet_id: sheet.id, sku: sheet.sku, product_name: sheet.product_name,
      }];
      sheetSearch = '';
      showSheetDrop = false;
      // Refresh full email preview data
      const r2 = await fetch(`/api/mail/campaigns/${cid}/preview-sheets`);
      if (r2.ok) rawEmailSheets = await r2.json();
    } catch (e) { err = e.message; }
    addingSheet = false;
  }

  async function removeSheet(sheetId) {
    try {
      const res = await fetch(`/api/mail/campaigns/${cid}/sheets`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheet_id: sheetId }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? 'Failed');
      attachedSheets = attachedSheets.filter(s => s.sheet_id !== sheetId);
      rawEmailSheets = rawEmailSheets.filter(s => s.sheet_id !== sheetId);
    } catch (e) { err = e.message; }
  }

  function onSheetBlur() { setTimeout(() => { showSheetDrop = false; }, 150); }

  function onSheetDragStart(e, idx) {
    dragSheetIndex = idx;
    e.dataTransfer.effectAllowed = 'move';
  }
  function onSheetDragOver(e, idx) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dragSheetOver = idx;
  }
  function onSheetDragLeave() { dragSheetOver = -1; }
  function onSheetDragEnd()   { dragSheetIndex = -1; dragSheetOver = -1; }

  async function onSheetDrop(e, toIdx) {
    e.preventDefault();
    const fromIdx = dragSheetIndex;
    dragSheetIndex = -1; dragSheetOver = -1;
    if (fromIdx === -1 || fromIdx === toIdx) return;

    // Reorder attachedSheets
    const next = [...attachedSheets];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    attachedSheets = next;

    // Keep rawEmailSheets in sync by sheet_id order
    const orderedIds = next.map(s => s.sheet_id);
    const emailMap = new Map(rawEmailSheets.map(s => [s.sheet_id, s]));
    rawEmailSheets = orderedIds.map(id => emailMap.get(id)).filter(Boolean);

    // Persist
    await fetch(`/api/mail/campaigns/${cid}/sheets`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ordered_sheet_ids: orderedIds }),
    });
  }

  // ── Contacts ───────────────────────────────────────────────────────────────
  let attachedContacts = $state(data.contacts);
  let contactFilter    = $state('all'); // 'all' | 'selected'
  let processingIds    = $state(new Set());

  const LANG_ORDER  = ['da', 'sv', 'no', 'en'];
  const LANG_LABELS = { da: 'Danish', sv: 'Swedish', no: 'Norwegian', en: 'English' };

  const groupedContacts = $derived.by(() => {
    const source = contactFilter === 'selected'
      ? allContacts.filter(c => attachedContacts.some(a => a.contact_id === c.id))
      : allContacts;

    const byLang = {};
    for (const c of source) {
      const lang      = c.key_account_language || 'other';
      const companyId = c.key_account_id       || '__none';
      const company   = c.key_account_name     || 'No company';
      if (!byLang[lang]) byLang[lang] = {};
      if (!byLang[lang][companyId]) byLang[lang][companyId] = { name: company, contacts: [] };
      byLang[lang][companyId].contacts.push(c);
    }

    const orderedLangs = [
      ...LANG_ORDER.filter(l => byLang[l]),
      ...Object.keys(byLang).filter(l => !LANG_ORDER.includes(l)),
    ];

    return orderedLangs.map(lang => ({
      lang,
      label: LANG_LABELS[lang] || 'Other',
      companies: Object.values(byLang[lang]).sort((a, b) => a.name.localeCompare(b.name)),
    }));
  });

  function isAdded(contactId) {
    return attachedContacts.some(a => a.contact_id === contactId);
  }

  // ── Sheet history ──────────────────────────────────────────────────────────
  // "contactId:sheetId" pairs where the contact was previously sent that sheet
  const historySet = new Set(data.historyPairs ?? []);

  function hadSheet(contactId, sheetId) {
    return historySet.has(`${contactId}:${sheetId}`);
  }

  // Dynamic grid: name | email | [one col per sheet] | button
  // Button column is fixed at 80px so header and rows stay perfectly aligned
  const contactGrid = $derived(
    attachedSheets.length > 0
      ? `130px 1fr ${attachedSheets.map(() => '36px').join(' ')} 80px`
      : '130px 1fr 80px'
  );
  // Header height drives sticky offset for lang-group headers
  const contactHeaderH = $derived(attachedSheets.length > 0 ? '96px' : '32px');

  async function addContact(contact) {
    if (processingIds.has(contact.id)) return;
    processingIds = new Set([...processingIds, contact.id]);
    try {
      const res = await fetch(`/api/mail/campaigns/${cid}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contact.id }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? 'Failed');
      attachedContacts = [...attachedContacts, {
        contact_id: contact.id,
        first_name: contact.first_name,
        email: contact.email,
        key_account_id: contact.key_account_id,
        key_account_name: contact.key_account_name,
        key_account_language: contact.key_account_language,
      }];
    } catch (e) { err = e.message; }
    processingIds = new Set([...processingIds].filter(id => id !== contact.id));
  }

  async function removeContact(contactId) {
    if (processingIds.has(contactId)) return;
    processingIds = new Set([...processingIds, contactId]);
    try {
      const res = await fetch(`/api/mail/campaigns/${cid}/contacts`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? 'Failed');
      attachedContacts = attachedContacts.filter(c => c.contact_id !== contactId);
    } catch (e) { err = e.message; }
    processingIds = new Set([...processingIds].filter(id => id !== contactId));
  }

  // ── Email preview ──────────────────────────────────────────────────────────
  const PREVIEW_LANGS = [
    { code: 'en', label: 'EN' },
    { code: 'da', label: 'DA' },
    { code: 'sv', label: 'SV' },
    { code: 'no', label: 'NO' },
  ];

  let previewLang = $state('en');
  const previewLogo = $derived(
    previewLang === 'sv' ? '/logo-se.svg' : previewLang === 'no' ? '/logo-no.svg' : '/logo-da.svg'
  );

  function glGet(key, fallback) {
    return gl[key]?.[previewLang] ?? gl[key]?.['en'] ?? fallback;
  }

  const emailSubject   = $derived(glGet('mail_subject',    'New products in our selection'));
  const emailHeader    = $derived(glGet('mail_header',     'New products coming soon'));
  const emailIntro     = $derived(glGet('mail_intro',      'We are adding products to our selection. Get a preview of what\'s coming and feel free to reach out if you\'re interested.'));
  const emailSheetLink = $derived(glGet('mail_sheet_link', 'View sales sheet →'));

  const previewSheets = $derived(
    rawEmailSheets.map(sheet => {
      const t = sheet.tr[previewLang] ?? {};
      const usps = [];
      for (let i = 1; i <= sheet.usp_count; i++) {
        const v = t[`usp_${i}`]; if (v) usps.push(v);
      }
      return {
        sheet_id: sheet.sheet_id,
        sku: sheet.sku,
        box_image_key: sheet.box_image_key,
        share_token: sheet.share_token,
        data_fields: sheet.data_fields,
        product_name: t.product_name || sheet.sku,
        product_description: t.product_description || '',
        usps,
      };
    })
  );

  function getDataFields(raw) {
    try { return JSON.parse(raw || '[]'); } catch { return []; }
  }

  const BADGE_KEYS = ['age', 'time', 'players'];
  const SKIP_KEYS  = ['stock_date', 'colli', ...BADGE_KEYS];

  function emailDataFields(raw) {
    return getDataFields(raw).filter(f => f.value?.trim() && !SKIP_KEYS.includes(f.key));
  }

  // ── Send ───────────────────────────────────────────────────────────────────
  let showTestModal     = $state(false);
  let showSendModal     = $state(false);
  let showScheduleModal = $state(false);
  let testRecipients    = $state(data.user?.email ?? '');
  let testLang          = $state('en');
  let scheduleDate      = $state('');
  let scheduleTime      = $state('09:00');
  let sending           = $state(false);
  let sendSuccess       = $state('');

  function openTestModal() {
    testRecipients = data.user?.email ?? '';
    testLang = previewLang;
    showTestModal = true;
    sendSuccess = ''; err = '';
  }
  function openSendModal() {
    showSendModal = true;
    sendSuccess = ''; err = '';
  }
  function openScheduleModal() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    scheduleDate = tomorrow.toISOString().slice(0, 10);
    scheduleTime = '09:00';
    showScheduleModal = true;
    sendSuccess = ''; err = '';
  }
  function closeModals() {
    showTestModal = false;
    showSendModal = false;
    showScheduleModal = false;
  }

  /**
   * Convert a date+time string in Copenhagen timezone to a UTC ISO string.
   * Uses the "fake UTC" trick to find the offset at that moment.
   */
  function copenhagenToUTC(dateStr, timeStr) {
    const utcGuess = new Date(`${dateStr}T${timeStr}:00Z`);
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: 'Europe/Copenhagen',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(utcGuess);
    const p = Object.fromEntries(parts.filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
    const h = p.hour === '24' ? '00' : p.hour;
    const copenhagenAsUTC = new Date(`${p.year}-${p.month}-${p.day}T${h}:${p.minute}:${p.second}Z`);
    const offsetMs = copenhagenAsUTC.getTime() - utcGuess.getTime();
    return new Date(utcGuess.getTime() - offsetMs).toISOString();
  }

  async function sendTest() {
    if (sending) return;
    const recipients = testRecipients.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    if (!recipients.length) { err = 'Enter at least one recipient'; return; }
    sending = true; err = '';
    try {
      const res = await fetch(`/api/mail/campaigns/${cid}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'test', test_recipients: recipients, test_lang: testLang }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? 'Send failed');
      sendSuccess = `Test email sent to ${recipients.join(', ')}`;
      showTestModal = false;
    } catch (e) { err = e.message; }
    sending = false;
  }

  async function sendNow() {
    if (sending) return;
    sending = true; err = '';
    try {
      const res = await fetch(`/api/mail/campaigns/${cid}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'now' }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? 'Send failed');
      sendSuccess = `Campaign sent to ${attachedContacts.length} contact${attachedContacts.length === 1 ? '' : 's'} ✓`;
      showSendModal = false;
    } catch (e) { err = e.message; }
    sending = false;
  }

  async function scheduleSend() {
    if (sending) return;
    if (!scheduleDate || !scheduleTime) { err = 'Select a date and time'; return; }
    const scheduledAtUTC = copenhagenToUTC(scheduleDate, scheduleTime);
    if (new Date(scheduledAtUTC) <= new Date()) { err = 'Scheduled time must be in the future'; return; }
    sending = true; err = '';
    try {
      const res = await fetch(`/api/mail/campaigns/${cid}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'scheduled', scheduled_at_utc: scheduledAtUTC }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? 'Schedule failed');
      sendSuccess = `Campaign scheduled for ${scheduleDate} at ${scheduleTime} (Copenhagen time) ✓`;
      showScheduleModal = false;
    } catch (e) { err = e.message; }
    sending = false;
  }

  // ── Shared ─────────────────────────────────────────────────────────────────
  let err = $state('');
</script>

<div class="page">
  <AppNav active="mail-campaigns" user={data.user} />
  <main>

    <!-- Full-width header -->
    <div class="page-header">
      <div class="header-left">
        <a class="back-link" href="/mail/campaigns">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          Campaigns
        </a>
        {#if editingName}
          <div class="name-edit-row">
            <input class="name-input" bind:value={editNameVal} onkeydown={nameKeydown} disabled={savingName} autofocus />
            <button class="btn-sm btn-primary" onclick={saveName} disabled={savingName || !editNameVal.trim()}>Save</button>
            <button class="btn-sm btn-ghost" onclick={cancelEditName} disabled={savingName}>Cancel</button>
          </div>
        {:else}
          <div class="title-row">
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <h1 class="page-title" onclick={startEditName}>{campaignName}</h1>
            <button class="edit-icon-btn" onclick={startEditName} title="Rename">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </div>
        {/if}
      </div>
      <div class="header-right">
        <div class="send-group">
          <button class="btn-ghost-send" onclick={openTestModal} title="Send a test email to yourself">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/></svg>
            Send test
          </button>
          <button class="btn-send-now" onclick={openSendModal}
            disabled={attachedContacts.length === 0 || attachedSheets.length === 0}
            title={attachedContacts.length === 0 || attachedSheets.length === 0 ? 'Add sheets and contacts first' : 'Send campaign now'}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            Send now
          </button>
          <button class="btn-ghost-send" onclick={openScheduleModal}
            disabled={attachedContacts.length === 0 || attachedSheets.length === 0}
            title={attachedContacts.length === 0 || attachedSheets.length === 0 ? 'Add sheets and contacts first' : 'Schedule for later'}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Schedule
          </button>
        </div>
        <button class="btn-danger-outline" onclick={deleteCampaign}>Delete campaign</button>
      </div>
    </div>

    {#if err}
      <div class="error-banner">{err}</div>
    {/if}
    {#if sendSuccess}
      <div class="success-banner">{sendSuccess}</div>
    {/if}

    <!-- Two-column body -->
    <div class="body-grid">

      <!-- ── LEFT: Editor ─────────────────────────────────────────────────── -->
      <div class="editor-col">

        <!-- Sheets section -->
        <div class="section-card">
          <div class="section-head">
            <div class="section-head-left">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <h2 class="section-title">Sales Sheets</h2>
            </div>
            <span class="count-pill">{attachedSheets.length}</span>
          </div>
          <div class="section-body">
            <div class="picker-row">
              <div class="search-wrap">
                <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input class="search-input" type="text" placeholder="Search sheets by SKU or product name…"
                  bind:value={sheetSearch}
                  onfocus={() => showSheetDrop = true}
                  onblur={onSheetBlur}
                  disabled={addingSheet}
                />
                {#if showSheetDrop && sheetSearch.trim()}
                  <div class="dropdown">
                    {#if sheetDropdown.length > 0}
                      {#each sheetDropdown as sheet (sheet.id)}
                        <button class="dropdown-item" onclick={() => addSheet(sheet)}>
                          <span class="di-sku">{sheet.sku}</span>
                          {#if sheet.product_name !== sheet.sku}<span class="di-name">{sheet.product_name}</span>{/if}
                          <span class="di-add">+ Add</span>
                        </button>
                      {/each}
                    {:else}
                      <div class="dropdown-empty">No matching sheets</div>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
            {#if attachedSheets.length === 0}
              <p class="section-empty">No sheets added yet — search above to attach some.</p>
            {:else}
              <div class="sheet-list">
                {#each attachedSheets as sheet, idx (sheet.sheet_id)}
                  <div
                    class="sheet-row"
                    class:sheet-dragging={dragSheetIndex === idx}
                    class:sheet-drag-over={dragSheetOver === idx && dragSheetIndex !== idx}
                    draggable="true"
                    ondragstart={(e) => onSheetDragStart(e, idx)}
                    ondragover={(e) => onSheetDragOver(e, idx)}
                    ondragleave={onSheetDragLeave}
                    ondrop={(e) => onSheetDrop(e, idx)}
                    ondragend={onSheetDragEnd}
                  >
                    <div class="sheet-drag-handle" title="Drag to reorder">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="9"  cy="5"  r="1" fill="currentColor" stroke="none"/>
                        <circle cx="9"  cy="12" r="1" fill="currentColor" stroke="none"/>
                        <circle cx="9"  cy="19" r="1" fill="currentColor" stroke="none"/>
                        <circle cx="15" cy="5"  r="1" fill="currentColor" stroke="none"/>
                        <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none"/>
                        <circle cx="15" cy="19" r="1" fill="currentColor" stroke="none"/>
                      </svg>
                    </div>
                    <span class="sheet-row-sku">{sheet.sku}</span>
                    <span class="sheet-row-name">{sheet.product_name && sheet.product_name !== sheet.sku ? sheet.product_name : ''}</span>
                    <button class="remove-btn" onclick={() => removeSheet(sheet.sheet_id)} aria-label="Remove sheet">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>

        <!-- Contacts section -->
        <div class="section-card">
          <div class="section-head">
            <div class="section-head-left">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <h2 class="section-title">Contacts</h2>
            </div>
            <div class="section-head-right">
              <div class="contact-filter-tabs">
                <button class="contact-filter-tab" class:active={contactFilter === 'all'} onclick={() => contactFilter = 'all'}>
                  See all
                </button>
                <button class="contact-filter-tab" class:active={contactFilter === 'selected'} onclick={() => contactFilter = 'selected'}>
                  Selected · {attachedContacts.length}
                </button>
              </div>
            </div>
          </div>

          <div class="contact-scroll" style="--contact-header-h:{contactHeaderH}">

            <!-- Column header row (sticky) -->
            <div class="clist-header" style="grid-template-columns:{contactGrid}">
              <span class="clist-col-label">Name</span>
              <span class="clist-col-label">Email</span>
              {#each attachedSheets as sheet (sheet.sheet_id)}
                {@const label = (sheet.product_name && sheet.product_name !== sheet.sku) ? sheet.product_name : sheet.sku}
                <div class="clist-sheet-col-header" title="{sheet.sku} — {label}">
                  <span>{label}</span>
                </div>
              {/each}
              <span></span>
            </div>

            {#if groupedContacts.length === 0}
              <p class="contact-empty">
                {contactFilter === 'selected' ? 'No contacts selected yet.' : 'No contacts found.'}
              </p>
            {:else}
              {#each groupedContacts as langGroup (langGroup.lang)}
                <div class="lang-group">
                  <div class="lang-group-header">{langGroup.label}</div>
                  {#each langGroup.companies as companyGroup (companyGroup.name)}
                    <div class="company-group-header">{companyGroup.name}</div>
                    {#each companyGroup.contacts as contact (contact.id)}
                      {@const added = isAdded(contact.id)}
                      {@const processing = processingIds.has(contact.id)}
                      <div class="clist-row" class:clist-added={added} style="grid-template-columns:{contactGrid}">
                        <span class="clist-name">{contact.first_name}</span>
                        <span class="clist-email">{contact.email}</span>
                        {#each attachedSheets as sheet (sheet.sheet_id)}
                          {@const received = hadSheet(contact.id, sheet.sheet_id)}
                          <span class="clist-sheet-cell"
                            title={received ? `Already received ${sheet.sku}` : `Not yet received ${sheet.sku}`}>
                            {#if received}
                              <span class="clist-dot clist-dot-red"></span>
                            {:else}
                              <span class="clist-dot clist-dot-green"></span>
                            {/if}
                          </span>
                        {/each}
                        {#if added}
                          <button class="btn-contact-remove" onclick={() => removeContact(contact.id)} disabled={processing}>
                            {processing ? '…' : 'Remove'}
                          </button>
                        {:else}
                          <button class="btn-contact-add" onclick={() => addContact(contact)} disabled={processing}>
                            {processing ? '…' : 'Add'}
                          </button>
                        {/if}
                      </div>
                    {/each}
                  {/each}
                </div>
              {/each}
            {/if}
          </div>
        </div>

      </div><!-- /editor-col -->

      <!-- ── RIGHT: Email Preview ─────────────────────────────────────────── -->
      <div class="preview-col">
        <div class="preview-header">
          <span class="preview-label">Email Preview</span>
          <div class="lang-tabs">
            {#each PREVIEW_LANGS as l}
              <button class="lang-tab" class:active={previewLang === l.code} onclick={() => previewLang = l.code}>{l.label}</button>
            {/each}
          </div>
        </div>

        <!-- Simulated email client frame -->
        <div class="email-client">

          <!-- Subject line -->
          <div class="email-subject-row">
            <span class="email-subject-label">Subject</span>
            <span class="email-subject-text">{emailSubject}</span>
          </div>

          <!-- Logo above email box -->
          <div class="email-logo-area">
            <img src={previewLogo} alt="Logo" class="email-logo-img" />
          </div>

          <!-- Email document -->
          <div class="email-doc">

            <!-- Brand header bar -->
            <div class="email-brand-bar"></div>

            <!-- Intro section -->
            <div class="email-intro-section">
              <h1 class="email-heading">{emailHeader}</h1>
              <p class="email-intro-body">{emailIntro}</p>
            </div>

            <!-- Product list -->
            {#if previewSheets.length === 0}
              <div class="email-no-sheets">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <p>Add sheets to see them here</p>
              </div>
            {:else}
              <div class="email-products">
                {#each previewSheets as sheet, i (sheet.sheet_id)}
                  {#if i > 0}<div class="product-divider"></div>{/if}
                  <div class="email-product">

                    <!-- Image + info row -->
                    <div class="ep-main">
                      <div class="ep-img-wrap">
                        {#if sheet.box_image_key}
                          <img src="/api/img/{sheet.box_image_key}?size=300" alt={sheet.product_name} class="ep-img" />
                        {:else}
                          <div class="ep-img-empty">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.25"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
                          </div>
                        {/if}
                      </div>

                      <div class="ep-info">
                        <div class="ep-sku">{sheet.sku}</div>
                        <div class="ep-name">{sheet.product_name}</div>

                        {#if sheet.product_description}
                          <p class="ep-desc">{sheet.product_description}</p>
                        {/if}

                        {#if sheet.usps.length > 0}
                          <ul class="ep-usps">
                            {#each sheet.usps as usp}
                              <li class="ep-usp">
                                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" class="ep-check">
                                  <path d="M3 8.5L6.5 12L13 4.5" stroke="#F57832" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                                <span>{usp}</span>
                              </li>
                            {/each}
                          </ul>
                        {/if}

                        {#if sheet.share_token}
                          <a class="ep-sheet-link" href="/share/sheet/{sheet.share_token}" target="_blank" rel="noopener">
                            {emailSheetLink}
                          </a>
                        {/if}
                      </div>
                    </div>

                    <!-- Data table -->
                    {#if emailDataFields(sheet.data_fields).length > 0}
                      <div class="ep-data">
                        {#each emailDataFields(sheet.data_fields) as field}
                          <div class="ep-data-row">
                            <span class="ep-data-label">{field.label}</span>
                            <span class="ep-data-value">{field.value}</span>
                          </div>
                        {/each}
                      </div>
                    {/if}

                  </div>
                {/each}
              </div>
            {/if}

            <!-- Email footer -->
            <div class="email-footer">
              <p>You received this because you are a valued partner.</p>
              <p>© {new Date().getFullYear()} — Sent via Portal</p>
            </div>

          </div><!-- /email-doc -->
        </div><!-- /email-client -->
      </div><!-- /preview-col -->

    </div><!-- /body-grid -->
  </main>
</div>

<!-- ── Send modals ──────────────────────────────────────────────────────────── -->
{#if showTestModal || showSendModal || showScheduleModal}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={(e) => { if (e.target === e.currentTarget) closeModals(); }}>

    <!-- Test modal -->
    {#if showTestModal}
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h3 class="modal-title">Send test email</h3>
          <button class="modal-close-btn" onclick={closeModals} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <label class="modal-label" for="test-recipients">Recipients</label>
          <textarea id="test-recipients" class="modal-textarea" rows="3"
            bind:value={testRecipients}
            placeholder="email@example.com, another@example.com"
            disabled={sending}
          ></textarea>
          <p class="modal-hint">Separate multiple addresses with commas or new lines.</p>

          <label class="modal-label" style="margin-top:16px;">Language</label>
          <div class="lang-tabs">
            {#each PREVIEW_LANGS as l}
              <button class="lang-tab" class:active={testLang === l.code}
                onclick={() => testLang = l.code} disabled={sending}>{l.label}</button>
            {/each}
          </div>
        </div>
        {#if err}<div class="modal-error">{err}</div>{/if}
        <div class="modal-footer">
          <button class="btn-ghost-md" onclick={closeModals} disabled={sending}>Cancel</button>
          <button class="btn-orange-md" onclick={sendTest} disabled={sending || !testRecipients.trim()}>
            {sending ? 'Sending…' : 'Send test →'}
          </button>
        </div>
      </div>
    {/if}

    <!-- Send now modal -->
    {#if showSendModal}
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h3 class="modal-title">Send campaign</h3>
          <button class="modal-close-btn" onclick={closeModals} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <p class="modal-confirm-text">Are you sure you want to send this campaign immediately?</p>
          <div class="confirm-grid">
            <span class="cg-label">Campaign</span>
            <span class="cg-value">{campaignName}</span>
            <span class="cg-label">Sheets</span>
            <span class="cg-value">{attachedSheets.length} product{attachedSheets.length === 1 ? '' : 's'}</span>
            <span class="cg-label">Recipients</span>
            <span class="cg-value">{attachedContacts.length} contact{attachedContacts.length === 1 ? '' : 's'}</span>
          </div>
        </div>
        {#if err}<div class="modal-error">{err}</div>{/if}
        <div class="modal-footer">
          <button class="btn-ghost-md" onclick={closeModals} disabled={sending}>Cancel</button>
          <button class="btn-orange-md" onclick={sendNow} disabled={sending}>
            {sending ? 'Sending…' : 'Send now →'}
          </button>
        </div>
      </div>
    {/if}

    <!-- Schedule modal -->
    {#if showScheduleModal}
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h3 class="modal-title">Schedule campaign</h3>
          <button class="modal-close-btn" onclick={closeModals} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <label class="modal-label">
            Date &amp; time
            <span class="modal-label-hint">Copenhagen time</span>
          </label>
          <div class="datetime-row">
            <input class="modal-input" type="date" bind:value={scheduleDate}
              min={new Date().toISOString().slice(0,10)} disabled={sending} />
            <input class="modal-input modal-input-time" type="time" bind:value={scheduleTime} disabled={sending} />
          </div>

          <div class="confirm-grid" style="margin-top:20px;">
            <span class="cg-label">Campaign</span>
            <span class="cg-value">{campaignName}</span>
            <span class="cg-label">Sheets</span>
            <span class="cg-value">{attachedSheets.length} product{attachedSheets.length === 1 ? '' : 's'}</span>
            <span class="cg-label">Recipients</span>
            <span class="cg-value">{attachedContacts.length} contact{attachedContacts.length === 1 ? '' : 's'}</span>
          </div>
        </div>
        {#if err}<div class="modal-error">{err}</div>{/if}
        <div class="modal-footer">
          <button class="btn-ghost-md" onclick={closeModals} disabled={sending}>Cancel</button>
          <button class="btn-orange-md" onclick={scheduleSend} disabled={sending || !scheduleDate}>
            {sending ? 'Scheduling…' : 'Schedule →'}
          </button>
        </div>
      </div>
    {/if}

  </div>
{/if}

<style>
  .page { min-height: 100vh; background: #FAFAF9; }

  main {
    max-width: 1300px;
    margin: 0 auto;
    padding: 32px 28px 80px;
  }

  /* ── Page header (full-width) ── */
  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
  }

  .header-left { display: flex; flex-direction: column; gap: 8px; min-width: 0; }

  .back-link {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 12px; font-weight: 600; color: #71717A; text-decoration: none;
    transition: color 0.12s;
  }
  .back-link:hover { color: #18181B; }

  .title-row { display: flex; align-items: center; gap: 8px; }

  .page-title {
    font-size: 22px; font-weight: 800; color: #18181B; margin: 0;
    letter-spacing: -0.4px; cursor: pointer; border-radius: 6px;
    padding: 2px 6px; margin-left: -6px;
    transition: background 0.12s;
  }
  .page-title:hover { background: #FFF5D2; }

  .edit-icon-btn {
    background: none; border: none; padding: 4px; border-radius: 6px;
    color: #A1A1AA; cursor: pointer; display: flex; align-items: center;
    transition: background 0.12s, color 0.12s;
  }
  .edit-icon-btn:hover { background: #F4F4F5; color: #52525B; }

  .name-edit-row { display: flex; align-items: center; gap: 8px; }

  .name-input {
    height: 36px; padding: 0 12px;
    border: 1px solid #F57832; border-radius: var(--radius, 8px);
    font-size: 18px; font-weight: 700; font-family: inherit;
    color: #18181B; background: white; outline: none;
    box-shadow: 0 0 0 3px rgba(245,120,50,0.12);
    min-width: 240px;
  }

  .header-right {
    display: flex; align-items: center; gap: 10px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end;
  }

  .send-group {
    display: flex; align-items: center; gap: 6px;
    background: white; border: 1px solid var(--border, #E4E4E7);
    border-radius: var(--radius, 8px); padding: 3px;
    box-shadow: var(--shadow, 0 1px 3px rgba(0,0,0,0.06));
  }

  .btn-ghost-send {
    display: inline-flex; align-items: center; gap: 5px;
    height: 30px; padding: 0 11px;
    background: none; border: none; border-radius: 6px;
    font-size: 12.5px; font-weight: 600; font-family: inherit;
    color: #52525B; cursor: pointer;
    transition: background 0.12s, color 0.12s;
    white-space: nowrap;
  }
  .btn-ghost-send:hover:not(:disabled) { background: #F4F4F5; color: #18181B; }
  .btn-ghost-send:disabled { opacity: 0.4; cursor: default; }

  .btn-send-now {
    display: inline-flex; align-items: center; gap: 5px;
    height: 30px; padding: 0 13px;
    background: #F57832; color: white;
    border: none; border-radius: 6px;
    font-size: 12.5px; font-weight: 700; font-family: inherit;
    cursor: pointer; white-space: nowrap;
    transition: opacity 0.12s;
  }
  .btn-send-now:hover:not(:disabled) { opacity: 0.88; }
  .btn-send-now:disabled { opacity: 0.4; cursor: default; }

  .btn-danger-outline {
    height: 36px; padding: 0 14px; background: white;
    color: #dc2626; border: 1px solid #fecaca;
    border-radius: var(--radius, 8px); font-size: 13px;
    font-weight: 600; font-family: inherit; cursor: pointer;
    white-space: nowrap; flex-shrink: 0;
    transition: background 0.12s, border-color 0.12s;
  }
  .btn-danger-outline:hover { background: #FEF2F2; border-color: #f87171; }

  .error-banner {
    background: #FEF2F2; border: 1px solid #fecaca;
    border-radius: var(--radius-lg, 12px); padding: 12px 16px;
    font-size: 13px; color: #dc2626; margin-bottom: 20px;
  }

  /* ── Two-column body ── */
  .body-grid {
    display: grid;
    grid-template-columns: 1fr 440px;
    gap: 24px;
    align-items: start;
  }

  /* ── Editor column ── */
  .editor-col { display: flex; flex-direction: column; gap: 20px; }

  /* ── Section cards ── */
  .section-card {
    background: white;
    border: 1px solid var(--border, #E4E4E7);
    border-radius: var(--radius-lg, 12px);
    box-shadow: var(--shadow, 0 1px 3px rgba(0,0,0,0.06));
    overflow: visible;
  }

  .section-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 13px 18px;
    border-bottom: 1px solid var(--border, #E4E4E7);
    background: #FAFAF9;
    border-radius: var(--radius-lg, 12px) var(--radius-lg, 12px) 0 0;
  }

  .section-head-left { display: flex; align-items: center; gap: 7px; color: #52525B; }

  .section-title { font-size: 13px; font-weight: 700; color: #18181B; margin: 0; }

  .count-pill {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 22px; height: 18px; padding: 0 6px;
    background: #F4F4F5; color: #52525B;
    border-radius: 100px; font-size: 11px; font-weight: 700;
  }

  .section-body { padding: 14px 18px 18px; display: flex; flex-direction: column; gap: 12px; }

  .section-empty { font-size: 13px; color: #A1A1AA; margin: 0; }

  /* ── Search/picker ── */
  .picker-row { position: relative; }
  .search-wrap { position: relative; }

  .search-icon {
    position: absolute; left: 11px; top: 50%;
    transform: translateY(-50%); color: #A1A1AA; pointer-events: none;
  }

  .search-input {
    width: 100%; height: 36px; padding: 0 12px 0 34px;
    border: 1px solid var(--border, #E4E4E7); border-radius: var(--radius, 8px);
    font-size: 13px; font-family: inherit; color: #18181B;
    background: white; outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
    box-sizing: border-box;
  }
  .search-input:focus { border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,0.12); }
  .search-input:disabled { opacity: 0.6; }

  .dropdown {
    position: absolute; top: calc(100% + 4px); left: 0; right: 0;
    background: white; border: 1px solid var(--border, #E4E4E7);
    border-radius: var(--radius, 8px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.10);
    z-index: 200; overflow: hidden;
  }

  .dropdown-item {
    display: flex; align-items: center; gap: 8px;
    width: 100%; padding: 9px 14px;
    background: none; border: none; font-family: inherit;
    font-size: 13px; color: #18181B; cursor: pointer; text-align: left;
    transition: background 0.1s;
  }
  .dropdown-item:hover { background: #FAFAF9; }
  .dropdown-item + .dropdown-item { border-top: 1px solid #F4F4F5; }

  .di-sku  { font-weight: 700; color: #F57832; flex-shrink: 0; }
  .di-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .di-sub  { color: #71717A; font-size: 12px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .di-add  { margin-left: auto; font-size: 12px; font-weight: 600; color: #F57832; flex-shrink: 0; }

  .dropdown-empty { padding: 12px 14px; font-size: 13px; color: #A1A1AA; }

  /* ── Sheet draggable list ── */
  .sheet-list {
    display: flex; flex-direction: column;
    border: 1px solid var(--border, #E4E4E7);
    border-radius: var(--radius, 8px); overflow: hidden;
  }

  .sheet-row {
    display: grid;
    grid-template-columns: 28px 100px 1fr 28px;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border, #E4E4E7);
    transition: background 0.1s, opacity 0.15s;
    cursor: default;
  }
  .sheet-row:last-child { border-bottom: none; }
  .sheet-row:hover { background: #FAFAF9; }
  .sheet-row.sheet-dragging { opacity: 0.3; }
  .sheet-row.sheet-drag-over {
    background: #FFF5D2;
    outline: 2px dashed #F57832;
    outline-offset: -2px;
  }

  .sheet-drag-handle {
    color: #C4C4C4;
    cursor: grab;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: color 0.12s;
  }
  .sheet-row:hover .sheet-drag-handle { color: #A1A1AA; }
  .sheet-drag-handle:active { cursor: grabbing; }

  .sheet-row-sku {
    font-size: 11px; font-weight: 700; color: #F57832;
    white-space: nowrap; flex-shrink: 0;
  }

  .sheet-row-name {
    font-size: 13px; color: #18181B; font-weight: 500;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  /* ── Contact section head ── */
  .section-head-right { display: flex; align-items: center; gap: 8px; }

  .contact-filter-tabs {
    display: flex; gap: 2px; padding: 2px;
    background: #F4F4F5; border-radius: 8px;
  }
  .contact-filter-tab {
    height: 24px; padding: 0 10px;
    background: none; border: none; border-radius: 6px;
    font-size: 11.5px; font-weight: 600; font-family: inherit;
    color: #71717A; cursor: pointer; white-space: nowrap;
    transition: background 0.12s, color 0.12s;
  }
  .contact-filter-tab.active { background: white; color: #18181B; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .contact-filter-tab:not(.active):hover { color: #52525B; }

  /* ── Scrollable contact list ── */
  .contact-scroll {
    max-height: 520px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #D4D4D8 transparent;
  }
  .contact-scroll::-webkit-scrollbar { width: 4px; }
  .contact-scroll::-webkit-scrollbar-thumb { background: #D4D4D8; border-radius: 2px; }

  .contact-empty {
    font-size: 13px; color: #A1A1AA; margin: 0; padding: 16px 18px;
  }

  /* ── Language group ── */
  .lang-group { }
  .lang-group-header {
    padding: 7px 18px 5px;
    font-size: 10.5px; font-weight: 800; color: #A1A1AA;
    text-transform: uppercase; letter-spacing: 0.07em;
    background: #FAFAF9;
    border-bottom: 1px solid var(--border, #E4E4E7);
    border-top: 1px solid var(--border, #E4E4E7);
    position: sticky; top: var(--contact-header-h, 32px); z-index: 2;
  }
  .lang-group:first-child .lang-group-header { border-top: none; }

  /* ── Company group ── */
  .company-group-header {
    padding: 5px 18px 4px;
    font-size: 11px; font-weight: 700; color: #52525B;
    background: #F4F4F5;
    border-bottom: 1px solid var(--border, #E4E4E7);
  }

  /* ── Column header ── */
  .clist-header {
    display: grid;
    grid-template-columns: var(--clist-grid, 130px 1fr auto);
    align-items: end;
    gap: 0;
    padding: 0 14px 0 18px;
    background: #FAFAF9;
    border-bottom: 2px solid var(--border, #E4E4E7);
    min-height: var(--contact-header-h, 32px);
    position: sticky; top: 0; z-index: 3;
  }

  .clist-col-label {
    font-size: 10px; font-weight: 700; color: #A1A1AA;
    text-transform: uppercase; letter-spacing: 0.05em;
    padding-bottom: 8px; white-space: nowrap;
  }

  .clist-sheet-col-header {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 6px;
    overflow: hidden;
  }
  .clist-sheet-col-header span {
    writing-mode: vertical-rl;
    text-orientation: mixed;
    transform: rotate(180deg);
    font-size: 10px; font-weight: 700; color: #52525B;
    letter-spacing: 0.02em; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
    max-height: 84px;
  }

  /* ── Contact row ── */
  .clist-row {
    display: grid;
    grid-template-columns: var(--clist-grid, 130px 1fr auto);
    align-items: center;
    gap: 0;
    padding: 7px 14px 7px 18px;
    border-bottom: 1px solid var(--border, #E4E4E7);
    transition: background 0.1s;
  }
  .clist-row:last-child { border-bottom: none; }
  .clist-row:hover { background: #FAFAF9; }
  .clist-row.clist-added { background: #F0FDF4; }
  .clist-row.clist-added:hover { background: #DCFCE7; }

  .clist-name {
    font-size: 13px; font-weight: 600; color: #18181B;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    padding-right: 10px;
  }
  .clist-email {
    font-size: 12px; color: #71717A;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    padding-right: 8px;
  }

  /* ── Sheet history cells ── */
  .clist-sheet-cell {
    display: flex; align-items: center; justify-content: center;
  }
  .clist-dot {
    width: 8px; height: 8px; border-radius: 50%;
    display: block; flex-shrink: 0;
  }
  .clist-dot-green { background: #22C55E; }
  .clist-dot-red   { background: #EF4444; }

  /* ── Button cell: right-align within fixed 80px column ── */
  .btn-contact-add, .btn-contact-remove { justify-self: end; }

  .btn-contact-add {
    height: 26px; padding: 0 11px; flex-shrink: 0;
    background: #F57832; color: white; border: none;
    border-radius: 6px; font-size: 12px; font-weight: 700;
    font-family: inherit; cursor: pointer; white-space: nowrap;
    transition: opacity 0.12s;
  }
  .btn-contact-add:hover:not(:disabled) { opacity: 0.85; }
  .btn-contact-add:disabled { opacity: 0.5; cursor: default; }

  .btn-contact-remove {
    height: 26px; padding: 0 11px; flex-shrink: 0;
    background: #FEF2F2; color: #dc2626;
    border: 1px solid #fecaca; border-radius: 6px;
    font-size: 12px; font-weight: 700; font-family: inherit;
    cursor: pointer; white-space: nowrap; transition: background 0.12s;
  }
  .btn-contact-remove:hover:not(:disabled) { background: #FEE2E2; }
  .btn-contact-remove:disabled { opacity: 0.5; cursor: default; }

  .remove-btn {
    display: flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; background: none; border: none;
    border-radius: 6px; color: #A1A1AA; cursor: pointer; padding: 0;
    transition: background 0.1s, color 0.1s;
  }
  .remove-btn:hover { background: #FEF2F2; color: #dc2626; }

  /* ── Shared buttons ── */
  .btn-sm {
    height: 30px; padding: 0 12px; border-radius: var(--radius, 8px);
    font-size: 12px; font-weight: 600; font-family: inherit;
    cursor: pointer; border: 1px solid transparent;
    white-space: nowrap; transition: background 0.12s, color 0.12s, opacity 0.12s;
  }
  .btn-sm:disabled { opacity: 0.45; cursor: default; }
  .btn-sm.btn-primary { background: #F57832; color: white; border-color: #F57832; height: 30px; }
  .btn-sm.btn-primary:hover:not(:disabled) { opacity: 0.88; }
  .btn-sm.btn-ghost { background: white; color: #52525B; border-color: var(--border, #E4E4E7); }
  .btn-sm.btn-ghost:hover:not(:disabled) { background: #F4F4F5; color: #18181B; }

  /* ══ EMAIL PREVIEW COLUMN ══════════════════════════════════════════════════ */

  .preview-col {
    position: sticky;
    top: 24px;
    max-height: calc(100vh - 48px);
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #D4D4D8 transparent;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .preview-col::-webkit-scrollbar { width: 4px; }
  .preview-col::-webkit-scrollbar-thumb { background: #D4D4D8; border-radius: 2px; }

  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-shrink: 0;
  }

  .preview-label {
    font-size: 11px; font-weight: 700; color: #A1A1AA;
    text-transform: uppercase; letter-spacing: 0.05em;
  }

  .lang-tabs {
    display: flex; gap: 2px; padding: 2px;
    background: #F4F4F5; border-radius: 8px;
  }

  .lang-tab {
    height: 26px; min-width: 34px; padding: 0 8px;
    background: none; border: none; border-radius: 6px;
    font-size: 11px; font-weight: 700; font-family: inherit;
    color: #71717A; cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .lang-tab.active { background: white; color: #18181B; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .lang-tab:not(.active):hover { color: #52525B; }

  /* ── Email client wrapper ── */
  .email-client {
    background: #FFE6A5;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid #D6C97A;
  }

  .email-logo-area {
    padding: 20px 16px 0;
    text-align: center;
  }

  .email-logo-img {
    display: block;
    margin: 0 auto;
    width: 140px;
    height: auto;
  }

  /* ── Subject row ── */
  .email-subject-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 10px 14px;
    background: white;
    border-bottom: 1px solid #ECEAE6;
    font-size: 12px;
  }

  .email-subject-label {
    font-weight: 700;
    color: #A1A1AA;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 10px;
    flex-shrink: 0;
  }

  .email-subject-text {
    font-weight: 600;
    color: #18181B;
    font-size: 12px;
  }

  /* ── Email document ── */
  .email-doc {
    background: white;
    margin: 16px 10px 10px;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 12px rgba(0,0,0,0.12);
  }

  /* Brand header bar */
  .email-brand-bar {
    height: 6px;
    background: linear-gradient(90deg, #F57832 0%, #F5A632 100%);
  }

  /* Intro section */
  .email-intro-section {
    padding: 24px 24px 20px;
    border-bottom: 1px solid #F4F0E8;
  }

  .email-heading {
    font-size: 20px;
    font-weight: 800;
    color: #18181B;
    margin: 0 0 10px;
    letter-spacing: -0.4px;
    line-height: 1.25;
  }

  .email-intro-body {
    font-size: 13px;
    color: #52525B;
    line-height: 1.65;
    margin: 0;
  }

  /* No sheets placeholder */
  .email-no-sheets {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 40px 20px;
    color: #C4C4C4;
    text-align: center;
  }
  .email-no-sheets p { font-size: 12px; margin: 0; }

  /* Products wrapper */
  .email-products {
    padding: 0;
  }

  .product-divider {
    height: 1px;
    background: #F4F0E8;
    margin: 0 20px;
  }

  /* Single product */
  .email-product {
    padding: 18px 20px 16px;
  }

  /* Image + info row */
  .ep-main {
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }

  .ep-img-wrap { flex-shrink: 0; }

  .ep-img {
    width: 110px;
    height: 110px;
    border-radius: 12px;
    object-fit: contain;
    background: #FAFAF8;
    border: 1px solid #ECEAE6;
    display: block;
    padding: 6px;
    box-sizing: border-box;
  }

  .ep-img-empty {
    width: 110px;
    height: 110px;
    border-radius: 12px;
    background: #F4F4F5;
    border: 1px solid #E4E4E7;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ep-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .ep-sku {
    font-size: 10px;
    font-weight: 700;
    color: #F57832;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .ep-name {
    font-size: 15px;
    font-weight: 800;
    color: #18181B;
    letter-spacing: -0.3px;
    line-height: 1.25;
  }

  .ep-desc {
    font-size: 12px;
    color: #52525B;
    line-height: 1.55;
    margin: 2px 0 0;
  }

  .ep-usps {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .ep-usp {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: #374151;
    line-height: 1.4;
  }

  .ep-check { flex-shrink: 0; }

  .ep-sheet-link {
    display: inline-block;
    margin-top: 8px;
    font-size: 11.5px;
    font-weight: 700;
    color: #F57832;
    text-decoration: none;
    transition: color 0.12s;
  }
  .ep-sheet-link:hover { color: #E06820; text-decoration: underline; }

  /* Data table */
  .ep-data {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    margin-top: 12px;
    background: #FAFAF8;
    border: 1px solid #F0EDE7;
    border-radius: 8px;
    overflow: hidden;
    font-size: 11.5px;
  }

  .ep-data-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-bottom: 1px solid #F0EDE7;
  }
  .ep-data-row:nth-child(odd) { border-right: 1px solid #F0EDE7; }
  .ep-data-row:last-child { border-bottom: none; }
  .ep-data-row:nth-last-child(2):nth-child(odd) { border-bottom: none; }

  .ep-data-label { color: #71717A; font-weight: 500; flex-shrink: 0; min-width: 0; }
  .ep-data-value { color: #18181B; font-weight: 700; flex: 1; text-align: right; }

  /* Email footer */
  .email-footer {
    padding: 16px 20px;
    border-top: 1px solid #F4F0E8;
    background: #FAFAF8;
  }
  .email-footer p {
    font-size: 10.5px;
    color: #A1A1AA;
    margin: 0;
    line-height: 1.6;
    text-align: center;
  }

  /* ── Banners ── */
  .success-banner {
    background: #F0FDF4; border: 1px solid #BBF7D0;
    border-radius: var(--radius-lg, 12px); padding: 12px 16px;
    font-size: 13px; color: #15803D; margin-bottom: 20px;
    font-weight: 500;
  }

  /* ══ MODALS ════════════════════════════════════════════════════════════════ */

  .modal-overlay {
    position: fixed; inset: 0; z-index: 1000;
    background: rgba(0,0,0,0.4);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
    backdrop-filter: blur(2px);
  }

  .modal {
    background: white;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.18);
    width: 100%; max-width: 420px;
    display: flex; flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 20px 14px;
    border-bottom: 1px solid var(--border, #E4E4E7);
    background: #FAFAF9;
    border-radius: 16px 16px 0 0;
  }

  .modal-title {
    font-size: 15px; font-weight: 800; color: #18181B; margin: 0;
    letter-spacing: -0.2px;
  }

  .modal-close-btn {
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border: none; background: none;
    border-radius: 8px; color: #A1A1AA; cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .modal-close-btn:hover { background: #F4F4F5; color: #52525B; }

  .modal-body {
    padding: 20px;
    display: flex; flex-direction: column; gap: 6px;
  }

  .modal-label {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; font-weight: 700; color: #52525B;
    text-transform: uppercase; letter-spacing: 0.03em;
    margin-bottom: 6px;
  }

  .modal-label-hint {
    font-size: 11px; font-weight: 600; color: #A1A1AA;
    background: #F4F4F5; border-radius: 100px;
    padding: 1px 7px; letter-spacing: 0; text-transform: none;
  }

  .modal-textarea {
    width: 100%; padding: 9px 12px; box-sizing: border-box;
    border: 1px solid var(--border, #E4E4E7); border-radius: var(--radius, 8px);
    font-size: 13px; font-family: inherit; color: #18181B;
    background: white; outline: none; resize: vertical; min-height: 72px;
    transition: border-color 0.15s, box-shadow 0.15s;
    line-height: 1.5;
  }
  .modal-textarea:focus { border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,0.12); }
  .modal-textarea:disabled { opacity: 0.6; }

  .modal-hint {
    font-size: 12px; color: #A1A1AA; margin: 2px 0 0; line-height: 1.5;
  }

  .modal-input {
    height: 36px; padding: 0 11px; box-sizing: border-box;
    border: 1px solid var(--border, #E4E4E7); border-radius: var(--radius, 8px);
    font-size: 13px; font-family: inherit; color: #18181B;
    background: white; outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .modal-input:focus { border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,0.12); }
  .modal-input:disabled { opacity: 0.6; }
  .modal-input-time { width: 120px; flex-shrink: 0; }

  .datetime-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .datetime-row .modal-input:first-child { flex: 1; min-width: 140px; }

  .modal-confirm-text {
    font-size: 14px; color: #52525B; margin: 0 0 16px; line-height: 1.55;
  }

  .confirm-grid {
    display: grid; grid-template-columns: auto 1fr; gap: 8px 14px;
    background: #FAFAF9; border: 1px solid var(--border, #E4E4E7);
    border-radius: 10px; padding: 12px 16px;
  }

  .cg-label {
    font-size: 12px; font-weight: 700; color: #A1A1AA;
    text-transform: uppercase; letter-spacing: 0.03em;
    white-space: nowrap; align-self: center;
  }

  .cg-value {
    font-size: 13px; font-weight: 600; color: #18181B; align-self: center;
  }

  .modal-error {
    margin: 0 20px;
    background: #FEF2F2; border: 1px solid #fecaca;
    border-radius: 8px; padding: 10px 14px;
    font-size: 13px; color: #dc2626;
  }

  .modal-footer {
    display: flex; justify-content: flex-end; gap: 8px;
    padding: 14px 20px 18px;
    border-top: 1px solid var(--border, #E4E4E7);
    background: #FAFAF9;
    border-radius: 0 0 16px 16px;
  }

  .btn-ghost-md {
    height: 36px; padding: 0 14px; background: white;
    color: #52525B; border: 1px solid var(--border, #E4E4E7);
    border-radius: var(--radius, 8px); font-size: 13px;
    font-weight: 600; font-family: inherit; cursor: pointer;
    transition: background 0.12s;
  }
  .btn-ghost-md:hover:not(:disabled) { background: #F4F4F5; }
  .btn-ghost-md:disabled { opacity: 0.45; cursor: default; }

  .btn-orange-md {
    height: 36px; padding: 0 16px;
    background: #F57832; color: white;
    border: none; border-radius: var(--radius, 8px);
    font-size: 13px; font-weight: 700; font-family: inherit;
    cursor: pointer; white-space: nowrap;
    transition: opacity 0.12s;
  }
  .btn-orange-md:hover:not(:disabled) { opacity: 0.88; }
  .btn-orange-md:disabled { opacity: 0.45; cursor: default; }
</style>
