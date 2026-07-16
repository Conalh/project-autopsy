import type {
  CompletenessStatus,
  InspectionBudgetOverrides,
  InspectionBudgets
} from "../types.js";

export const DEFAULT_INGESTION_BUDGETS: InspectionBudgets = {
  maxFiles: 20_000,
  maxDepth: 50,
  maxTotalBytes: 256 * 1024 * 1024,
  maxManifests: 200,
  maxManifestBytes: 1024 * 1024,
  maxDocs: 80,
  maxDocBytes: 512 * 1024,
  maxTotalDocBytes: 4 * 1024 * 1024,
  maxCommits: 20,
  maxHttpRequests: 500,
  maxResponseBytes: 16 * 1024 * 1024,
  concurrency: 6,
  registryConcurrency: 8,
  maxRuntimeMs: 60_000,
  fetchTimeoutMs: 15_000
};

export interface InspectionBudgetContext {
  budgets: InspectionBudgets;
  startedAt: number;
  deadlineAt: number;
}

export function resolveIngestionBudgets(overrides: InspectionBudgetOverrides = {}): InspectionBudgets {
  return {
    ...DEFAULT_INGESTION_BUDGETS,
    ...Object.fromEntries(
      Object.entries(overrides).map(([key, value]) => [key, normalizeBudgetValue(value)])
    )
  };
}

export function createInspectionBudgetContext(
  overrides: InspectionBudgetOverrides = {},
  startedAt = Date.now()
): InspectionBudgetContext {
  const budgets = resolveIngestionBudgets(overrides);
  return {
    budgets,
    startedAt,
    deadlineAt: startedAt + budgets.maxRuntimeMs
  };
}

export function getRemainingRuntimeMs(context: InspectionBudgetContext): number {
  return Math.max(1, context.deadlineAt - Date.now());
}

export function isRuntimeExpired(context: InspectionBudgetContext): boolean {
  return Date.now() >= context.deadlineAt;
}

export function completenessStatus(skipped: number, reasons: readonly string[] = []): CompletenessStatus {
  return skipped > 0 || reasons.length > 0 ? "partial" : "complete";
}

export function uniqueReasons(reasons: Iterable<string>): string[] {
  return [...new Set(reasons)].sort();
}

function normalizeBudgetValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(1, Math.floor(value));
}
