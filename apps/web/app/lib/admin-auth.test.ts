import { describe, expect, test } from "vitest";
import { evaluateAdminAuth } from "./admin-auth";

describe("admin auth", () => {
  test("allows access when no admin token is configured", () => {
    expect(evaluateAdminAuth(new Headers(), {})).toEqual({
      configured: false,
      required: false,
      authorized: true
    });
  });

  test("allows a matching bearer token", () => {
    const headers = new Headers({
      authorization: "Bearer secret-admin-token"
    });

    expect(evaluateAdminAuth(headers, { PROJECT_AUTOPSY_ADMIN_TOKEN: "secret-admin-token" })).toEqual({
      configured: true,
      required: true,
      authorized: true
    });
  });

  test("allows a matching admin token header", () => {
    const headers = new Headers({
      "x-project-autopsy-admin-token": "secret-admin-token"
    });

    expect(evaluateAdminAuth(headers, { PROJECT_AUTOPSY_ADMIN_TOKEN: "secret-admin-token" })).toEqual({
      configured: true,
      required: true,
      authorized: true
    });
  });

  test("denies access when the configured token is missing or wrong", () => {
    expect(evaluateAdminAuth(new Headers(), { PROJECT_AUTOPSY_ADMIN_TOKEN: "secret-admin-token" })).toEqual({
      configured: true,
      required: true,
      authorized: false
    });

    expect(
      evaluateAdminAuth(new Headers({ authorization: "Bearer wrong" }), {
        PROJECT_AUTOPSY_ADMIN_TOKEN: "secret-admin-token"
      })
    ).toEqual({
      configured: true,
      required: true,
      authorized: false
    });
  });

  test("requires admin token configuration in production or private-credential deployments", () => {
    expect(evaluateAdminAuth(new Headers(), { NODE_ENV: "production" })).toMatchObject({
      configured: false,
      required: true,
      authorized: false,
      missingConfiguration: true
    });

    expect(evaluateAdminAuth(new Headers(), { PROJECT_AUTOPSY_GITHUB_TOKEN: "github-token" })).toMatchObject({
      configured: false,
      required: true,
      authorized: false,
      missingConfiguration: true
    });
  });
});
