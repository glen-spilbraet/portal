# Portal — working conventions

SvelteKit 2 + Svelte 5 (runes) app on Cloudflare Pages. The `dev` branch
auto-deploys to the dev/preview site; `main` auto-deploys to production.

## Git workflow — IMPORTANT

**Commit and push directly to `dev`. Do not open pull requests, and do not
create feature branches.** This project does not use a PR workflow — changes are
expected to land on `dev` as soon as they're made, exactly like a normal push.

- **Never push to `main`.** Only a human merges `dev` → `main`, and only when
  explicitly told to. Never do it on your own.
- **Always start from the latest `dev`** so you don't work off a stale snapshot:
  ```bash
  git fetch origin dev
  git checkout -B dev origin/dev   # or reset your working branch to origin/dev
  ```
- **Before pushing, verify the build passes:** `npm run build`.
- **Push flow** (rebase onto latest dev first to avoid non-fast-forward):
  ```bash
  git add -A && git commit -m "type(scope): summary"
  git fetch origin dev -q && git rebase origin/dev -q
  git push origin HEAD:dev
  ```
- End commit messages with the Co-Authored-By trailer.

If you cannot push to `dev` (e.g. a 403), stop and report it — do not fall back
to opening a PR or pushing to another branch.

## Build / checks

- `npm run build` — production build (must pass before pushing).
- `npx svelte-check --threshold error` — type check (pre-existing implicit-`any`
  warnings exist; don't treat those as new failures).

## Data / infrastructure notes

- Two D1 databases via bindings: `DB` (app data — `portal-db` in prod,
  `portal-db-dev` in preview) and `SALES_DB` (always the prod `portal-db`, shared
  by every environment — sales/stats/forecast/line-item data).
- **Do not run `wrangler d1 migrations apply` against `portal-db`** — its
  migration bookkeeping is stale; apply migration SQL directly with
  `wrangler d1 execute <db> --remote --file=migrations/NNNN.sql`.
- The `hubspot-sales-sync` worker (in `workers/`) must be deployed with
  `npx wrangler deploy --keep-vars` (otherwise secrets are wiped).
