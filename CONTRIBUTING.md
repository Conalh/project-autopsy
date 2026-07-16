# Contributing

Focused issues and pull requests are welcome. Project Autopsy is experimental,
so behavior and report schemas may change before 1.0.

## Local verification

Use Node.js 24 and npm:

```sh
npm ci
npm run build
npm test
npm run coverage
npm run samples:check
npm run package:check
npm audit --audit-level=high
```

Tests and deterministic sample reports must not depend on network access. Keep
live GitHub and registry behavior behind injected fetch implementations in unit
tests.

If a change affects hosted inputs, authentication, persistence, or outbound
requests, update `README.md`, `DEPLOY.md`, and `SECURITY.md` with the trust
boundary. Never commit tokens, private keys, inspected private-repository data,
or generated `.project-autopsy` databases.

By contributing, you agree that your work is licensed under the MIT License.
