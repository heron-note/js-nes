// ビルド後、dist/index.html のJS/CSSを1ファイルに埋め込んだ
// dist/standalone-template.html を生成する（M6: スタンドアロンHTML書き出し機能用）。
// apps/web/src/standaloneExport.ts が実行時にこのテンプレートを取得し、
// window.__EMBEDDED_ROM_BASE64__ / __EMBEDDED_SOURCE__ を実データに置換して配布用HTMLを作る。

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "..", "dist");
const indexPath = join(distDir, "index.html");

if (!existsSync(indexPath)) {
  console.error(`[inline-standalone] ${indexPath} が見つかりません。先に vite build を実行してください。`);
  process.exit(1);
}

let html = readFileSync(indexPath, "utf-8");

// <link rel="stylesheet" ... href="./assets/xxx.css"> を <style>...</style> に置換
html = html.replace(
  /<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
  (_match, href) => {
    const cssPath = join(distDir, href.replace(/^\.?\//, ""));
    const css = readFileSync(cssPath, "utf-8");
    return `<style>\n${css}\n</style>`;
  },
);

// <script type="module" ... src="./assets/xxx.js"></script> を <script type="module">...</script> に置換
html = html.replace(
  /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,
  (_match, src) => {
    const jsPath = join(distDir, src.replace(/^\.?\//, ""));
    const js = readFileSync(jsPath, "utf-8");
    return `<script type="module">\n${js}\n</script>`;
  },
);

const outPath = join(distDir, "standalone-template.html");
writeFileSync(outPath, html, "utf-8");
console.log(`[inline-standalone] wrote ${outPath} (${(html.length / 1024).toFixed(1)} KB)`);
