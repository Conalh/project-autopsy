type GitHubAppSetupEnv = Record<string, string | undefined>;

export type GitHubAuthMode = "none" | "token" | "github_app_install_required" | "github_app";

export interface GitHubAppSetup {
  authMode: GitHubAuthMode;
  readyForPrivateRepos: boolean;
  installUrl?: string;
  missing: string[];
}

export function getGitHubAppSetup(env: GitHubAppSetupEnv = process.env): GitHubAppSetup {
  if (readEnv(env, "PROJECT_AUTOPSY_GITHUB_TOKEN")) {
    return {
      authMode: "token",
      readyForPrivateRepos: true,
      missing: []
    };
  }

  const appId = readEnv(env, "PROJECT_AUTOPSY_GITHUB_APP_ID");
  const installationId = readEnv(env, "PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_ID");
  const privateKey =
    readEnv(env, "PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY") ??
    readEnv(env, "PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY_PATH");
  const installUrl = readInstallUrl(env);
  const missing = [
    ...(!appId ? ["PROJECT_AUTOPSY_GITHUB_APP_ID"] : []),
    ...(!installationId ? ["PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_ID"] : []),
    ...(!privateKey ? ["PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY or PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY_PATH"] : [])
  ];

  if (appId && privateKey && installationId) {
    return {
      authMode: "github_app",
      readyForPrivateRepos: true,
      installUrl,
      missing: []
    };
  }

  if (appId || privateKey || installUrl) {
    return {
      authMode: "github_app_install_required",
      readyForPrivateRepos: false,
      installUrl,
      missing
    };
  }

  return {
    authMode: "none",
    readyForPrivateRepos: false,
    missing
  };
}

function readInstallUrl(env: GitHubAppSetupEnv): string | undefined {
  const explicitUrl = readEnv(env, "PROJECT_AUTOPSY_GITHUB_APP_INSTALL_URL");
  if (explicitUrl) {
    return explicitUrl;
  }

  const slug = readEnv(env, "PROJECT_AUTOPSY_GITHUB_APP_SLUG");
  return slug ? `https://github.com/apps/${encodeURIComponent(slug)}/installations/new` : undefined;
}

function readEnv(env: GitHubAppSetupEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}
