import { describe, expect, test } from "vitest";
import {
  assertSourceAllowed,
  evaluateInspectAuth,
  isLocalPathInspectionAllowed,
  isPrivateRepositoryInspectionAllowed,
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
    expect(result).toEqual({ configured: false, authorized: true });
  });

  test("requires a matching bearer or header token when configured", () => {
    const env = { PROJECT_AUTOPSY_INSPECT_TOKEN: "secret" };

    expect(evaluateInspectAuth(new Headers({ authorization: "Bearer secret" }), env)).toEqual({
      configured: true,
      authorized: true
    });
    expect(evaluateInspectAuth(new Headers({ "x-project-autopsy-inspect-token": "secret" }), env)).toEqual({
      configured: true,
      authorized: true
    });
    expect(evaluateInspectAuth(new Headers({ authorization: "Bearer nope" }), env)).toEqual({
      configured: true,
      authorized: false
    });
    expect(evaluateInspectAuth(new Headers(), env)).toEqual({ configured: true, authorized: false });
  });
});
