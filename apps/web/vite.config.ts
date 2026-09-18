import { defineConfig } from "vite";

// worker.format のデフォルトは 'iife'。IIFEだとクラスフィールドが Object.defineProperty
// 経由に落ち、ネイティブ class fields の ESM Worker（dev）より本番だけ遅くなる。
// ES2022 + format:'es' で揃える。
export default defineConfig({
  base: "./",
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: "es2022",
  },
  esbuild: {
    target: "es2022",
  },
  worker: {
    format: "es",
  },
});
