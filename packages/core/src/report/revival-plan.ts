import type { Finding, ManifestRecord, RepoSnapshot, RevivalTask } from "../types.js";
import { formatId } from "./evidence.js";

export function createRevivalTasks(findings: Finding[], snapshot: RepoSnapshot): RevivalTask[] {
  const tasks: Omit<RevivalTask, "id">[] = [];
  const setupCommand = deriveSetupCommand(snapshot.manifests);
  const validationCommand = deriveValidationCommand(snapshot.manifests);

  if (findings.some((finding) => finding.kind === "setup-risk")) {
    tasks.push({
      phase: "Phase 1",
      title: "Make setup reproducible",
      rationale: "Fix the setup and install risks before adding product behavior.",
      files: collectEvidencePaths(findings, "setup-risk"),
      evidenceIds: collectEvidenceIds(findings, "setup-risk"),
      verificationCommand: setupCommand,
      expectedResult: "Dependencies install from a lockfile and the documented build command works.",
      priority: 1
    });
  }

  if (findings.some((finding) => finding.kind === "validation-surface" && finding.severity !== "info")) {
    tasks.push({
      phase: "Phase 2",
      title: "Restore a local validation command",
      rationale: "A revival needs one command that proves the current baseline.",
      files: collectEvidencePaths(findings, "validation-surface"),
      evidenceIds: collectEvidenceIds(findings, "validation-surface"),
      verificationCommand: validationCommand,
      expectedResult: "A repeatable test command exists and reports a clear result.",
      priority: 2
    });
  }

  if (findings.some((finding) => finding.kind === "docs-drift")) {
    tasks.push({
      phase: "Phase 5",
      title: "Clean stale public documentation",
      rationale: "Portfolio or handoff readers should not hit missing files from the README.",
      files: collectEvidencePaths(findings, "docs-drift"),
      evidenceIds: collectEvidenceIds(findings, "docs-drift"),
      verificationCommand: "Search README and docs links for missing local references",
      expectedResult: "Documented files either exist or the references are removed.",
      priority: 5
    });
  }

  if (tasks.length === 0) {
    tasks.push({
      phase: "Phase 0",
      title: "Preserve and inspect",
      rationale: "The first-pass report did not find urgent risks, so start with a clean baseline.",
      files: [],
      evidenceIds: [],
      verificationCommand: "git status --short",
      expectedResult: "The repository state is understood before making revival changes.",
      priority: 0
    });
  }

  return tasks.map((task, index) => ({
    ...task,
    id: formatId("TASK", index + 1)
  }));
}

function collectEvidencePaths(findings: Finding[], kind: string): string[] {
  return [
    ...new Set(
      findings
        .filter((finding) => finding.kind === kind)
        .flatMap((finding) => finding.evidence.map((item) => item.path))
        .filter((item): item is string => Boolean(item))
    )
  ];
}

function collectEvidenceIds(findings: Finding[], kind: string): string[] {
  return findings
    .filter((finding) => finding.kind === kind)
    .flatMap((finding) => finding.evidenceIds ?? []);
}

// Verification commands must match the actual ecosystem; a Python/Go/Rust repo
// should never be told to run `npm test`.
const ECOSYSTEM_PRIORITY: ManifestRecord["manager"][] = ["npm", "python", "rust", "go", "dotnet"];

function selectPrimaryManager(manifests: ManifestRecord[]): ManifestRecord["manager"] | undefined {
  const usable = manifests.filter((manifest) => !manifest.parseError);
  const rootManagers = new Set(usable.filter((m) => !m.path.includes("/")).map((m) => m.manager));
  const allManagers = new Set(usable.map((m) => m.manager));

  return (
    ECOSYSTEM_PRIORITY.find((manager) => rootManagers.has(manager)) ??
    ECOSYSTEM_PRIORITY.find((manager) => allManagers.has(manager))
  );
}

function findPrimaryManifest(
  manifests: ManifestRecord[],
  manager: ManifestRecord["manager"]
): ManifestRecord | undefined {
  const matching = manifests.filter((m) => m.manager === manager && !m.parseError);
  return matching.find((m) => !m.path.includes("/")) ?? matching[0];
}

function deriveSetupCommand(manifests: ManifestRecord[]): string {
  const manager = selectPrimaryManager(manifests);

  switch (manager) {
    case "npm": {
      const manifest = findPrimaryManifest(manifests, "npm");
      return manifest?.scripts.build ? "npm install && npm run build" : "npm install";
    }
    case "python": {
      const manifest = findPrimaryManifest(manifests, "python");
      return manifest?.path.toLowerCase().endsWith("requirements.txt")
        ? "pip install -r requirements.txt"
        : "pip install -e .";
    }
    case "rust":
      return "cargo build";
    case "go":
      return "go build ./...";
    case "dotnet":
      return "dotnet build";
    default:
      return "Follow the README setup instructions to install dependencies and build.";
  }
}

function deriveValidationCommand(manifests: ManifestRecord[]): string {
  const manager = selectPrimaryManager(manifests);

  switch (manager) {
    case "npm":
      return "npm test";
    case "python":
      return "pytest";
    case "rust":
      return "cargo test";
    case "go":
      return "go test ./...";
    case "dotnet":
      return "dotnet test";
    default:
      return "Run the project's documented test command.";
  }
}
