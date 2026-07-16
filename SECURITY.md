# Security policy

Project Autopsy is experimental software and should be deployed with scoped
credentials, platform-level rate limits, and isolated persistence.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting from the repository
Security tab. Do not open a public issue for a suspected vulnerability.

Include the affected commit or version, deployment mode, request/source used,
observed result, expected result, and a minimal reproduction when possible.

## Supported versions

The latest tagged release and `main` are supported while the project is
experimental. Security fixes are not backported to older tags.

## Important boundaries

- Hosted inspection is public-GitHub-only by default. Private API inspection
  requires both an explicit policy opt-in and inspect-token authentication.
- Local filesystem inspection is a development-only opt-in and must not be
  enabled on a public deployment.
- Production admin routes fail closed without `PROJECT_AUTOPSY_ADMIN_TOKEN`.
- GitHub App install/callback routes require signed callback state.
- The built-in rate limiter is per process. Multi-instance deployments need a
  shared or platform-level limiter.
- Reports may include repository documentation, manifest data, paths, and
  commit metadata. Treat saved reports with the same sensitivity as the source.
