# Sales Stats — operations runbook

Everything under the **Stats** section (frontpage, Product, Publisher/Series,
Credit Notes, Customer detail) reads from two tables in **`SALES_DB`**, which is
**always the prod `portal-db`** — shared by every environment. They are filled by
the `hubspot-sales-sync` worker.

## 1. How the data is kept fresh

| | Cron | What runs |
|---|---|---|
| **Daily** | `30 4 * * *` (04:30 UTC) | Re-sync current + prior year, incremental sweep of anything modified since the last run, forecast mirror, line items for changed deals |
| **Monthly** | `0 3 1 * *` (03:00 UTC, 1st) | **Full reconcile** — the only run that removes deleted / un-won deals |

Worker URL: `https://hubspot-sales-sync.glen-16a.workers.dev`
Deploy with secrets intact: `npx wrangler deploy --keep-vars` (from `workers/hubspot-sales-sync/`).

**Freshness is visible in the app.** Every Stats view shows a chip in the date
bar, derived from `sales_sync_meta`:

- 🟢 **Updated <time>** — last run OK and recent (< 28 h).
- 🟠 **Stale <time>** — no successful run in > 28 h (a daily run was missed).
- 🔴 **Sync error** — the last run failed (`status = 'error'`); see `message`.
- ⚪ **Syncing…** — a run is in progress.

Check the raw state:
```bash
wrangler d1 execute portal-db --remote --command "SELECT * FROM sales_sync_meta WHERE id = 1"
```

### Failure alerts (email)

On a failed scheduled run (an exception, or `sales_sync_meta.status = 'error'`
after the run) the worker emails an alert via **Resend** — reusing the Rest Check
`RESEND_API_KEY` / `RESEND_FROM`. Set the recipient once:
```bash
cd workers/hubspot-sales-sync
wrangler secret put ALERT_EMAIL   # e.g. glen@spilbraet.dk
npx wrangler deploy --keep-vars   # --keep-vars so existing secrets survive
```
If `ALERT_EMAIL` is unset the alert is a silent no-op (nothing breaks).

A run that **never fires at all** can't email itself. Cover that case with
Cloudflare's built-in **Cron Trigger failure notifications** (Workers & Pages →
the worker → Settings → Trigger Events / Notifications) and/or the amber "Stale"
freshness chip, which appears for anyone who opens a Stats view.

## 2. Re-running a sync manually

Trigger the worker over HTTP with the `SYNC_SECRET` bearer (do NOT wait on the
daily cron if data is visibly wrong):
```bash
# Full reconcile (catches deletions / un-wins) — the fix for over-counting:
curl "https://hubspot-sales-sync.glen-16a.workers.dev/?reconcile=1" \
  -H "Authorization: Bearer $SYNC_SECRET"

# Incremental sweep only (deals modified since the last run):
curl "https://hubspot-sales-sync.glen-16a.workers.dev/?incremental=1" \
  -H "Authorization: Bearer $SYNC_SECRET"
```
The full reconcile is the same logic as the monthly cron; re-running it on demand
is the fix for over-counting after deals are deleted/un-won mid-month. Other
query params on the same endpoint: `?year=YYYY` (one year), `?since=YYYY` (from a
year), `?verify=1&from=&to=` (Rackbeat verification), `?lineitems=1&from=&to=`
(line-item backfill for a window).

## 3. Restoring the data (D1 Time Travel)

D1 keeps a **30-day** point-in-time history. This is the recovery path if a sync
corrupts data or a wrong `d1 execute` is run.

1. Find a timestamp (or bookmark) just before the damage:
   ```bash
   wrangler d1 time-travel info portal-db
   ```
2. Preview what a restore point looks like before committing:
   ```bash
   wrangler d1 time-travel info portal-db --timestamp "2026-10-29T03:00:00Z"
   ```
3. Restore (this rewinds the WHOLE database — coordinate first; it affects all
   app data, not just the sales tables):
   ```bash
   wrangler d1 time-travel restore portal-db --timestamp "2026-10-29T03:00:00Z"
   ```
4. After restoring, re-run a sync (section 2) so the mirror catches up to HubSpot.

> ⚠️ Time Travel restores the entire `portal-db`. If only the sales mirror is bad,
> prefer **re-running a full sync** (section 2) over a time-travel restore — the
> sync rebuilds `sales_deals` / `deal_line_items` from HubSpot without touching
> the rest of the app.

## 4. Migrations on these tables

Per `CLAUDE.md`: **never** `wrangler d1 migrations apply` against `portal-db`
(its bookkeeping is stale). Apply SQL directly:
```bash
wrangler d1 execute portal-db --remote --file=migrations/NNNN_name.sql
```
Index-only migrations (e.g. `0089_sales_perf_indexes.sql`) are safe to re-run —
every statement is `CREATE INDEX IF NOT EXISTS`.

## 5. Data-integrity checks (manual, until automated)

```bash
# Orphan line items (a line whose deal is not in the mirror):
wrangler d1 execute portal-db --remote --command \
  "SELECT COUNT(*) FROM deal_line_items li LEFT JOIN sales_deals d ON d.deal_id = li.deal_id WHERE d.deal_id IS NULL"

# Closed deals with no line items (revenue in totals but missing from breakdowns):
wrangler d1 execute portal-db --remote --command \
  "SELECT COUNT(*) FROM sales_deals d WHERE NOT EXISTS (SELECT 1 FROM deal_line_items li WHERE li.deal_id = d.deal_id AND li.deal_kind='closed')"

# Rows with no market bucket:
wrangler d1 execute portal-db --remote --command \
  "SELECT COUNT(*) FROM sales_deals WHERE market IS NULL OR market = ''"
```
