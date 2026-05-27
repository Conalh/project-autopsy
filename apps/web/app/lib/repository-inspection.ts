import { analyzeAndSaveRepository, analyzeRepository } from "@project-autopsy/core";
import { resolveGitHubToken } from "./github-auth";
import { createWebRunStore } from "./run-store";

export interface RepositoryInspectionOptions {
  branch?: string;
  checkDependencyRegistry: boolean;
  token?: string;
}

export interface RepositoryInspectionJobPayload {
  source: string;
  save: boolean;
  branch?: string;
  checkDependencyRegistry: boolean;
}

export async function inspectRepository(
  source: string,
  save: boolean,
  options: RepositoryInspectionOptions
): Promise<{ run?: unknown; report: unknown }> {
  if (save) {
    const saved = await analyzeAndSaveRepository(source, {
      ...options,
      store: await createWebRunStore()
    });
    const { markdown: _markdown, json: _json, ...run } = saved;
    return { run, report: saved.report };
  }

  const report = await analyzeRepository(source, options);
  return { report };
}

export async function inspectRepositoryJobPayload(
  payload: RepositoryInspectionJobPayload
): Promise<{ run?: unknown; report: unknown }> {
  return inspectRepository(payload.source, payload.save, {
    branch: payload.branch,
    checkDependencyRegistry: payload.checkDependencyRegistry,
    token: await resolveGitHubToken()
  });
}

export function toRepositoryInspectionJobPayload(input: {
  source: string;
  save: boolean;
  branch?: string;
  checkDependencyRegistry: boolean;
}): RepositoryInspectionJobPayload {
  return {
    source: input.source,
    save: input.save,
    ...(input.branch ? { branch: input.branch } : {}),
    checkDependencyRegistry: input.checkDependencyRegistry
  };
}
