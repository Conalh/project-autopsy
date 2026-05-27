import type { GitHubInspectionOptions } from "../ingest/github.js";
import { createSqliteRunStore } from "../store/sqlite-run-store.js";
import type { AnalysisRunStore, AsyncAnalysisRunStore, SavedAnalysisRun } from "../types.js";
import { analyzeRepository } from "./autopsy-report.js";
import { renderJsonReport } from "./json.js";
import { renderMarkdownReport } from "./markdown.js";

export interface AnalyzeAndSaveOptions extends GitHubInspectionOptions {
  store?: AnalysisRunStore | AsyncAnalysisRunStore;
}

export async function analyzeAndSaveRepository(
  source: string,
  options: AnalyzeAndSaveOptions = {}
): Promise<SavedAnalysisRun> {
  const store = options.store ?? createSqliteRunStore();
  const report = await analyzeRepository(source, options);

  return await store.saveRun({
    source,
    report,
    markdown: renderMarkdownReport(report),
    json: renderJsonReport(report)
  });
}
