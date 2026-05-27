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
      detail: "Private repository inspections can use the configured token.",
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
          ? "Private repository inspections can use the stored installation."
          : "Private repository inspections can use the configured installation.",
      tone: "ok",
      actionHref: "/api/github-app/status",
      actionLabel: "View status"
    };
  }

  if (setup.authMode === "github_app_install_required") {
    return {
      label: "GitHub App install needed",
      detail: setup.missing.length > 0 ? `Missing ${setup.missing.join(", ")}.` : "Install the GitHub App to inspect private repositories.",
      tone: "warning",
      actionHref: setup.installUrl ? "/api/github-app/install" : "/api/github-app/status",
      actionLabel: setup.installUrl ? "Install app" : "View status"
    };
  }

  return {
    label: "Public repo mode",
    detail: "Public repository inspections work now; private repositories need a token or GitHub App setup.",
    tone: "neutral",
    actionHref: "/api/github-app/status",
    actionLabel: "View status"
  };
}
