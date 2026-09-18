import { unzipSync } from "fflate";

const NES_MAGIC = [0x4e, 0x45, 0x53, 0x1a]; // NES\x1a

export function looksLikeNes(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  return NES_MAGIC.every((b, i) => bytes[i] === b);
}

export function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

/**
 * ZIP 内から .nes を1つ取り出す。複数ある場合はパス順で先頭（__MACOSX 等は除外）。
 */
export function extractNesFromZip(zipBytes: Uint8Array): { name: string; bytes: Uint8Array; alsoFound: string[] } {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zipBytes);
  } catch {
    throw new Error("ZIP を展開できませんでした");
  }

  const candidates: { path: string; data: Uint8Array }[] = [];
  for (const [path, data] of Object.entries(files)) {
    const base = basename(path);
    if (!base || base.startsWith(".")) continue;
    if (path.replace(/\\/g, "/").split("/").includes("__MACOSX")) continue;
    if (!base.toLowerCase().endsWith(".nes")) continue;
    if (!looksLikeNes(data)) continue;
    candidates.push({ path, data });
  }

  if (candidates.length === 0) {
    throw new Error("ZIP 内に有効な .nes が見つかりません");
  }

  candidates.sort((a, b) => {
    const da = a.path.replace(/\\/g, "/").split("/").length;
    const db = b.path.replace(/\\/g, "/").split("/").length;
    if (da !== db) return da - db;
    return a.path.localeCompare(b.path, "en");
  });

  const chosen = candidates[0]!;
  const name = basename(chosen.path).replace(/\.nes$/i, "") || "game";
  const alsoFound = candidates.slice(1).map((c) => basename(c.path));
  return { name, bytes: chosen.data, alsoFound };
}

export type ResolvedRom = {
  name: string;
  bytes: Uint8Array;
  /** ZIP から取り出したとき true */
  fromZip: boolean;
  note?: string;
};

/**
 * .nes または .zip（中の .nes）から ROM バイト列を解決する。
 */
export async function resolveRomFromFile(file: File): Promise<ResolvedRom> {
  const lower = file.name.toLowerCase();
  const buf = new Uint8Array(await file.arrayBuffer());

  if (lower.endsWith(".nes") || looksLikeNes(buf)) {
    if (!looksLikeNes(buf)) throw new Error("NES ROM として認識できません（ヘッダ不正）");
    const name = file.name.replace(/\.nes$/i, "") || file.name;
    return { name, bytes: buf, fromZip: false };
  }

  if (lower.endsWith(".zip") || looksLikeZip(buf)) {
    const extracted = extractNesFromZip(buf);
    const note =
      extracted.alsoFound.length > 0
        ? `ZIP 内に複数の .nes があったため「${extracted.name}.nes」を使用（他 ${extracted.alsoFound.length} 件）`
        : undefined;
    return { name: extracted.name, bytes: extracted.bytes, fromZip: true, note };
  }

  throw new Error(".nes または .zip（中に .nes）を選んでください");
}
