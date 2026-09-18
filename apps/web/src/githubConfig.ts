/** GitHub Device Flow 中継（Cloudflare Workers）の公開URL。ビルド時に埋め込む。 */
export function getAuthRelayUrl(): string {
  const raw = import.meta.env.VITE_GITHUB_AUTH_RELAY_URL as string | undefined;
  return (raw ?? "").replace(/\/$/, "");
}

export function isGithubCloudConfigured(): boolean {
  return getAuthRelayUrl().length > 0;
}

/** ユーザーの Private 倉庫名（無ければ自動作成）。 */
export const CLOUD_REPO_NAME = "herocon-data";

export const CLOUD_ROMS_DIR = "roms";
export const CLOUD_PROJECTS_DIR = "projects";

export const TOKEN_STORAGE_KEY = "famijs_github_token";
