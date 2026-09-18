/**
 * og-template.html を 1200x630 で撮影して public/og-image.png を作る。
 */
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = path.join(__dirname, "og-template.html");
const out = path.join(__dirname, "../public/og-image.png");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.goto(pathToFileURL(html).href, { waitUntil: "networkidle" });
await page.screenshot({ path: out, type: "png" });
await browser.close();
console.log("wrote", out);
