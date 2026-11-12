# Portal — working conventions

SvelteKit 2 + Svelte 5 (runes) app on Cloudflare Pages. The `dev` branch
auto-deploys to the dev/preview site; `main` auto-deploys to production.

## Git workflow — IMPORTANT

**Commit and push directly to `dev`. Do not open pull requests, and do not
push any other branch to GitHub.** This project does not use a PR workflow —
changes are expected to land on `dev` as soon as they're made, exactly like a
normal push.

- **Never push to `main`.** Only a human merges `dev` → `main`, and only when
  explicitly told to ("merge to prod"). Never do it on your own.
- **One chat per feature, each in its own worktree on its own LOCAL branch.**
  Several chats work on Portal in parallel. Never check out `dev` itself in a
  worktree or the main folder you edit in — branches are shared between
  worktrees, so a second folder on `dev` silently gets its HEAD moved under its
  files. Start every session from the latest dev on a local branch:
  ```bash
  git fetch origin dev
  git switch -c work/<topic> origin/dev   # local only; never pushed by name
  ```
  The main folder (`~/Documents/Visual Studio Code/portal`) is a clean
  reference copy — don't edit there.
- **Migration numbers:** parallel chats can pick the same `NNNN`. Right before
  committing a new migration, check the highest number on `origin/dev`
  (`git ls-tree --name-only origin/dev migrations/ | tail -3`) and renumber
  yours if taken (also any reference to the file name).
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
- The `image-cdn` worker (`workers/image-cdn/`) serves https://img.spilbraet.dk —
  R2 images as WebP in fixed widths (300/600/1000/1600), made once and stored
  next to the original. Deploy: `npx wrangler deploy -c workers/image-cdn/wrangler.toml`.
- The `hubspot-sales-sync` worker (in `workers/`) must be deployed with
  `npx wrangler deploy --keep-vars` (otherwise secrets are wiped).
