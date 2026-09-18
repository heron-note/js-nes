import { CLOUD_PROJECTS_DIR, CLOUD_REPO_NAME, CLOUD_ROMS_DIR } from "./githubConfig.js";
import { clearStoredToken, GithubAuthError } from "./githubAuth.js";

export type CloudFileEntry = {
  name: string;
  path: string;
  sha: string;
  size: number;
};

async function ghFetch(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`https://api.github.com${path}`, { ...init, headers });
  if (res.status === 401) {
    clearStoredToken();
    throw new GithubAuthError("GitHub セッションが無効です。再ログインしてください");
  }
  return res;
}

export async function ensureCloudRepo(token: string, ownerLogin: string): Promise<{ owner: string; repo: string }> {
  const getRes = await ghFetch(token, `/repos/${ownerLogin}/${CLOUD_REPO_NAME}`);
  if (getRes.ok) {
    return { owner: ownerLogin, repo: CLOUD_REPO_NAME };
  }
  if (getRes.status !== 404) {
    throw new GithubAuthError(`倉庫の確認に失敗しました (${getRes.status})`);
  }

  const createRes = await ghFetch(token, "/user/repos", {
    method: "POST",
    body: JSON.stringify({
      name: CLOUD_REPO_NAME,
      private: true,
      auto_init: true,
      description: "FamiJS Studio のクラウド保存（ROM / プロジェクト）",
    }),
  });
  if (!createRes.ok) {
    const text = await createRes.text();
    throw new GithubAuthError(`倉庫の作成に失敗しました (${createRes.status}): ${text}`);
  }
  return { owner: ownerLogin, repo: CLOUD_REPO_NAME };
}

async function listDir(token: string, owner: string, repo: string, dir: string): Promise<CloudFileEntry[]> {
  const res = await ghFetch(token, `/repos/${owner}/${repo}/contents/${dir}`);
  if (res.status === 404) return [];
  if (!res.ok) throw new GithubAuthError(`一覧の取得に失敗しました (${res.status})`);
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) return [];
  return data
    .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null && e.type === "file")
    .map((e) => ({
      name: String(e.name),
      path: String(e.path),
      sha: String(e.sha),
      size: Number(e.size) || 0,
    }));
}

export async function listCloudRoms(token: string, owner: string, repo: string): Promise<CloudFileEntry[]> {
  return (await listDir(token, owner, repo, CLOUD_ROMS_DIR)).filter((f) => f.name.toLowerCase().endsWith(".nes"));
}

export async function listCloudProjects(token: string, owner: string, repo: string): Promise<CloudFileEntry[]> {
  return (await listDir(token, owner, repo, CLOUD_PROJECTS_DIR)).filter(
    (f) => f.name.endsWith(".famijs.json") || f.name.endsWith(".json"),
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function textToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

async function getFileSha(token: string, owner: string, repo: string, path: string): Promise<string | undefined> {
  const res = await ghFetch(token, `/repos/${owner}/${repo}/contents/${path}`);
  if (res.status === 404) return undefined;
  if (!res.ok) throw new GithubAuthError(`ファイル確認に失敗しました (${res.status})`);
  const data = (await res.json()) as { sha?: string };
  return data.sha;
}

async function putFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  contentBase64: string,
  message: string,
): Promise<void> {
  const sha = await getFileSha(token, owner, repo, path);
  const body: Record<string, string> = { message, content: contentBase64 };
  if (sha) body.sha = sha;

  const res = await ghFetch(token, `/repos/${owner}/${repo}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new GithubAuthError(`保存に失敗しました (${res.status}): ${text}`);
  }
}

export async function saveCloudRom(
  token: string,
  owner: string,
  repo: string,
  fileName: string,
  bytes: Uint8Array,
): Promise<void> {
  const safe = sanitizeFileName(fileName.endsWith(".nes") ? fileName : `${fileName}.nes`);
  await putFile(token, owner, repo, `${CLOUD_ROMS_DIR}/${safe}`, bytesToBase64(bytes), `Save ROM ${safe}`);
}

export async function saveCloudProject(
  token: string,
  owner: string,
  repo: string,
  fileName: string,
  jsonText: string,
): Promise<void> {
  const withExt = fileName.endsWith(".json") ? fileName : `${fileName}.famijs.json`;
  const safe = sanitizeFileName(withExt);
  await putFile(token, owner, repo, `${CLOUD_PROJECTS_DIR}/${safe}`, textToBase64(jsonText), `Save project ${safe}`);
}

export async function loadCloudFileBytes(
  token: string,
  owner: string,
  repo: string,
  path: string,
): Promise<Uint8Array> {
  const res = await ghFetch(token, `/repos/${owner}/${repo}/contents/${path}`);
  if (!res.ok) throw new GithubAuthError(`読み込みに失敗しました (${res.status})`);
  const data = (await res.json()) as { content?: string; encoding?: string; download_url?: string };

  if (data.encoding === "base64" && data.content) {
    return base64ToBytes(data.content);
  }
  if (data.download_url) {
    const bin = await fetch(data.download_url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!bin.ok) throw new GithubAuthError(`ダウンロードに失敗しました (${bin.status})`);
    return new Uint8Array(await bin.arrayBuffer());
  }
  throw new GithubAuthError("ファイル内容を取得できませんでした");
}

export async function loadCloudFileText(
  token: string,
  owner: string,
  repo: string,
  path: string,
): Promise<string> {
  const bytes = await loadCloudFileBytes(token, owner, repo, path);
  return new TextDecoder().decode(bytes);
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-()\u3040-\u30ff\u3400-\u9fff]+/g, "_").slice(0, 100);
}
