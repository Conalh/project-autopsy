import type { SavedAnalysisRunSummary } from "@project-autopsy/core";

type VerdictStatus = SavedAnalysisRunSummary["verdictStatus"];
type SourceType = SavedAnalysisRunSummary["sourceType"];

export interface RunFilters {
  query: string;
  status: "" | VerdictStatus;
  sourceType: "" | SourceType;
}

export interface RunFilterOptions {
  statuses: VerdictStatus[];
  sourceTypes: SourceType[];
}

export interface RunGroup {
  key: string;
  projectName: string;
  source: string;
  runs: SavedAnalysisRunSummary[];
}

export function createRunFilters(input: {
  q?: string;
  status?: string;
  sourceType?: string;
}): RunFilters {
  return {
    query: input.q?.trim() ?? "",
    status: isVerdictStatus(input.status) ? input.status : "",
    sourceType: isSourceType(input.sourceType) ? input.sourceType : ""
  };
}

export function buildRunFilterOptions(runs: SavedAnalysisRunSummary[]): RunFilterOptions {
  return {
    statuses: uniqueSorted(runs.map((run) => run.verdictStatus)),
    sourceTypes: uniqueSorted(runs.map((run) => run.sourceType))
  };
}

export function filterRuns(runs: SavedAnalysisRunSummary[], filters: RunFilters): SavedAnalysisRunSummary[] {
  const query = filters.query.toLowerCase();

  return runs.filter((run) => {
    if (filters.status && run.verdictStatus !== filters.status) {
      return false;
    }

    if (filters.sourceType && run.sourceType !== filters.sourceType) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [run.projectName, run.source, run.id].some((value) => value.toLowerCase().includes(query));
  });
}

export function groupRunsByProjectAndSource(runs: SavedAnalysisRunSummary[]): RunGroup[] {
  const groups = new Map<string, RunGroup>();

  for (const run of runs) {
    const key = `${run.projectName}\n${run.source}`;
    const existing = groups.get(key);

    if (existing) {
      existing.runs.push(run);
    } else {
      groups.set(key, {
        key,
        projectName: run.projectName,
        source: run.source,
        runs: [run]
      });
    }
  }

  return [...groups.values()];
}

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort();
}

function isVerdictStatus(value: string | undefined): value is VerdictStatus {
  return value === "stable" || value === "needs-cleanup" || value === "at-risk";
}

function isSourceType(value: string | undefined): value is SourceType {
  return value === "local_path" || value === "github_url";
}
