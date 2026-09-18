export type SampleRomGroup = "sample" | "gpl" | "test";

/** 何のための ROM か（UI の分類・説明用） */
export type SampleRomKind = "game" | "demo" | "tool" | "template" | "test";

export type SampleRomEntry = {
  id: string;
  file: string;
  title: string;
  author: string;
  license: string;
  mapper: number;
  group: SampleRomGroup;
  /** 用途カテゴリ（無い古い catalog では推定） */
  kind?: SampleRomKind;
  /** なにものか（日本語） */
  summary?: string;
  /** どう使うか（日本語） */
  howto?: string;
};

export type SampleRomCatalog = {
  version: number;
  note?: string;
  roms: SampleRomEntry[];
};

function catalogUrl(): string {
  const base = import.meta.env.BASE_URL || "./";
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}sample-roms/catalog.json`;
}

function romUrl(file: string): string {
  const base = import.meta.env.BASE_URL || "./";
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}sample-roms/${encodeURIComponent(file)}`;
}

let catalogCache: SampleRomCatalog | null = null;

/** カタログ JSON のみ軽くキャッシュ（ROM 本体は都度取得・保持しない） */
export async function loadSampleCatalog(force = false): Promise<SampleRomCatalog> {
  if (catalogCache && !force) return catalogCache;
  const res = await fetch(catalogUrl(), { cache: "no-store" });
  if (!res.ok) throw new Error(`サンプル一覧の取得に失敗しました (${res.status})`);
  const json = (await res.json()) as SampleRomCatalog;
  if (!json || !Array.isArray(json.roms)) throw new Error("サンプル一覧の形式が不正です");
  catalogCache = json;
  return json;
}

/**
 * 選択したサンプルを都度ダウンロードして返す。呼び出し側はロード後に参照を捨ててよい
 * （永続化・GitHub 倉庫への保存はしない）。
 */
export async function fetchSampleRomBytes(entry: SampleRomEntry): Promise<Uint8Array> {
  const res = await fetch(romUrl(entry.file), { cache: "no-store" });
  if (!res.ok) throw new Error(`「${entry.title}」の取得に失敗しました (${res.status})`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}
