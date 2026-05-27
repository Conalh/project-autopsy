import type { GitHubInspectionOptions } from "../ingest/github.js";
import { createSqliteRunStore } from "../store/sqlite-run-store.js";
import type { AnalysisRunStore, SavedAnalysisRun } from "../types.js";
import { analyzeRepository } from "./autopsy-report.js";
import { renderJsonReport } from "./json.js";
import { renderMarkdownReport } from "./markdown.js";

export interface AnalyzeAndSaveOptions extends GitHubInspectionOptions {
  store?: AnalysisRunStore;
}

export async function analyzeAndSaveRepository(
  source: string,
  options: AnalyzeAndSaveOptions = {}
): Promise<SavedAnalysisRun> {
  const store = options.store ?? createSqliteRunStore();
  const report = await analyzeRepository(source, options);

  return store.saveRun({
    source,
    report,
    markdown: renderMarkdownReport(report),
    json: renderJsonReport(report)
  });
}
