# Project Autopsy: Stalled Notes App

## Verdict

**Score:** 17/100
**Status:** at-risk

This repo is reviveable, but 2 high-severity issue(s) should be handled before feature work.

## Project Snapshot

- Source: local_path
- Files inspected: 4
- Latest commit: No commit history found
- Technologies: next, npm, typescript

## Dependency Snapshot

- **package.json** (npm)
  Dependencies: next ^12.0.0
  Dev dependencies: typescript ^4.9.0
  Scripts: build tsc

## Stall Hypotheses

1. **The project likely stalled around reproducibility and validation** (medium confidence)
   The highest severity findings point to setup instructions or local validation being unreliable.

2. **The documentation may have drifted away from the actual repository** (medium confidence)
   The docs reference files or surfaces that are absent from the inspected file tree.

## Top Findings

- **FINDING-001: Project identity: Stalled Notes App** (info)
  A small note-taking app for developers who want a local scratchpad beside their editor.
  Evidence: [EV-001]

- **FINDING-002: No git history was available** (low)
  The analyzer could not read commit history for this local path.
  Evidence: [EV-002]

- **FINDING-003: README references missing npm script: npm run dev** (high)
  The setup instructions mention `npm run dev`, but package.json does not define a "dev" script.
  Evidence: [EV-003], [EV-004]

- **FINDING-004: Dependencies exist without a lockfile** (medium)
  The project declares npm dependencies but does not include a recognized lockfile, so installs may drift.
  Evidence: [EV-005]

- **FINDING-005: No npm test script is defined** (medium)
  The package has scripts, but no standard local validation command.
  Evidence: [EV-006]

- **FINDING-006: Source code exists without a visible test surface** (high)
  The repository has source files, but no test files were detected.
  Evidence: [EV-007]

- **FINDING-007: Documented file is missing: docs/dashboard.png** (medium)
  Documentation references `docs/dashboard.png`, but that file was not found in the repository snapshot.
  Evidence: [EV-008]

## Revival Plan

- **TASK-001: Phase 1: Make setup reproducible**
  Fix the setup and install risks before adding product behavior.
  Files: README.md, package.json
  Evidence: [EV-003], [EV-004], [EV-005], [EV-006]
  Verify: `npm install && npm run build`
  Expected: Dependencies install from a lockfile and the documented build command works.

- **TASK-002: Phase 2: Restore a local validation command**
  A revival needs one command that proves the current baseline.
  Files: src/index.ts
  Evidence: [EV-007]
  Verify: `npm test`
  Expected: A repeatable test command exists and reports a clear result.

- **TASK-003: Phase 5: Clean stale public documentation**
  Portfolio or handoff readers should not hit missing files from the README.
  Files: README.md
  Evidence: [EV-008]
  Verify: `Search README and docs links for missing local references`
  Expected: Documented files either exist or the references are removed.

## Evidence Index

- **[EV-001]** README.md - A small note-taking app for developers who want a local scratchpad beside their editor.
- **[EV-002]** commit - git log returned no commits
- **[EV-003]** README.md - npm run dev
- **[EV-004]** package.json - Available scripts: build
- **[EV-005]** package.json - package.json declares dependencies or devDependencies
- **[EV-006]** package.json - Available scripts: build
- **[EV-007]** src/index.ts - 1 source file(s), 0 test files
- **[EV-008]** README.md - docs/dashboard.png
