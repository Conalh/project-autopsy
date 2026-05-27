import type { Finding, RepoSnapshot } from "../types.js";

export function detectValidationSurface(snapshot: RepoSnapshot): Finding[] {
  const sourceFiles = snapshot.files.filter((file) => file.kind === "source");
  const testFiles = snapshot.files.filter((file) => file.kind === "test");

  if (sourceFiles.length > 0 && testFiles.length === 0) {
    return [
      {
        kind: "validation-surface",
        severity: "high",
        title: "Source code exists without a visible test surface",
        body: "The repository has source files, but no test files were detected.",
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
