import { describe, expect, test } from "vitest";
import { DEFAULT_INGESTION_BUDGETS } from "@project-autopsy/core";
import {
  assertSourceAllowed,
  evaluateInspectAuth,
  isLocalPathInspectionAllowed,
  isPrivateRepositoryInspectionAllowed,
  readHostedInspectionBudgets,
  SourceNotAllowedError
} from "./source-policy";

describe("source policy", () => {
  test("always allows github.com URLs", () => {
    expect(() => assertSourceAllowed("https://github.com/acme/widget", {})).not.toThrow();
  });

  test("rejects local paths by default", () => {
    expect(() => assertSourceAllowed("/etc/passwd", {})).toThrow(SourceNotAllowedError);
    expect(() => assertSourceAllowed("../../secrets", {})).toThrow(SourceNotAllowedError);
  });

  test("allows local paths only when explicitly enabled", () => {
    const env = { PROJECT_AUTOPSY_ALLOW_LOCAL_PATHS: "true" };
    expect(isLocalPathInspectionAllowed(env)).toBe(true);
    expect(() => assertSourceAllowed("/srv/repo", env)).not.toThrow();
  });

  test("requires both an explicit opt-in and inspect auth for private hosted repositories", () => {
    expect(isPrivateRepositoryInspectionAllowed({ PROJECT_AUTOPSY_ALLOW_PRIVATE_REPOSITORIES: "true" })).toBe(false);
    expect(isPrivateRepositoryInspectionAllowed({ PROJECT_AUTOPSY_INSPECT_TOKEN: "access-token" })).toBe(false);
    expect(
      isPrivateRepositoryInspectionAllowed({
        PROJECT_AUTOPSY_ALLOW_PRIVATE_REPOSITORIES: "true",
        PROJECT_AUTOPSY_INSPECT_TOKEN: "access-token"
      })
    ).toBe(true);
  });
});

describe("inspect auth", () => {
  test("is open when no token is configured", () => {
    const result = evaluateInspectAuth(new Headers(), {});
    expect(result).toEqual({ configured: false, required: false, authorized: true });
  });

  test("requires a matching bearer or header token when configured", () => {
    const env = { PROJECT_AUTOPSY_INSPECT_TOKEN: "secret" };

    expect(evaluateInspectAuth(new Headers({ authorization: "Bearer secret" }), env)).toEqual({
      configured: true,
      required: true,
      authorized: true
    });
    expect(evaluateInspectAuth(new Headers({ "x-project-autopsy-inspect-token": "secret" }), env)).toEqual({
      configured: true,
      required: true,
      authorized: true
    });
    expect(evaluateInspectAuth(new Headers({ authorization: "Bearer nope" }), env)).toEqual({
      configured: true,
      required: true,
      authorized: false
    });
    expect(evaluateInspectAuth(new Headers(), env)).toEqual({ configured: true, required: true, authorized: false });
  });

  test("stays open for public-only inspection when a GitHub rate-limit token is configured", () => {
    expect(
      evaluateInspectAuth(new Headers(), {
        PROJECT_AUTOPSY_GITHUB_TOKEN: "github-token"
      })
    ).toEqual({
      configured: false,
      required: false,
      authorized: true
    });

    expect(
      evaluateInspectAuth(new Headers({ authorization: "Bearer inspect-secret" }), {
        PROJECT_AUTOPSY_GITHUB_TOKEN: "github-token",
        PROJECT_AUTOPSY_INSPECT_TOKEN: "inspect-secret"
      })
    ).toEqual({
      configured: true,
      required: true,
      authorized: true
    });
  });
});

describe("hosted inspection budgets", () => {
  test("clamps configured budget values to safe maximums", () => {
    expect(
      readHostedInspectionBudgets({
        PROJECT_AUTOPSY_MAX_FILES: String(DEFAULT_INGESTION_BUDGETS.maxFiles + 1000),
        PROJECT_AUTOPSY_MAX_RUNTIME_MS: String(DEFAULT_INGESTION_BUDGETS.maxRuntimeMs + 1000),
        PROJECT_AUTOPSY_MAX_RESPONSE_BYTES: "0",
        PROJECT_AUTOPSY_REGISTRY_CONCURRENCY: "2"
      })
    ).toEqual({
      maxFiles: DEFAULT_INGESTION_BUDGETS.maxFiles,
      maxRuntimeMs: DEFAULT_INGESTION_BUDGETS.maxRuntimeMs,
      registryConcurrency: 2
    });
  });
});
