# Fixtures

These tiny repositories are committed test inputs for Project Autopsy.

They are intentionally incomplete. Each one gives the analyzer a stable shape to inspect without cloning external repositories or depending on network access.

## Included

- `stalled-npm-app`: npm app with broken setup docs, no tests, and a missing screenshot reference.
- `python-service`: Python service skeleton with a `pyproject.toml`.
- `rust-cli`: Rust CLI skeleton with a `Cargo.toml`.
- `go-worker`: Go worker skeleton with a `go.mod`.
- `mixed-stack`: TypeScript plus Python prototype.

## Demo

After building the CLI:

```powershell
npm run inspect:fixture
```
