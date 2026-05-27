# Project Autopsy

Project Autopsy is a developer tool for making old, stalled, or abandoned repositories legible again.

It inspects a local or public GitHub repository, gathers evidence from the file tree, package manifests, documentation, and git history, then produces an autopsy report with a score, verdict, findings, stall hypotheses, revival tasks, and source evidence.

The current version is a working CLI/core/web slice. It is intentionally small, deterministic, and evidence-first.

## What Works Today

- Local repository inspection
- Public GitHub repository inspection
- GitHub URL parsing with optional branch selection
- File tree classification
- npm, Python, Rust, Go, and .NET manifest parsing
- README and docs discovery
- Git commit summary extraction when history is available
- First-pass detectors for:
  - project identity
  - setup risk
  - validation surface
  - docs drift
  - latest visible momentum
- Markdown report generation
- JSON report export
- Dependency snapshot in reports
- Committed sample reports for regression review
- Opt-in npm registry freshness checks
- CLI command for local and public GitHub inspection
- Web report surface for public GitHub repos and the fixture demo
- Token-backed private GitHub repository inspection
- Hosted-style JSON API routes over the core report contract
- SQLite-backed saved analysis runs
- Recent-run loading in the CLI and web UI

## Quick Start

```powershell
npm install
npm run build
node apps\cli\dist\index.js inspect . --format markdown
```

You can inspect another local repository by replacing `.` with a path:

```powershell
node apps\cli\dist\index.js inspect C:\path\to\old-repo --format markdown
node apps\cli\dist\index.js inspect C:\path\to\old-repo --format json
```

Or inspect a public GitHub repository:

```powershell
node apps\cli\dist\index.js inspect https://github.com/octocat/Hello-World --format markdown
node apps\cli\dist\index.js inspect https://github.com/owner/repo --branch main --format markdown
```

Inspect a private GitHub repository with a token:

```powershell
node apps\cli\dist\index.js inspect https://github.com/owner/private-repo --github-token <token>
$env:PROJECT_AUTOPSY_GITHUB_TOKEN="<token>"
node apps\cli\dist\index.js inspect https://github.com/owner/private-repo
```

Opt into npm registry-backed dependency freshness checks:

```powershell
node apps\cli\dist\index.js inspect . --format markdown --check-registry
```

For a deterministic demo that does not depend on the current repo state:

```powershell
npm run inspect:fixture
npm run inspect:fixture:json
```

Save an analysis run and reload it later:

```powershell
node apps\cli\dist\index.js inspect . --format json --save
node apps\cli\dist\index.js runs
node apps\cli\dist\index.js show <run_id> --format markdown
```

Run the web app:

```powershell
npm run web:dev
```

Inspect through the local API:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/repositories/inspect -ContentType "application/json" -Body '{"source":"https://github.com/owner/repo","save":true}'
```

## Example Output

```markdown
# Project Autopsy: Stalled Notes App

## Verdict

**Score:** 17/100
**Status:** at-risk

This repo is reviveable, but 2 high-severity issue(s) should be handled before feature work.

## Top Findings

- FINDING-003: README references missing npm script: npm run dev
- FINDING-006: Source code exists without a visible test surface

## Revival Plan

- TASK-001: Phase 1: Make setup reproducible
- TASK-002: Phase 2: Restore a local validation command

## Evidence Index

- [EV-003] README.md - npm run dev
```

## Architecture

This is an npm workspace with a shared TypeScript analysis core and a thin CLI wrapper.

```text
apps/
  cli/              Command-line interface
  web/              Next.js report interface
packages/
  core/             Ingestion, detectors, report assembly, Markdown rendering
```

The core package owns the product behavior. The CLI only parses arguments, calls the core, and prints the report. That keeps the analysis engine reusable for a future web app or API.

## Current Status

Goal 0 product skeleton is in place:

- `apps/cli`: CLI entry point and CLI behavior tests
- `packages/core`: shared TypeScript contracts, ingestion, detectors, report assembly, and Markdown rendering
- `fixtures`: durable local test repositories for npm, Python, Rust, Go, and mixed-stack projects
- `npm run inspect:fixture`: deterministic demo report from `fixtures/stalled-npm-app`

Goal 1 ingestion is in place:

- Local and public GitHub sources normalize into the same snapshot/report pipeline
- GitHub ingestion reads repo metadata, recursive tree data, selected text docs, manifests, and recent commits
- Hosted ingestion does not execute project commands

Goal 3 report MVP is in place:

- Reports include `metadata`, `summary`, `verdict`, `score`, `findings`, `stallHypotheses`, `revivalTasks`, and `evidenceIndex`
- Findings and revival tasks have stable IDs
- Markdown and JSON exports use the same structured report contract

Goal 4 web surface is in place:

- The first screen is a usable public GitHub repo inspector
- The fixture demo opens the structured report without network access
- Report pages show score, hypotheses, findings, revival tasks, exports, and evidence

Goal 5 persistence is in place:

- Saved analyses are written to a local SQLite database under `.project-autopsy/`
- The CLI can save, list, and show analysis runs
- The web app can save a report and reopen recent runs from the home page

Goal 6 manifest parsing is in place:

- Python `pyproject.toml` and `requirements.txt` dependencies normalize into report data
- Rust `Cargo.toml`, Go `go.mod`, and .NET `.csproj` package references are parsed
- Markdown and web reports include a dependency snapshot for supported manifests

Goal 7 npm registry drift checks are in place:

- `--check-registry` compares npm dependencies against the npm registry `latest` dist-tag
- Major-version drift is reported as evidence-backed `dependency-drift` findings
- Registry failures produce an informational not-checked finding instead of blocking analysis

Goal 8 sample reports are in place:

- `docs/sample-reports/stalled-npm-app.md` and `.json` are committed review artifacts
- `npm run samples:update` refreshes sample reports from stable fixtures
- `npm run samples:check` fails when committed samples drift from current report output

Goal 9 private GitHub token support is in place:

- CLI inspections accept `--github-token <token>`
- CLI and web inspections read `PROJECT_AUTOPSY_GITHUB_TOKEN`
- Private or missing GitHub repositories now return an authentication-oriented error message

Goal 10 hosted API mode is in place:

- `POST /api/repositories/inspect` returns `{ report }` or `{ run, report }`
- `GET /api/runs/{id}` loads saved run JSON
- `GET /api/runs/{id}/export.md` returns saved Markdown export

## Commands

```powershell
npm test       # Run core and CLI tests
npm run build  # Compile all workspaces
npm run check  # Build, then test
npm run samples:check  # Verify committed sample reports are current
npm run samples:update  # Refresh committed sample reports after intentional report changes
npm run web:dev  # Start the Next.js report UI
npm run inspect:fixture  # Print a deterministic fixture autopsy report
npm run inspect:fixture:json  # Print the same report as JSON
node apps\cli\dist\index.js inspect . --save  # Save an analysis run
node apps\cli\dist\index.js runs  # List saved analysis runs
node apps\cli\dist\index.js inspect . --check-registry  # Check npm registry freshness
node apps\cli\dist\index.js inspect https://github.com/owner/private-repo --github-token <token>
```

## Current Limits

- Registry freshness is currently npm-only and opt-in.
- Non-npm dependency versions are parsed and reported as declared, but not checked against registries yet.
- Hosted API mode is local-first and file-backed; production auth, queues, and Postgres are future work.
- Web UI polish is future work.
- The analyzer never runs arbitrary commands from inspected repositories.
- Full GitHub App installation is not implemented yet.

## Next Milestones

1. Add report polish for timeline and dependency-focused views.
2. Extend registry-backed drift checks beyond npm.
3. Add coverage and badge polish for the public GitHub surface.
4. Add GitHub App installation for hosted/private repo access.
5. Add hosted queues and Postgres-backed run storage.
