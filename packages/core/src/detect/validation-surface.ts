import type { Finding, ManifestRecord, RepoSnapshot } from "../types.js";

const TEST_RUNNER_PATTERN =
  /\b(vitest|jest|mocha|jasmine|ava|tap|playwright|cypress|karma|pytest|tox|nox|nptest|node --test|node:test)\b/i;

export function detectValidationSurface(snapshot: RepoSnapshot): Finding[] {
  const sourceFiles = snapshot.files.filter((file) => file.kind === "source");
  const testFiles = snapshot.files.filter((file) => file.kind === "test");

  if (testFiles.length > 0 || sourceFiles.length === 0) {
    return [
      {
        kind: "validation-surface",
        severity: "info",
        title: "Validation surface detected",
        body: "The repository includes test files or no source files were found.",
        evidence: [
          {
            kind: "file",
            path: testFiles[0]?.path,
            excerpt: `${testFiles.length} test file(s) detected`
          }
        ]
      }
    ];
  }

  // Source exists but no test files were classified. Before raising a
  // high-severity alarm, look for configured validation (test scripts, CI jobs,
  // or ecosystems with a built-in test runner) that we simply can't see as files.
  const signals = collectValidationSignals(snapshot);
  if (signals.length > 0) {
    return [
      {
        kind: "validation-surface",
        severity: "medium",
        title: "Validation is configured but no test files were detected",
        body: `Source files exist and validation appears configured (${signals.join("; ")}), but no test files were found in the tree. Confirm the tests still run and live in the repository.`,
        evidence: [
          {
            kind: "file",
            path: sourceFiles[0]?.path,
            excerpt: `${sourceFiles.length} source file(s), 0 test files; signals: ${signals.join(", ")}`
          }
        ]
      }
    ];
  }

  return [
    {
      kind: "validation-surface",
      severity: "high",
      title: "Source code exists without a visible test surface",
      body: "The repository has source files, but no test files or configured validation command were detected.",
      evidence: [
        {
          kind: "file",
          path: sourceFiles[0]?.path,
          excerpt: `${sourceFiles.length} source file(s), 0 test files`
        }
      ]
    }
  ];
}

function collectValidationSignals(snapshot: RepoSnapshot): string[] {
  const signals: string[] = [];

  if (snapshot.files.some((file) => file.kind === "workflow")) {
    signals.push("CI workflow present");
  }

  const managers = new Set(snapshot.manifests.map((manifest) => manifest.manager));

  if (snapshot.manifests.some(hasTestScript)) {
    signals.push("test script defined");
  }

  if (managers.has("python") && snapshot.manifests.some(hasPythonTestTooling)) {
    signals.push("pytest configured");
  }

  if (managers.has("rust")) {
    signals.push("`cargo test` available");
  }

  if (managers.has("go")) {
    signals.push("`go test` available");
  }

  if (managers.has("dotnet")) {
    signals.push("`dotnet test` available");
  }

  return signals;
}

function hasTestScript(manifest: ManifestRecord): boolean {
  return Object.entries(manifest.scripts).some(
    ([name, command]) => /(^|:)test(:|$)/i.test(name) || TEST_RUNNER_PATTERN.test(command)
  );
}

function hasPythonTestTooling(manifest: ManifestRecord): boolean {
  const names = [...Object.keys(manifest.dependencies), ...Object.keys(manifest.devDependencies)];
  return names.some((name) => /^(pytest|tox|nox|unittest2?|hypothesis)$/i.test(name));
}
