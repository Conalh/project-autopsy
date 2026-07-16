import { readFile } from "node:fs/promises";

const packageFiles = [
  "package.json",
  "packages/core/package.json",
  "apps/cli/package.json",
  "apps/web/package.json"
];

const packages = await Promise.all(
  packageFiles.map(async (file) => ({
    file,
    manifest: JSON.parse(await readFile(file, "utf8"))
  }))
);

const version = packages[0].manifest.version;
const githubTagVersion =
  process.env.GITHUB_REF_TYPE === "tag" || process.env.GITHUB_REF?.startsWith("refs/tags/")
    ? process.env.GITHUB_REF_NAME?.replace(/^v/, "")
    : undefined;
const expected = (process.argv[2] || githubTagVersion || version).trim();

for (const entry of packages) {
  if (entry.manifest.version !== expected) {
    throw new Error(`${entry.file} version ${entry.manifest.version} does not match ${expected}`);
  }
  if (entry.manifest.engines?.node !== ">=24") {
    throw new Error(`${entry.file} must declare Node.js >=24`);
  }
}

const cliSource = await readFile("apps/cli/src/index.ts", "utf8");
if (!cliSource.includes(`const CLI_VERSION = "${expected}"`)) {
  throw new Error(`CLI_VERSION does not match ${expected}`);
}

const changelog = await readFile("CHANGELOG.md", "utf8");
if (!changelog.includes(`## [${expected}]`)) {
  throw new Error(`CHANGELOG.md has no ${expected} release section`);
}

console.log(`release contract ok: v${expected}`);
