/**
 * third_party/nes-homebrew/roms → apps/web/public/sample-roms へ同期し、catalog.json を生成する。
 * バイナリはリポジトリの third_party が正本。アプリは都度 HTTP で取得する（永続保存しない）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const srcDir = path.join(repoRoot, "third_party/nes-homebrew/roms");
const outDir = path.resolve(__dirname, "../public/sample-roms");

/** @type {Array<{ id: string, file: string, title: string, author: string, license: string, mapper: number, group: "sample" | "gpl" | "test" }>} */
const ENTRIES = [
  { id: "lawn-mower", file: "Lawn_Mower.nes", title: "Lawn Mower", author: "Shiru", license: "CC0", mapper: 0, group: "sample" },
  { id: "lan-master", file: "Lan_Master.nes", title: "Lan Master", author: "Shiru", license: "CC0", mapper: 0, group: "sample" },
  { id: "chase", file: "Chase.nes", title: "Chase", author: "Shiru", license: "Public Domain", mapper: 0, group: "sample" },
  {
    id: "zooming-secretary",
    file: "Zooming_Secretary.nes",
    title: "Zooming Secretary",
    author: "PinWizz & Shiru",
    license: "CC-BY",
    mapper: 0,
    group: "sample",
  },
  { id: "hype", file: "Hype.nes", title: "Hype", author: "Shiru", license: "Freeware", mapper: 0, group: "sample" },
  { id: "ny2011", file: "NY2011.nes", title: "New Year 2011", author: "Shiru", license: "Freeware", mapper: 0, group: "sample" },
  { id: "ny2020", file: "NY2020.nes", title: "New Year 2020", author: "Shiru", license: "Freeware", mapper: 4, group: "sample" },
  {
    id: "russian-roulette",
    file: "Russian_Roulette.nes",
    title: "Russian Roulette",
    author: "Damian Yerrick",
    license: "GNU All-Permissive",
    mapper: 0,
    group: "sample",
  },
  {
    id: "zap-ruder",
    file: "Zap_Ruder.nes",
    title: "Zap Ruder",
    author: "Damian Yerrick",
    license: "GNU All-Permissive",
    mapper: 0,
    group: "sample",
  },
  {
    id: "rhde",
    file: "RHDE_Furniture_Fight.nes",
    title: "RHDE: Furniture Fight",
    author: "Damian Yerrick",
    license: "GNU All-Permissive",
    mapper: 0,
    group: "sample",
  },
  {
    id: "password-save",
    file: "Password_Save_Demo.nes",
    title: "Password Save Demo",
    author: "Damian Yerrick",
    license: "All-Permissive",
    mapper: 0,
    group: "sample",
  },
  {
    id: "nrom-template",
    file: "NROM_Template.nes",
    title: "NROM Template",
    author: "Damian Yerrick",
    license: "Template",
    mapper: 0,
    group: "sample",
  },
  {
    id: "graphics-editor",
    file: "Graphics_Editor.nes",
    title: "Graphics Editor",
    author: "Damian Yerrick",
    license: "Tool ROM",
    mapper: 1,
    group: "sample",
  },
  {
    id: "sfx-editor",
    file: "Sound_Effects_Editor.nes",
    title: "Sound Effects Editor",
    author: "Damian Yerrick",
    license: "Tool ROM",
    mapper: 1,
    group: "sample",
  },
  {
    id: "concentration-room",
    file: "Concentration_Room.nes",
    title: "Concentration Room",
    author: "Damian Yerrick",
    license: "GPLv3",
    mapper: 0,
    group: "gpl",
  },
  { id: "thwaite", file: "Thwaite.nes", title: "Thwaite", author: "Damian Yerrick", license: "GPL", mapper: 0, group: "gpl" },
  {
    id: "blade-buster",
    file: "BladeBuster.nes",
    title: "Blade Buster",
    author: "High Level Challenge!",
    license: "Freeware (test)",
    mapper: 4,
    group: "test",
  },
  {
    id: "holy-diver-m0",
    file: "HolyDiver_M0.nes",
    title: "Holy Diver Batman (M0)",
    author: "Damian Yerrick",
    license: "All-Permissive",
    mapper: 0,
    group: "test",
  },
  {
    id: "holy-diver-m1",
    file: "HolyDiver_M1.nes",
    title: "Holy Diver Batman (M1)",
    author: "Damian Yerrick",
    license: "All-Permissive",
    mapper: 1,
    group: "test",
  },
  {
    id: "holy-diver-m2",
    file: "HolyDiver_M2.nes",
    title: "Holy Diver Batman (M2)",
    author: "Damian Yerrick",
    license: "All-Permissive",
    mapper: 2,
    group: "test",
  },
  {
    id: "holy-diver-m3",
    file: "HolyDiver_M3.nes",
    title: "Holy Diver Batman (M3)",
    author: "Damian Yerrick",
    license: "All-Permissive",
    mapper: 3,
    group: "test",
  },
  {
    id: "holy-diver-m4",
    file: "HolyDiver_M4.nes",
    title: "Holy Diver Batman (M4)",
    author: "Damian Yerrick",
    license: "All-Permissive",
    mapper: 4,
    group: "test",
  },
  {
    id: "holy-diver-m7",
    file: "HolyDiver_M7.nes",
    title: "Holy Diver Batman (M7)",
    author: "Damian Yerrick",
    license: "All-Permissive",
    mapper: 7,
    group: "test",
  },
  {
    id: "snrom-template",
    file: "SNROM_Template.nes",
    title: "SNROM Template",
    author: "Damian Yerrick",
    license: "Template",
    mapper: 1,
    group: "sample",
  },
  {
    id: "uorom-template",
    file: "UOROM_Template.nes",
    title: "UOROM Template",
    author: "Damian Yerrick",
    license: "Template",
    mapper: 2,
    group: "sample",
  },
  {
    id: "suboard",
    file: "SuBoard.nes",
    title: "SuBoard",
    author: "Shiru",
    license: "Freeware",
    mapper: 0,
    group: "sample",
  },
];

if (!fs.existsSync(srcDir)) {
  console.error(`sample-roms: source missing: ${srcDir}`);
  process.exit(1);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const published = [];
for (const entry of ENTRIES) {
  const from = path.join(srcDir, entry.file);
  if (!fs.existsSync(from)) {
    console.warn(`sample-roms: skip missing ${entry.file}`);
    continue;
  }
  fs.copyFileSync(from, path.join(outDir, entry.file));
  published.push(entry);
}

const catalog = {
  version: 1,
  note: "Provided samples are fetched on demand and not saved to the user GitHub repo.",
  roms: published,
};

fs.writeFileSync(path.join(outDir, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`sample-roms: synced ${published.length} ROMs → ${outDir}`);
