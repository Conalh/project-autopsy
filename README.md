# Project Autopsy

Project Autopsy is a developer tool for making old, stalled, or abandoned repositories legible again.

It inspects a local repository, gathers evidence from the file tree, package manifests, documentation, and git history, then produces a Markdown autopsy report with findings, stall hypotheses, and revival tasks.

The current version is the first working CLI/core slice. It is intentionally small, deterministic, and evidence-first.

## What Works Today

- Local repository inspection
- File tree classification
- npm `package.json` manifest parsing
- README and docs discovery
- Git commit summary extraction when history is available
- First-pass detectors for:
  - project identity
  - setup risk
  - validation surface
  - docs drift
  - latest visible momentum
- Markdown report generation
- CLI command for local inspection

## Quick Start

```powershell
npm install
npm run build
node apps\cli\dist\index.js inspect . --format markdown
```

You can inspect another local repository by replacing `.` with a path:

```powershell
node apps\cli\dist\index.js inspect C:\path\to\old-repo --format markdown
```

For a deterministic demo that does not depend on the current repo state:

```powershell
npm run inspect:fixture
```

## Example Output

```markdown
# Project Autopsy: project-autopsy

## Verdict

This repo is reviveable with cleanup. 1 medium-severity issue(s) need attention.

## Top Findings

- Project identity is unclear
- No git history was available
- Validation surface detected
```

## Architecture

This is an npm workspace with a shared TypeScript analysis core and a thin CLI wrapper.

```text
apps/
  cli/              Command-line interface
packages/
  core/             Ingestion, detectors, report assembly, Markdown rendering
```

The core package owns the product behavior. The CLI only parses arguments, calls the core, and prints the report. That keeps the analysis engine reusable for a future web app or API.

## Goal 0 Status

The product skeleton is in place:

- `apps/cli`: CLI entry point and CLI behavior tests
- `packages/core`: shared TypeScript contracts, ingestion, detectors, report assembly, and Markdown rendering
- `fixtures`: durable local test repositories for npm, Python, Rust, Go, and mixed-stack projects
- `npm run inspect:fixture`: deterministic demo report from `fixtures/stalled-npm-app`

## Commands

```powershell
npm test       # Run core and CLI tests
npm run build  # Compile all workspaces
npm run check  # Build, then test
npm run inspect:fixture  # Print a deterministic fixture autopsy report
```

## Current Limits

- GitHub URL ingestion is not implemented yet.
- The CLI supports Markdown output only.
- Dependency freshness is heuristic only; it does not query package registries yet.
- Hosted mode, persistence, and the web UI are future work.
- The analyzer never runs arbitrary commands from inspected repositories.

## Next Milestones

1. Add public GitHub repository ingestion.
2. Expand manifest support beyond npm.
3. Add dependency drift rules that can query registries explicitly.
4. Save rendered sample reports for regression review.
5. Build the web report surface on top of the core output.
