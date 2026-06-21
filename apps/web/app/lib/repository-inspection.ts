import {
  analyzeRepository,
  createExternalAutopsyReport,
  renderJsonReport,
  renderMarkdownReport
} from "@project-autopsy/core";
import type { InspectionBudgetOverrides } from "@project-autopsy/core";
import { resolveGitHubToken } from "./github-auth";
import { createWebRunStore } from "./run-store";

export interface RepositoryInspectionOptions {
  branch?: string;
  checkDependencyRegistry: boolean;
  token?: string;
  budgets?: InspectionBudgetOverrides;
}

export interface RepositoryInspectionJobPayload {
  source: string;
  save: boolean;
  branch?: string;
  checkDependencyRegistry: boolean;
  budgets?: InspectionBudgetOverrides;
}

export async function inspectRepository(
  source: string,
  save: boolean,
  options: RepositoryInspectionOptions
): Promise<{ run?: unknown; report: unknown }> {
  const report = createExternalAutopsyReport(await analyzeRepository(source, options));

  if (save) {
    const saved = await (await createWebRunStore()).saveRun({
      source,
      report,
      markdown: renderMarkdownReport(report),
      json: renderJsonReport(report)
    });
    const { markdown: _markdown, json: _json, ...run } = saved;
    return { run, report: saved.report };
  }

  return { report };
}

export async function inspectRepositoryJobPayload(
  payload: RepositoryInspectionJobPayload
): Promise<{ run?: unknown; report: unknown }> {
  return inspectRepository(payload.source, payload.save, {
    branch: payload.branch,
    checkDependencyRegistry: payload.checkDependencyRegistry,
    token: await resolveGitHubToken(),
    budgets: payload.budgets
  });
}

export function toRepositoryInspectionJobPayload(input: {
  source: string;
  save: boolean;
  branch?: string;
  checkDependencyRegistry: boolean;
  budgets?: InspectionBudgetOverrides;
}): RepositoryInspectionJobPayload {
  return {
    source: input.source,
    save: input.save,
    ...(input.branch ? { branch: input.branch } : {}),
    checkDependencyRegistry: input.checkDependencyRegistry,
    ...(input.budgets ? { budgets: input.budgets } : {})
  };
}
