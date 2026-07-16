import type { GitHubAppSetup } from "./github-app-setup";

export type SetupTone = "ok" | "warning" | "neutral";

export interface GitHubAppSetupSummary {
  label: string;
  detail: string;
  tone: SetupTone;
  actionHref: string;
  actionLabel: string;
}

export function summarizeGitHubAppSetup(setup: GitHubAppSetup): GitHubAppSetupSummary {
  if (setup.authMode === "token") {
    return {
      label: "Token auth ready",
      detail: "Authenticated GitHub API requests are configured. Hosted private access still requires explicit policy opt-in.",
      tone: "ok",
      actionHref: "/api/github-app/status",
      actionLabel: "View status"
    };
  }

  if (setup.authMode === "github_app") {
    return {
      label: "GitHub App ready",
      detail:
        setup.installationSource === "stored"
          ? "Authenticated requests can use the stored installation; private access remains policy-gated."
          : "Authenticated requests can use the configured installation; private access remains policy-gated.",
      tone: "ok",
      actionHref: "/api/github-app/status",
      actionLabel: "View status"
    };
  }

  if (setup.authMode === "github_app_install_required") {
    return {
      label: "GitHub App install needed",
      detail: setup.missing.length > 0 ? `Missing ${setup.missing.join(", ")}.` : "Install the GitHub App to enable authenticated API requests.",
      tone: "warning",
      actionHref: setup.installUrl ? "/api/github-app/install" : "/api/github-app/status",
      actionLabel: setup.installUrl ? "Install app" : "View status"
    };
  }

  return {
    label: "Public repo mode",
    detail: "Public repository inspections work without server-side GitHub credentials.",
    tone: "neutral",
    actionHref: "/api/github-app/status",
    actionLabel: "View status"
  };
}
