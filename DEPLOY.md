# Deploying the web app

The web inspector is designed for public hosting with a conservative default source policy: it accepts public `github.com` repositories and rejects local paths and private repositories. This is one boundary, not a complete deployment guarantee; configure authentication, rate limiting, persistence, secret scope, and platform abuse controls for your environment. Local filesystem inspection stays off unless `PROJECT_AUTOPSY_ALLOW_LOCAL_PATHS=true` is set — **never set that on a public deployment**.

These notes target Vercel because it is the least-friction host for Next.js, but the app is a standard Next.js server and runs anywhere Node 24+ does.

## Environment variables

None are strictly required — with no configuration the app inspects public GitHub repos using the unauthenticated GitHub API. The following are recommended for a real deployment:

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

> **Do not set** `PROJECT_AUTOPSY_ALLOW_LOCAL_PATHS` in production. It is a local-development-only escape hatch. Keep `PROJECT_AUTOPSY_ALLOW_PRIVATE_REPOSITORIES` off for public demos.

## Vercel

This is an npm-workspaces monorepo, and the Next.js app (`apps/web`) imports the
compiled `@project-autopsy/core` package, so **core must be built before the web
build runs**.

1. Import the repository into Vercel.
2. **Root Directory:** repository root (leave as `./`).
3. **Build Command:** `npm run build` — this builds `core` (the `dist` the web app imports), then `cli`, then `next build`.
4. **Output:** Vercel detects the Next.js app at `apps/web` automatically. If detection needs a hint, set the project's framework to Next.js and the output to `apps/web/.next`.
5. Add the environment variables above. At minimum, set `PROJECT_AUTOPSY_PUBLIC_URL`; use a narrowly scoped GitHub token for higher API limits and Postgres if saved runs must persist. Set the admin token for operational routes and the callback-state secret if you configure a GitHub App.
6. Deploy, then open `/` and inspect a public repo, e.g. `https://github.com/octocat/Hello-World`.

> Alternative: set **Root Directory** to `apps/web` and a **Build Command** of
> `npm run build --workspace @project-autopsy/core && next build` (with "Include
> files outside the root directory" enabled). Either layout works; the only hard
> requirement is that `@project-autopsy/core` is compiled before `next build`.

## Any Node host

```bash
npm install
npm run build                  # builds core, cli, and the Next.js app
cd apps/web && npx next start  # serves the built app (default port 3000)
```

Set the environment variables in your process manager / container, expose the
port (default `3000`), and put it behind your own TLS-terminating proxy.

## After deploying

Add the live URL to the README — replace the placeholder near the top with, e.g.:

```markdown
**[▶ Live demo](https://your-app.vercel.app)**
```
