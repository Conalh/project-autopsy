# Deploying the web app

The web inspector is safe to host only behind an access boundary. Hosted mode rejects local filesystem paths by default, but production deployments and deployments with private GitHub credentials also require explicit inspect/admin tokens before inspection, saved-run, job, worker, operations, or GitHub App setup routes return data. Do not deploy a public instance with private-repository credentials unless those token gates are configured and enforced by your client or auth proxy.

Local filesystem inspection stays off unless `PROJECT_AUTOPSY_ALLOW_LOCAL_PATHS=true` is set. **Never set that on a public deployment.**

These notes target Vercel because it is the least-friction host for Next.js, but the app is a standard Next.js server and runs anywhere Node 24+ does.

## Environment Variables

For a production deployment, configure both access tokens:

| Variable | Why |
| --- | --- |
| `PROJECT_AUTOPSY_INSPECT_TOKEN` | Required in production and whenever private GitHub credentials are configured. Gates `/report`, `/api/repositories/inspect`, saved-run pages/APIs, share pages, comparisons, and job polling. Send it as `Authorization: Bearer <token>` or `x-project-autopsy-inspect-token`. Browser UI access should normally be placed behind an auth proxy that injects this header. |
| `PROJECT_AUTOPSY_ADMIN_TOKEN` | Required in production and whenever private credentials or Postgres are configured. Gates `/ops`, `/api/worker/run`, and GitHub App install/status setup routes. Send it as `Authorization: Bearer <token>` or `x-project-autopsy-admin-token`. |
| `PROJECT_AUTOPSY_PUBLIC_URL` | Canonical base URL, such as `https://your-app.vercel.app`. Makes share links absolute and avoids trusting forwarded `Host` headers. |
| `PROJECT_AUTOPSY_GITHUB_TOKEN` | A read-only PAT. Lifts the GitHub API rate limit from 60 to 5,000 requests/hour, but may allow private-repository reads depending on token scope. Requires `PROJECT_AUTOPSY_INSPECT_TOKEN`. |
| `PROJECT_AUTOPSY_POSTGRES_URL` or `DATABASE_URL` | Persists saved runs. Serverless filesystems are ephemeral, so the default SQLite store will not survive between requests. Use Postgres if you want saved runs/compare to work in production. |
| `PROJECT_AUTOPSY_INSPECT_RATE_LIMIT` | Requests per window per client for `/api/repositories/inspect` and `/report`; default `60`, and `0` disables. |
| `PROJECT_AUTOPSY_INSPECT_RATE_WINDOW_SECONDS` | Rate-limit window in seconds; default `60`. |
| `PROJECT_AUTOPSY_ALLOWED_HOSTS` | Comma-separated host allow-list for share-link construction when `PROJECT_AUTOPSY_PUBLIC_URL` is not set. |
| `PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET` | Required before a private-capable GitHub App installation can be persisted. Use a long random value. |

> **Do not set** `PROJECT_AUTOPSY_ALLOW_LOCAL_PATHS` in production. It is a local-development-only escape hatch.

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
5. Add the environment variables above. At minimum, set `PROJECT_AUTOPSY_INSPECT_TOKEN`, `PROJECT_AUTOPSY_ADMIN_TOKEN`, and `PROJECT_AUTOPSY_PUBLIC_URL`; add Postgres if you want saved runs to persist. Only add GitHub private credentials after the inspect/admin gates are in place.
6. Deploy behind an auth proxy or client that sends the required inspect/admin headers, then inspect a public repo such as `https://github.com/octocat/Hello-World`.

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
