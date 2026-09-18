import { defineConfig } from "vite";

// `npm run build:unoptimized` などで mode=unoptimized を渡すと、minify / CSS圧縮を切る。
// 本番ビルドだけ ticks/sec が落ちる切り分け用（Viteは通常 minify で速くなる側なので、
// 「最適化が重くする」仮説の検証に使う）。
export default defineConfig(({ mode }) => {
  const unoptimized = mode === "unoptimized";

  return {
    base: "./",
    server: {
      host: true,
      port: 5173,
    },
    build: {
      minify: unoptimized ? false : "esbuild",
      cssMinify: !unoptimized,
      sourcemap: unoptimized,
    },
    esbuild: unoptimized
      ? {
          // 本番向けの識別子短縮・デッドコード除去もオフにする
          minifyIdentifiers: false,
          minifySyntax: false,
          minifyWhitespace: false,
        }
      : undefined,
  };
});
