/**
 * 配布用スタンドアロンHTML書き出し（M6）。
 * ビルド時に生成される `standalone-template.html`（本アプリのindex.htmlをJS/CSSまで
 * 1ファイルに埋め込んだもの、scripts/inline-standalone.mjs 参照）を取得し、
 * 埋め込みプレースホルダーを現在ビルドしたROM/ソースコードで置換して単体HTMLとして書き出す。
 *
 * 制約: `npm run dev` の開発サーバーではテンプレート（本番ビルド成果物）が存在しないため、
 * この機能は `npm run build` 後の配信（例: GitHub Pages）でのみ動作する。
 */

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export class StandaloneExportError extends Error {}

const EMBEDDED_DATA_PATTERN = /(<script id="embedded-data" type="application\/json">)([\s\S]*?)(<\/script>)/;

export async function exportStandaloneHtml(rom: Uint8Array, source: string, filename: string): Promise<void> {
  const res = await fetch("./standalone-template.html");
  if (!res.ok) {
    throw new StandaloneExportError(
      "standalone-template.html が見つかりません。この機能は `npm run build` の本番ビルド後のみ利用できます（開発サーバーでは未対応）。",
    );
  }
  const template = await res.text();
  const romBase64 = toBase64(rom);
  const payload = JSON.stringify({ rom: romBase64, source });

  if (!EMBEDDED_DATA_PATTERN.test(template)) {
    throw new StandaloneExportError("テンプレート内に埋め込み用データブロックが見つかりませんでした。");
  }
  const filled = template.replace(EMBEDDED_DATA_PATTERN, (_m, open: string, _mid: string, close: string) => {
    return `${open}${payload}${close}`;
  });

  const blob = new Blob([filled], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
