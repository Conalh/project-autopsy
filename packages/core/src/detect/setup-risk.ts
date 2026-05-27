import type { Finding, ManifestRecord, RepoSnapshot } from "../types.js";

export function detectSetupRisk(snapshot: RepoSnapshot): Finding[] {
  const findings: Finding[] = [];
  const npmManifest = snapshot.manifests.find((manifest) => manifest.manager === "npm");

  if (npmManifest) {
    findings.push(...detectMissingReadmeScripts(snapshot, npmManifest));
    findings.push(...detectMissingLockfile(snapshot, npmManifest));
    findings.push(...detectMissingTestScript(npmManifest));
  }

  return findings;
}

function detectMissingReadmeScripts(snapshot: RepoSnapshot, npmManifest: ManifestRecord): Finding[] {
  const findings: Finding[] = [];
  const readme = snapshot.docs.find((doc) => doc.path.toLowerCase() === "readme.md");
  if (!readme) {
    return findings;
  }

  const commands = [...readSetupInstructionText(readme.content).matchAll(/npm\s+run\s+([a-zA-Z0-9:_-]+)/g)];
  for (const command of commands) {
    const scriptName = command[1];
    if (scriptName && !npmManifest.scripts[scriptName]) {
      findings.push({
        kind: "setup-risk",
        severity: "high",
        title: `README references missing npm script: npm run ${scriptName}`,
        body: `The setup instructions mention \`npm run ${scriptName}\`, but package.json does not define a "${scriptName}" script.`,
        evidence: [
          {
            kind: "docs",
            path: readme.path,
            excerpt: `npm run ${scriptName}`
          },
          {
            kind: "manifest",
            path: npmManifest.path,
            excerpt: `Available scripts: ${Object.keys(npmManifest.scripts).join(", ") || "none"}`
          }
        ]
      });
    }
  }

  return findings;
}

function readSetupInstructionText(content: string): string {
  const sections = content.split(/(?=^#{2,3}\s+)/m);
  const setupSections = sections.filter((section) => {
    const heading = section.match(/^#{2,3}\s+(.+)$/m)?.[1] ?? "";
    return /setup|install|run|usage|getting started|development/i.test(heading);
  });

  if (setupSections.length === 0) {
    return content;
  }

  return setupSections.join("\n");
}

function detectMissingLockfile(snapshot: RepoSnapshot, npmManifest: ManifestRecord): Finding[] {
  const hasDependencies =
    Object.keys(npmManifest.dependencies).length > 0 ||
    Object.keys(npmManifest.devDependencies).length > 0;
  const hasLockfile = snapshot.files.some((file) =>
    ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb"].includes(file.path)
  );

  if (!hasDependencies || hasLockfile) {
    return [];
  }

  return [
    {
      kind: "setup-risk",
      severity: "medium",
      title: "Dependencies exist without a lockfile",
      body: "The project declares npm dependencies but does not include a recognized lockfile, so installs may drift.",
      evidence: [
        {
          kind: "manifest",
          path: npmManifest.path,
          excerpt: "package.json declares dependencies or devDependencies"
        }
      ]
    }
  ];
}

function detectMissingTestScript(npmManifest: ManifestRecord): Finding[] {
  if (npmManifest.scripts.test) {
    return [];
  }

  return [
    {
      kind: "setup-risk",
      severity: "medium",
      title: "No npm test script is defined",
      body: "The package has scripts, but no standard local validation command.",
      evidence: [
        {
          kind: "manifest",
          path: npmManifest.path,
          excerpt: `Available scripts: ${Object.keys(npmManifest.scripts).join(", ") || "none"}`
        }
      ]
    }
  ];
}
