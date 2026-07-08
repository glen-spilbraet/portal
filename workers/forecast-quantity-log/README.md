# Forecast Quantity Log

Cloudflare Worker that snapshots line item quantities on HubSpot forecast deals
(deals in the "Forecast" lane of the Sales Pipeline) into three line item
properties:

| Property | Trigger date |
|---|---|
| `quantity_log_create` | the day the line item is created |
| `quantity_log_1_month` | 1 month before the deal's `forecast_start_date` |
| `quantity_log_start` | the deal's `forecast_start_date` |

## Rules

Per field, per line item:

- **Before the trigger date** — never touched.
- **On the trigger date** — written with the current quantity, overwriting any
  value that was (incorrectly) pre-filled.
- **After the trigger date** — written only if still empty. Already-logged
  values are never changed, so historical snapshots are stable.

This means the very first run acts as the launch backfill: every existing
forecast whose dates have passed gets its empty fields filled with the current
quantity.

Runs every 15 minutes via a Cloudflare Cron Trigger (no external cron service
needed), so `quantity_log_create` is stamped within ~15 minutes of a line item
being added.

## Which deals are scanned

- Deals in the stage(s) listed in `FORECAST_STAGE_IDS` (the Forecast lane) —
  these are logged even before a start date is set, and
- any deal in `HUBSPOT_PIPELINE_ID` that has `forecast_start_date` set — this
  catches forecasts that already started and were moved to another stage.

## Requirements in HubSpot

1. The three `quantity_log_*` properties must exist as **number properties on
   the Line Item object** (not on deals).
2. `forecast_start_date` is a date property on the Deal object.
3. A **private app** access token with scopes:
   - `crm.objects.deals.read`
   - `e-commerce` (read + write line items)

## Setup & deploy

From the repo root:

```sh
# secrets
npx wrangler secret put HUBSPOT_TOKEN -c workers/forecast-quantity-log/wrangler.toml
npx wrangler secret put ADMIN_KEY -c workers/forecast-quantity-log/wrangler.toml

# deploy
npx wrangler deploy -c workers/forecast-quantity-log/wrangler.toml
```

Then configure the Forecast stage id(s):

```sh
# list pipelines + stage ids (uses the deployed worker)
curl -H "Authorization: Bearer <ADMIN_KEY>" https://forecast-quantity-log.<account>.workers.dev/pipelines
```

Put the Forecast lane's stage id into `FORECAST_STAGE_IDS` in
[wrangler.toml](wrangler.toml) (comma-separated if several) and redeploy.

## Manual run / backfill

```sh
# preview what would be written, without writing anything
curl -X POST -H "Authorization: Bearer <ADMIN_KEY>" \
  "https://forecast-quantity-log.<account>.workers.dev/run?dryRun=1"

# run for real (e.g. the launch backfill)
curl -X POST -H "Authorization: Bearer <ADMIN_KEY>" \
  "https://forecast-quantity-log.<account>.workers.dev/run"
```

The response is a JSON summary: deals/line items scanned, and every property
written per line item (capped at 500 rows in the response).

## Notes

- Dates are evaluated in `TIMEZONE` (default `Europe/Copenhagen`).
- "1 month before" is a calendar month, clamped to month length
  (e.g. start 2027-03-31 → 1-month log on 2027-02-28).
- If a deal's `forecast_start_date` is postponed after the 1-month log was
  written, the value is re-logged (overwritten) when the new 1-month date
  arrives — same on-the-date overwrite rule.
- Logs are visible under the worker's Observability tab in the Cloudflare
  dashboard, or with
  `npx wrangler tail -c workers/forecast-quantity-log/wrangler.toml`.
