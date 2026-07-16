# Changelog

## [0.2.0] - 2026-07-16

- Bound local and GitHub ingestion by files, bytes, requests, concurrency, and
  runtime, and surface incomplete evidence instead of silently overstating it.
- Minimize reports before hosted responses or persistence so raw source,
  manifest contents, and documentation text do not leak through saved runs.
- Harden saved-run, job, worker, operations, and GitHub App surfaces with
  no-store responses, constant-time token checks, and one-time callback state.
- Preserve an open public-repository demo while keeping private API inspection
  behind an explicit feature flag plus inspect token.
- Expand SQLite, Postgres, queue, callback, bounded-ingestion, and report
  minimization coverage to 171 tests across the core, CLI, and web workspaces.
- Keep Dependabot on mergeable minor and patch updates while major upgrades are
  handled deliberately.

## [0.1.0] - 2026-07-16

- Produce deterministic, evidence-backed repository autopsy reports through a
  shared TypeScript analysis core, CLI, Next.js UI, and API.
- Detect setup, validation, documentation, dependency, identity, ingestion,
  and momentum risks and turn them into cited revival tasks.
- Persist runs with SQLite or Postgres, compare reports, and export Markdown or
  JSON.
- Support public GitHub inspection by default, private CLI inspection, and an
  explicitly access-controlled private API mode.
- Add hosted source restrictions, shared request throttling, fail-closed
  production admin routes, and signed GitHub App callback state.
- Add deterministic fixtures, sample reports, package-surface checks, and 130+
  tests with coverage reporting.

[0.2.0]: https://github.com/Conalh/project-autopsy/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Conalh/project-autopsy/releases/tag/v0.1.0
