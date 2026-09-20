/**
 * スマホ幅で herocon Play 画面を撮影する。
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "shots");
const URL = "https://herocon-xi.vercel.app/";
const ROM_LAWN = path.resolve(__dirname, "../../roms/Lawn_Mower.nes");

fs.mkdirSync(OUT, { recursive: true });

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("shot", file);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "ja-JP",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await shot(page, "intro");

  // パッドが見える位置へ
  await page.locator("#virtual-pad").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot(page, "pad");

  // スクショ／録画ボタン付近
  await page.locator("#screenshot-btn").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot(page, "capture");

  // カセットデッキ
  await page.locator(".cassette-deck").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot(page, "cassette");

  // 収録ソフト
  await page.locator(".sample-rom-bar").scrollIntoViewIfNeeded();
  const select = page.locator("#sample-rom-select");
  await select.waitFor({ state: "visible" });
  // オプション待ち
  for (let i = 0; i < 20; i++) {
    const n = await select.locator("option").count();
    if (n > 1) break;
    await page.waitForTimeout(500);
  }
  await select.selectOption({ label: /Lawn Mower/i }).catch(async () => {
    await select.selectOption({ value: "lawn-mower" });
  });
  await page.waitForTimeout(500);
  await shot(page, "samples");

  // Lawn Mower 読み込み → ロード後さらに約5秒待ってから撮影
  await page.locator("#sample-rom-play-btn").click();
  await page.waitForTimeout(2000);
  await page.locator("#screen").scrollIntoViewIfNeeded();
  await page.waitForTimeout(5000);
  await shot(page, "lawn");

  // GitHub 連携説明: ページ最下部（倉庫パネル）を表示
  await page.evaluate(() => {
    const el = document.querySelector("#github-cloud-panel");
    if (el) el.scrollIntoView({ block: "end", behavior: "instant" });
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await page.waitForTimeout(600);
  await shot(page, "github");

  // 終了カード
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await shot(page, "end");

  await browser.close();
  console.log("done shots");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
