import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeRepository,
  renderJsonReport,
  renderMarkdownReport
} from "../packages/core/dist/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sampleRoot = path.join(repoRoot, "docs", "sample-reports");
const stableGeneratedAt = "1970-01-01T00:00:00.000Z";
const mode = process.argv.includes("--check") ? "check" : "write";

const samples = [
  {
    name: "stalled-npm-app",
    source: path.join(repoRoot, "fixtures", "stalled-npm-app")
  }
];

await mkdir(sampleRoot, { recursive: true });

let failed = false;

for (const sample of samples) {
  const report = await analyzeRepository(sample.source);
  report.metadata.generatedAt = stableGeneratedAt;
  report.snapshot.rootPath = path.relative(repoRoot, sample.source).split(path.sep).join("/");

  await writeOrCheck(`${sample.name}.md`, renderMarkdownReport(report));
  await writeOrCheck(`${sample.name}.json`, renderJsonReport(report));
}

if (failed) {
  process.exitCode = 1;
}

async function writeOrCheck(fileName, content) {
  const filePath = path.join(sampleRoot, fileName);

  if (mode === "write") {
    await writeFile(filePath, content);
    console.log(`wrote ${path.relative(repoRoot, filePath)}`);
    return;
  }

  let existing;
  try {
    existing = await readFile(filePath, "utf8");
  } catch {
    console.error(`missing ${path.relative(repoRoot, filePath)}`);
    failed = true;
    return;
  }

  if (existing !== content) {
    console.error(`out of date ${path.relative(repoRoot, filePath)}`);
    failed = true;
  }
}
