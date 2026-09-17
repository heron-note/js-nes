/** ブラウザ上で .nes バイト列をファイルとしてダウンロードさせる（ブラウザ環境専用）。 */
export function downloadRom(rom: Uint8Array, filename: string): void {
  // Blob は ArrayBuffer 由来の型を要求するため、SharedArrayBuffer 由来の可能性を排除した
  // 新規Uint8Arrayとしてコピーしてから渡す。
  const bytes = new Uint8Array(rom);
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
