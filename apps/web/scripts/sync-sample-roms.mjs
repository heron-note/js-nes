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

/**
 * kind:
 *   game     … 遊べるゲーム
 *   demo     … 技術デモ・年賀デモ（遊ぶより「見る／試す」）
 *   tool     … 本体上で動く編集ツール
 *   template … 開発用スケルトン（遊べない）
 *   test     … エミュ／マッパー検証用
 *
 * @typedef {"game"|"demo"|"tool"|"template"|"test"} SampleKind
 * @typedef {"sample"|"gpl"|"test"} SampleGroup
 * @typedef {{
 *   id: string,
 *   file: string,
 *   title: string,
 *   author: string,
 *   license: string,
 *   mapper: number,
 *   group: SampleGroup,
 *   kind: SampleKind,
 *   summary: string,
 *   howto: string,
 * }} SampleEntry
 */

/** @type {SampleEntry[]} */
const ENTRIES = [
  {
    id: "lawn-mower",
    file: "Lawn_Mower.nes",
    title: "Lawn Mower",
    author: "Shiru",
    license: "CC0",
    mapper: 0,
    group: "sample",
    kind: "game",
    summary: "芝刈りアクション。花を避けつつ芝生を刈り、燃料切れ前にゴールを目指す。",
    howto: "十字キーで移動。芝の上を通ると刈れます。石・花に注意。難易度はタイトルで選択。",
  },
  {
    id: "lan-master",
    file: "Lan_Master.nes",
    title: "Lan Master",
    author: "Shiru",
    license: "CC0",
    mapper: 0,
    group: "sample",
    kind: "game",
    summary: "LANケーブルをつないでネットワークを完成させるパズル。",
    howto: "十字キーでカーソル移動、A/Bでパイプを回転。全端末がつながればクリア。",
  },
  {
    id: "chase",
    file: "Chase.nes",
    title: "Chase",
    author: "Shiru",
    license: "Public Domain",
    mapper: 0,
    group: "sample",
    kind: "game",
    summary: "C言語でNESゲームを書く記事用の小さな追いかけっこ。",
    howto: "十字キーで移動し、敵から逃げつつスコアを稼ぐシンプルなゲーム。",
  },
  {
    id: "zooming-secretary",
    file: "Zooming_Secretary.nes",
    title: "Zooming Secretary",
    author: "PinWizz & Shiru",
    license: "CC-BY",
    mapper: 0,
    group: "sample",
    kind: "game",
    summary: "オフィスを駆け回る横視点アクション（CC-BY・クレジット必須）。",
    howto: "十字キーで移動、障害や上司をかわしながら仕事をこなす。",
  },
  {
    id: "super-tilt-bro",
    file: "Super_Tilt_Bro.nes",
    title: "Super Tilt Bro.",
    author: "sgadrat",
    license: "WTFPL",
    mapper: 2,
    group: "sample",
    kind: "game",
    summary: "スマブラ風の対戦アクション。同梱は公開配布の UNROM（Mapper 2）版。公式 itch の Mapper 30 版もロード可。",
    howto: "十字キーで移動、A/B で攻撃・ジャンプ。2人対戦向け。メニューは画面案内に従う。",
  },
  {
    id: "hype",
    file: "Hype.nes",
    title: "Hype",
    author: "Shiru",
    license: "Freeware",
    mapper: 0,
    group: "sample",
    kind: "game",
    summary: "短いホームブリュー作品。タイトル画面からスタート。",
    howto: "十字キーと A/B で操作。短いセッション向け。",
  },
  {
    id: "ny2011",
    file: "NY2011.nes",
    title: "New Year 2011",
    author: "Shiru",
    license: "Freeware",
    mapper: 0,
    group: "sample",
    kind: "demo",
    summary: "年賀デモ（2011）。遊戯というより季節ものの映像＋ミニ要素。",
    howto: "起動して眺める用。操作は画面の案内に従う。",
  },
  {
    id: "ny2020",
    file: "NY2020.nes",
    title: "New Year 2020",
    author: "Shiru",
    license: "Freeware",
    mapper: 4,
    group: "sample",
    kind: "demo",
    summary: "年賀デモ（2020）。MMC3（Mapper 4）確認にも使える。",
    howto: "起動して眺める用。操作は画面の案内に従う。",
  },
  {
    id: "russian-roulette",
    file: "Russian_Roulette.nes",
    title: "Russian Roulette",
    author: "Damian Yerrick",
    license: "GNU All-Permissive",
    mapper: 0,
    group: "sample",
    kind: "demo",
    summary: "光線銃（Zapper）のトリガー読み取りデモ。本来は実機＋CRT向け。",
    howto: "ブラウザでは光銃なしでも起動確認は可。本格操作は実機向け。メニューは十字＋A。",
  },
  {
    id: "zap-ruder",
    file: "Zap_Ruder.nes",
    title: "Zap Ruder",
    author: "Damian Yerrick",
    license: "GNU All-Permissive",
    mapper: 0,
    group: "sample",
    kind: "test",
    summary: "Zapper（光銃）の狙い・検知テスト。エミュ精度確認用。",
    howto: "メニューでテスト項目を選ぶ。光銃なしのブラウザでは一部しか意味がない。",
  },
  {
    id: "rhde",
    file: "RHDE_Furniture_Fight.nes",
    title: "RHDE: Furniture Fight",
    author: "Damian Yerrick",
    license: "GNU All-Permissive",
    mapper: 0,
    group: "sample",
    kind: "game",
    summary: "家具を置く／どかす対戦風ミニゲーム（Robot Home Decorating Engineer）。",
    howto: "タイトルからモード選択。十字キーと A/B で家具を操作。",
  },
  {
    id: "password-save",
    file: "Password_Save_Demo.nes",
    title: "Password Save Demo",
    author: "Damian Yerrick",
    license: "All-Permissive",
    mapper: 0,
    group: "sample",
    kind: "demo",
    summary: "パスワードで進行を復元する仕組みのデモ（ゲーム本編ではない）。",
    howto: "画面の指示でパスワードを入力／表示し、セーブ相当の流れを確認する。",
  },
  {
    id: "nrom-template",
    file: "NROM_Template.nes",
    title: "NROM Template",
    author: "Damian Yerrick",
    license: "Template",
    mapper: 0,
    group: "sample",
    kind: "template",
    summary: "Mapper 0（NROM）用の開発スケルトン。遊ぶソフトではない。",
    howto: "起動して「テンプレが動く」ことだけ確認する用途。操作ゲームはありません。",
  },
  {
    id: "graphics-editor",
    file: "Graphics_Editor.nes",
    title: "Graphics Editor",
    author: "Damian Yerrick",
    license: "Tool ROM",
    mapper: 1,
    group: "sample",
    kind: "tool",
    summary: "本体上でタイル／ネームテーブルをいじるグラフィック編集ツール。",
    howto: "メニューと十字キーで編集モードへ。開発者向け。通常の「ゲーム」ではありません。",
  },
  {
    id: "sfx-editor",
    file: "Sound_Effects_Editor.nes",
    title: "Sound Effects Editor",
    author: "Damian Yerrick",
    license: "Tool ROM",
    mapper: 1,
    group: "sample",
    kind: "tool",
    summary: "効果音を組み立てて試聴するツール ROM（Pin Eight）。",
    howto: "メニューからパラメータを変え、A などで再生。開発者向け。ゲームではありません。",
  },
  {
    id: "snrom-template",
    file: "SNROM_Template.nes",
    title: "SNROM Template",
    author: "Damian Yerrick",
    license: "Template",
    mapper: 1,
    group: "sample",
    kind: "template",
    summary: "Mapper 1（MMC1 / SNROM）用の開発スケルトン。",
    howto: "起動確認用。遊ぶ要素はありません。",
  },
  {
    id: "uorom-template",
    file: "UOROM_Template.nes",
    title: "UOROM Template",
    author: "Damian Yerrick",
    license: "Template",
    mapper: 2,
    group: "sample",
    kind: "template",
    summary: "Mapper 2（UxROM）用の開発スケルトン。",
    howto: "起動確認用。遊ぶ要素はありません。",
  },
  {
    id: "suboard",
    file: "SuBoard.nes",
    title: "SuBoard",
    author: "Shiru",
    license: "Freeware",
    mapper: 0,
    group: "sample",
    kind: "demo",
    summary: "ファミクローン用キーボード向けのボード／入力デモ。",
    howto: "通常のコントローラだけでは本領を発揮しません。起動確認程度向き。",
  },
  {
    id: "concentration-room",
    file: "Concentration_Room.nes",
    title: "Concentration Room",
    author: "Damian Yerrick",
    license: "GPLv3",
    mapper: 0,
    group: "gpl",
    kind: "game",
    summary: "神経衰弱（ペア合わせ）。GPL のためソース入手手段の明示が必要な配布枠。",
    howto: "十字キーでカード選択、A でめくる。ペアを揃えてクリア。",
  },
  {
    id: "thwaite",
    file: "Thwaite.nes",
    title: "Thwaite",
    author: "Damian Yerrick",
    license: "GPL",
    mapper: 0,
    group: "gpl",
    kind: "game",
    summary: "ミサイル防衛風の防衛アクション（Missile Command 系）。",
    howto: "照準を動かしてミサイルを撃ち落とし、街を守る。",
  },
  {
    id: "holy-diver-m0",
    file: "HolyDiver_M0.nes",
    title: "Holy Diver Batman (M0)",
    author: "Damian Yerrick",
    license: "All-Permissive",
    mapper: 0,
    group: "test",
    kind: "test",
    summary: "マッパー検出デモ（Mapper 0 版）。エミュの互換確認用。",
    howto: "起動後に検出結果が表示される。遊ぶゲームではない。",
  },
  {
    id: "holy-diver-m1",
    file: "HolyDiver_M1.nes",
    title: "Holy Diver Batman (M1)",
    author: "Damian Yerrick",
    license: "All-Permissive",
    mapper: 1,
    group: "test",
    kind: "test",
    summary: "マッパー検出デモ（Mapper 1 / MMC1）。",
    howto: "起動後に検出結果が表示される。遊ぶゲームではない。",
  },
  {
    id: "holy-diver-m2",
    file: "HolyDiver_M2.nes",
    title: "Holy Diver Batman (M2)",
    author: "Damian Yerrick",
    license: "All-Permissive",
    mapper: 2,
    group: "test",
    kind: "test",
    summary: "マッパー検出デモ（Mapper 2）。",
    howto: "起動後に検出結果が表示される。遊ぶゲームではない。",
  },
  {
    id: "holy-diver-m3",
    file: "HolyDiver_M3.nes",
    title: "Holy Diver Batman (M3)",
    author: "Damian Yerrick",
    license: "All-Permissive",
    mapper: 3,
    group: "test",
    kind: "test",
    summary: "マッパー検出デモ（Mapper 3）。",
    howto: "起動後に検出結果が表示される。遊ぶゲームではない。",
  },
  {
    id: "holy-diver-m4",
    file: "HolyDiver_M4.nes",
    title: "Holy Diver Batman (M4)",
    author: "Damian Yerrick",
    license: "All-Permissive",
    mapper: 4,
    group: "test",
    kind: "test",
    summary: "マッパー検出デモ（Mapper 4 / MMC3）。",
    howto: "起動後に検出結果が表示される。遊ぶゲームではない。",
  },
  {
    id: "holy-diver-m7",
    file: "HolyDiver_M7.nes",
    title: "Holy Diver Batman (M7)",
    author: "Damian Yerrick",
    license: "All-Permissive",
    mapper: 7,
    group: "test",
    kind: "test",
    summary: "マッパー検出デモ（Mapper 7 / AxROM）。",
    howto: "起動後に検出結果が表示される。遊ぶゲームではない。",
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
    console.warn(`sample-rom: skip missing ${entry.file}`);
    continue;
  }
  fs.copyFileSync(from, path.join(outDir, entry.file));
  published.push(entry);
}

const catalog = {
  version: 2,
  note: "Provided samples are fetched on demand and not saved to the user GitHub repo. Mix of games, demos, tools, templates, and mapper tests.",
  roms: published,
};

fs.writeFileSync(path.join(outDir, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`sample-roms: synced ${published.length} ROMs → ${outDir}`);
