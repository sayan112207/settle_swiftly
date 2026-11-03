# Environments

Settle Swiftly runs in two environments. Keep them separate.

| | Dev / test | Production |
|---|---|---|
| Supabase project | old project (`pseztq…`) | `settle-swiftly-prod` |
| Website | local (`bun run dev`) | https://settleswiftly.com |
| Branch | `develop` | `main` |
| Data | fake / test data only | real customer data |

## Branch flow
1. Create a branch from `develop` and open a PR into `develop`.
2. After review, merge it. Nothing reaches production yet.
3. When we are ready to release, open a release PR from `develop` into `main`.
   Merge it with a merge commit (CI only accepts `develop` → `main`).
4. Cloudflare builds `main` and deploys it to production automatically.
5. Never push directly to `main` and never rewrite history.

## Database changes
- Every schema change is a migration in `supabase/migrations`.
- Apply it to dev first and test.
- Apply it to production before the release PR is merged, so the new
  code never runs against an old schema.
- Check RLS (row-level security) on any new table.

## Secrets
- Never put keys in git, chat, screenshots or Slack. Rotate any key that leaks.
- `VITE_*` values are Cloudflare **Build variables** (baked in at build time).
- Server secrets (`SUPABASE_SERVICE_ROLE_KEY`, `SMTP2GO_*`, `CRON_SECRET`)
  are Cloudflare **runtime secrets**.
- Supabase keys: Publishable key = `VITE_SUPABASE_ANON_KEY`,
  Secret key = `SUPABASE_SERVICE_ROLE_KEY`.
- Production database access is for trusted people only.

## Access
- Cloudflare, GoDaddy (DNS) and Supabase production: owner (Sayan) and
  people he approves.
- Use dev for experiments. Do not test on production data.

## Known limits
- Supabase free plan: no backups, and the project pauses when idle.
- PR preview builds are off in Cloudflare (they failed without a Wrangler
  `previews` config). Production builds are unaffected.
