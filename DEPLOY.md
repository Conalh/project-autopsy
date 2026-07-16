# Deploying the web app

The web inspector is designed for public hosting with a conservative default source policy: it accepts public `github.com` repositories and rejects local paths and private repositories. This is one boundary, not a complete deployment guarantee; configure authentication, rate limiting, persistence, secret scope, and platform abuse controls for your environment. Local filesystem inspection stays off unless `PROJECT_AUTOPSY_ALLOW_LOCAL_PATHS=true` is set — **never set that on a public deployment**.

These notes target Vercel because it is the least-friction host for Next.js, but the app is a standard Next.js server and runs anywhere Node 24+ does.

## Environment Variables

For a production deployment, configure both access tokens:

| Variable | Why |
| --- | --- |
| `PROJECT_AUTOPSY_PUBLIC_URL` | Canonical base URL (e.g. `https://your-app.vercel.app`). Makes share links absolute and avoids trusting forwarded `Host` headers. |
| `PROJECT_AUTOPSY_GITHUB_TOKEN` | A narrowly scoped read-only PAT. Lifts GitHub API limits; private repositories are still rejected by default. |
| `PROJECT_AUTOPSY_POSTGRES_URL` or `DATABASE_URL` | Persists saved runs. Serverless filesystems are ephemeral, so the default SQLite store will not survive between requests — use Postgres if you want saved runs/compare to work in production. |
| `PROJECT_AUTOPSY_INSPECT_RATE_LIMIT` | Requests per window per client for `/api/repositories/inspect` (default `60`; `0` disables). |
| `PROJECT_AUTOPSY_INSPECT_RATE_WINDOW_SECONDS` | Rate-limit window in seconds (default `60`). |
| `PROJECT_AUTOPSY_INSPECT_TOKEN` | If set, the inspect API requires `Authorization: Bearer <token>` (or `x-project-autopsy-inspect-token`). Leave unset for an open demo. |
| `PROJECT_AUTOPSY_ALLOW_PRIVATE_REPOSITORIES` | Defaults off. Private API inspection activates only when this is `true` and `PROJECT_AUTOPSY_INSPECT_TOKEN` is also configured. |
| `PROJECT_AUTOPSY_ALLOWED_HOSTS` | Comma-separated host allow-list for share-link construction when `PROJECT_AUTOPSY_PUBLIC_URL` is not set. |
| `PROJECT_AUTOPSY_ADMIN_TOKEN` | Gates `/ops` and `/api/worker/run`. Production mode fails closed when this is absent. |
| `PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET` | Required for GitHub App install/callback routes; signs short-lived callback state. |
| `PROJECT_AUTOPSY_MAX_*` and concurrency variables | Optional hosted ingestion ceilings. Values are clamped to the built-in safe maximums; see `.env.example` for the full list. |

> **Do not set** `PROJECT_AUTOPSY_ALLOW_LOCAL_PATHS` in production. It is a local-development-only escape hatch. Keep `PROJECT_AUTOPSY_ALLOW_PRIVATE_REPOSITORIES` off for public demos.

## Security Notes

This is an interim single-tenant perimeter. Trusted proxy-injected inspect/admin credentials gate the hosted surfaces, but the app does not yet provide per-user ownership, selective sharing, grant revocation, or tenant isolation.

Sensitive pages and API routes are served with `Cache-Control: private, no-store`. Saved reports are minimized before persistence, queued job results are minimized before storage, and legacy saved-run rows are sanitized and rewritten when they are read.

Current dependency audit status is **no high-severity audit findings**. `npm audit --omit=dev` still reports moderate advisory `GHSA-qx2v-qp2m-jg93` for `postcss` through the direct `next` dependency (`next -> postcss`, affected `postcss <8.5.10`; npm reports the affected `next` range as `9.3.4-canary.0 - 16.3.0-canary.5`). Exposure is limited because Project Autopsy does not accept or stringify attacker-supplied CSS in application routes. The intended fix is to upgrade Next.js when a patched release carries a non-vulnerable PostCSS; do not downgrade to the obsolete `next@9.3.3` audit suggestion just to force a zero-finding audit.

## Vercel

This is an npm-workspaces monorepo, and the Next.js app (`apps/web`) imports the compiled `@project-autopsy/core` package, so **core must be built before the web build runs**.

1. Import the repository into Vercel.
2. **Root Directory:** repository root, leave as `./`.
3. **Build Command:** `npm run build`. This builds `core`, then `cli`, then `next build`.
4. **Output:** Vercel detects the Next.js app at `apps/web` automatically. If detection needs a hint, set the project's framework to Next.js and the output to `apps/web/.next`.
5. Add the environment variables above. At minimum, set `PROJECT_AUTOPSY_PUBLIC_URL`; use a narrowly scoped GitHub token for higher API limits and Postgres if saved runs must persist. Set the admin token for operational routes and the callback-state secret if you configure a GitHub App.
6. Deploy, then open `/` and inspect a public repo, e.g. `https://github.com/octocat/Hello-World`.

> Alternative: set **Root Directory** to `apps/web` and a **Build Command** of `npm run build --workspace @project-autopsy/core && next build` with "Include files outside the root directory" enabled. Either layout works; the only hard requirement is that `@project-autopsy/core` is compiled before `next build`.

## Any Node Host

```bash
npm install
npm run build
cd apps/web && npx next start
```

Set the environment variables in your process manager or container, expose the port, and put it behind your own TLS-terminating proxy.

## After Deploying

Add the live URL to the README placeholder near the top, for example:

```markdown
**[Live demo](https://your-app.vercel.app)**
```
