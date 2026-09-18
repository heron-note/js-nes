import { getAuthRelayUrl, TOKEN_STORAGE_KEY } from "./githubConfig.js";

export class GithubAuthError extends Error {}

type DeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
};

type TokenSuccess = {
  access_token: string;
  token_type?: string;
  scope?: string;
};

type TokenPending = {
  error: "authorization_pending" | "slow_down" | "expired_token" | "access_denied" | string;
  error_description?: string;
  interval?: number;
};

export type GithubUser = {
  login: string;
  id: number;
  avatar_url: string;
};

export function loadStoredToken(): string | null {
  try {
    const fromLocal = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (fromLocal) return fromLocal;
    // 旧実装（sessionStorage）からの移行
    const fromSession = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (fromSession) {
      localStorage.setItem(TOKEN_STORAGE_KEY, fromSession);
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      return fromSession;
    }
    return null;
  } catch {
    return null;
  }
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  try {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function clearStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
  try {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

async function relayPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  const base = getAuthRelayUrl();
  if (!base) throw new GithubAuthError("VITE_GITHUB_AUTH_RELAY_URL が未設定です");

  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new GithubAuthError(`認証中継の応答が不正です (${res.status})`);
  }
  if (!res.ok) {
    const msg =
      typeof json === "object" && json && "error_description" in json
        ? String((json as { error_description: string }).error_description)
        : `認証中継エラー (${res.status})`;
    throw new GithubAuthError(msg);
  }
  return json;
}

/**
 * Device Flow で GitHub にログインする。
 * onUserCode: ユーザーに表示するコードと verification URL を渡す。
 */
export async function loginWithDeviceFlow(
  onUserCode: (info: { userCode: string; verificationUri: string }) => void,
  signal?: AbortSignal,
): Promise<string> {
  const started = (await relayPost("/device/code", { scope: "repo" })) as DeviceCodeResponse;
  if (!started.device_code || !started.user_code || !started.verification_uri) {
    throw new GithubAuthError("device/code の応答が不正です");
  }

  onUserCode({
    userCode: started.user_code,
    verificationUri: started.verification_uri_complete ?? started.verification_uri,
  });

  let intervalMs = Math.max(5, started.interval || 5) * 1000;
  const deadline = Date.now() + (started.expires_in || 900) * 1000;

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new GithubAuthError("ログインがキャンセルされました");
    await sleep(intervalMs, signal);

    const tokenRes = (await relayPost("/token", {
      device_code: started.device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    })) as TokenSuccess & TokenPending;

    if ("access_token" in tokenRes && tokenRes.access_token) {
      storeToken(tokenRes.access_token);
      return tokenRes.access_token;
    }

    if (tokenRes.error === "authorization_pending") continue;
    if (tokenRes.error === "slow_down") {
      intervalMs += 5000;
      continue;
    }
    if (tokenRes.error === "expired_token") {
      throw new GithubAuthError("認証コードの有効期限が切れました。もう一度やり直してください");
    }
    if (tokenRes.error === "access_denied") {
      throw new GithubAuthError("GitHub 側でアクセスが拒否されました");
    }
    throw new GithubAuthError(tokenRes.error_description || tokenRes.error || "トークン取得に失敗しました");
  }

  throw new GithubAuthError("認証がタイムアウトしました");
}

export async function fetchGithubUser(token: string): Promise<GithubUser> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    if (res.status === 401) clearStoredToken();
    throw new GithubAuthError(`GitHub ユーザー取得に失敗しました (${res.status})`);
  }
  return (await res.json()) as GithubUser;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new GithubAuthError("ログインがキャンセルされました"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new GithubAuthError("ログインがキャンセルされました"));
      },
      { once: true },
    );
  });
}
