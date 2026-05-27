import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const coveragePackages = ["core", "cli", "web"];
const badgePath = path.resolve(".github", "badges", "coverage.json");
const checkOnly = process.argv.includes("--check");

const totals = {
  covered: 0,
  total: 0
};

for (const packageName of coveragePackages) {
  const summaryPath = path.resolve("coverage", packageName, "coverage-summary.json");
  const summary = JSON.parse(await readFile(summaryPath, "utf8"));
  const lines = summary.total?.lines;

  if (!lines || typeof lines.covered !== "number" || typeof lines.total !== "number") {
    throw new Error(`Coverage summary did not include total line coverage: ${summaryPath}`);
  }

  totals.covered += lines.covered;
  totals.total += lines.total;
}

if (totals.total === 0) {
  throw new Error("Cannot create a coverage badge from zero total lines");
}

const percent = Math.round((totals.covered / totals.total) * 1000) / 10;
const badge = {
  schemaVersion: 1,
  label: "coverage",
  message: `${percent.toFixed(1)}% lines`,
  color: selectBadgeColor(percent)
};
const expected = `${JSON.stringify(badge, null, 2)}\n`;

if (checkOnly) {
  const actual = await readFile(badgePath, "utf8");
  if (actual !== expected) {
    throw new Error(`${path.relative(process.cwd(), badgePath)} is out of date. Run npm run coverage:badge after npm run coverage.`);
  }

  console.log(`${path.relative(process.cwd(), badgePath)} is up to date`);
} else {
  await writeFile(badgePath, expected);
  console.log(`wrote ${path.relative(process.cwd(), badgePath)} (${badge.message})`);
}

function selectBadgeColor(percent) {
  if (percent >= 95) {
    return "brightgreen";
  }

  if (percent >= 90) {
    return "green";
  }

  if (percent >= 80) {
    return "yellowgreen";
  }

  if (percent >= 70) {
    return "yellow";
  }

  return "orange";
}
