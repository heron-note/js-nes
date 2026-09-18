/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GITHUB_AUTH_RELAY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
