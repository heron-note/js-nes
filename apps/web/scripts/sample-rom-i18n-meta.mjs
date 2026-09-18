/**
 * 収録ソフトの英語説明・著作権・公式 URL（id キー）。
 * sync-sample-roms.mjs が ENTRIES にマージして catalog.json へ出す。
 */

/** @typedef {{ summaryEn: string, howtoEn: string, copyright: string, url?: string }} SampleMeta */

/** @type {Record<string, SampleMeta>} */
export const SAMPLE_ROM_META = {
  "lawn-mower": {
    summaryEn: "Lawn-mowing action. Cut the grass while avoiding flowers; reach the goal before fuel runs out.",
    howtoEn: "Move with the D-pad. Crossing grass cuts it. Watch for rocks and flowers. Pick difficulty on the title screen.",
    copyright: "© Shiru — CC0",
    url: "https://shiru.untergrund.net/",
  },
  "lan-master": {
    summaryEn: "Puzzle: connect LAN cables to complete the network.",
    howtoEn: "Move the cursor with the D-pad; rotate pipes with A/B. Clear when every terminal is linked.",
    copyright: "© Shiru — CC0",
    url: "https://shiru.untergrund.net/",
  },
  chase: {
    summaryEn: "Tiny chase game from a C-on-NES tutorial article.",
    howtoEn: "Move with the D-pad; dodge enemies and rack up score.",
    copyright: "© Shiru — Public Domain",
    url: "https://shiru.untergrund.net/",
  },
  "zooming-secretary": {
    summaryEn: "Side-view office action (CC-BY; attribution required).",
    howtoEn: "Move with the D-pad; dodge obstacles and bosses while finishing tasks.",
    copyright: "© PinWizz & Shiru — CC-BY",
    url: "https://shiru.untergrund.net/",
  },
  "super-tilt-bro": {
    summaryEn:
      "Smash Bros.–style versus fighter. Bundled build is the public UNROM (Mapper 2) release; the official itch Mapper 30 build also loads.",
    howtoEn: "Move with the D-pad; attack/jump with A/B. Best for two players. Follow on-screen menus.",
    copyright: "© sgadrat — WTFPL",
    url: "https://sgadrat.itch.io/super-tilt-bro",
  },
  "escape-from-pong": {
    summaryEn: "Micro-puzzle (from a 1K compo): be the Pong ball and escape past paddles and walls.",
    howtoEn: "Accelerate with the D-pad. White walls bounce you; red walls and paddles restart the attempt.",
    copyright: "© Adam Gashlin / Halley's Comet Software — BSD-3",
    url: "https://hcs64.com/efp.html",
  },
  nes15: {
    summaryEn: "Classic 15-puzzle (slide numbered tiles).",
    howtoEn: "Slide tiles into the empty space with the D-pad. An auto-solver is available (see on-screen help).",
    copyright: "© Mathew Brenaman — BSD-2",
  },
  dabg: {
    summaryEn: "Bubble Bobble–style co-op action with a level editor. Shoot enemies to freeze them, then bump to defeat.",
    howtoEn: "Move with the D-pad; jump/attack with A/B. 1–2 players. Menus include editor and versus modes.",
    copyright: "© NovaSquirrel — zlib",
    url: "https://github.com/NovaSquirrel/DABG",
  },
  hype: {
    summaryEn: "Short homebrew; start from the title screen.",
    howtoEn: "Play with the D-pad and A/B. Meant for a short session.",
    copyright: "© Shiru — Freeware",
    url: "https://shiru.untergrund.net/",
  },
  ny2011: {
    summaryEn: "New Year 2011 demo — seasonal visuals more than a full game.",
    howtoEn: "Boot and watch. Follow on-screen prompts for any controls.",
    copyright: "© Shiru — Freeware",
    url: "https://shiru.untergrund.net/",
  },
  ny2020: {
    summaryEn: "New Year 2020 demo. Also useful to check MMC3 (Mapper 4).",
    howtoEn: "Boot and watch. Follow on-screen prompts for any controls.",
    copyright: "© Shiru — Freeware",
    url: "https://shiru.untergrund.net/",
  },
  "russian-roulette": {
    summaryEn: "Zapper trigger read demo. Aimed at real hardware + CRT.",
    howtoEn: "In-browser you can still boot without a light gun. Full play is for real hardware. Menu: D-pad + A.",
    copyright: "© Damian Yerrick / Pin Eight — GNU All-Permissive",
    url: "https://pineight.com/nes/",
  },
  "zap-ruder": {
    summaryEn: "Zapper aim/detection test for emulator accuracy.",
    howtoEn: "Pick tests from the menu. Without a light gun, only some checks are meaningful in a browser.",
    copyright: "© Damian Yerrick / Pin Eight — GNU All-Permissive",
    url: "https://pineight.com/nes/",
  },
  rhde: {
    summaryEn: "Furniture place/remove versus mini-game (Robot Home Decorating Engineer).",
    howtoEn: "Pick a mode from the title; move furniture with the D-pad and A/B.",
    copyright: "© Damian Yerrick / Pin Eight — GNU All-Permissive",
    url: "https://pineight.com/nes/",
  },
  "password-save": {
    summaryEn: "Demo of password-based progress restore (not a full game).",
    howtoEn: "Enter/display passwords as instructed to walk through a save-like flow.",
    copyright: "© Damian Yerrick / Pin Eight — All-Permissive",
    url: "https://pineight.com/nes/",
  },
  "nrom-template": {
    summaryEn: "Mapper 0 (NROM) development skeleton — not a playable game.",
    howtoEn: "Use only to confirm the template boots. There is no gameplay.",
    copyright: "© Damian Yerrick / Pin Eight — Template",
    url: "https://pineight.com/nes/",
  },
  "graphics-editor": {
    summaryEn: "On-console tile / nametable graphics editor.",
    howtoEn: "Use menus and the D-pad to edit. Developer tool — not a game.",
    copyright: "© Damian Yerrick / Pin Eight — Tool ROM",
    url: "https://pineight.com/nes/",
  },
  "sfx-editor": {
    summaryEn: "Build and audition sound effects (Pin Eight tool ROM).",
    howtoEn: "Tweak parameters from the menu; play with A etc. Developer tool — not a game.",
    copyright: "© Damian Yerrick / Pin Eight — Tool ROM",
    url: "https://pineight.com/nes/",
  },
  "snrom-template": {
    summaryEn: "Mapper 1 (MMC1 / SNROM) development skeleton.",
    howtoEn: "Boot-check only. No gameplay.",
    copyright: "© Damian Yerrick / Pin Eight — Template",
    url: "https://pineight.com/nes/",
  },
  "uorom-template": {
    summaryEn: "Mapper 2 (UxROM) development skeleton.",
    howtoEn: "Boot-check only. No gameplay.",
    copyright: "© Damian Yerrick / Pin Eight — Template",
    url: "https://pineight.com/nes/",
  },
  suboard: {
    summaryEn: "Board / input demo aimed at famiclone keyboards.",
    howtoEn: "Limited without a keyboard; mainly for boot checks on a normal pad.",
    copyright: "© Shiru — Freeware",
    url: "https://shiru.untergrund.net/",
  },
  "concentration-room": {
    summaryEn: "Memory match (pair cards). GPL — redistributors must provide source access info.",
    howtoEn: "Select cards with the D-pad; flip with A. Clear by matching all pairs.",
    copyright: "© Damian Yerrick / Pin Eight — GPLv3 (+ binary exception)",
    url: "https://pineight.com/nes/",
  },
  thwaite: {
    summaryEn: "Missile-defense style action (Missile Command family).",
    howtoEn: "Move the crosshair and shoot down missiles to protect cities.",
    copyright: "© Damian Yerrick / Pin Eight — GPL",
    url: "https://pineight.com/nes/",
  },
  "holy-diver-m0": {
    summaryEn: "Mapper detection demo (Mapper 0). Emulator compatibility check.",
    howtoEn: "Shows detection results after boot. Not a playable game.",
    copyright: "© Damian Yerrick — All-Permissive",
    url: "https://pineight.com/nes/",
  },
  "holy-diver-m1": {
    summaryEn: "Mapper detection demo (Mapper 1 / MMC1).",
    howtoEn: "Shows detection results after boot. Not a playable game.",
    copyright: "© Damian Yerrick — All-Permissive",
    url: "https://pineight.com/nes/",
  },
  "holy-diver-m2": {
    summaryEn: "Mapper detection demo (Mapper 2).",
    howtoEn: "Shows detection results after boot. Not a playable game.",
    copyright: "© Damian Yerrick — All-Permissive",
    url: "https://pineight.com/nes/",
  },
  "holy-diver-m3": {
    summaryEn: "Mapper detection demo (Mapper 3).",
    howtoEn: "Shows detection results after boot. Not a playable game.",
    copyright: "© Damian Yerrick — All-Permissive",
    url: "https://pineight.com/nes/",
  },
  "holy-diver-m4": {
    summaryEn: "Mapper detection demo (Mapper 4 / MMC3).",
    howtoEn: "Shows detection results after boot. Not a playable game.",
    copyright: "© Damian Yerrick — All-Permissive",
    url: "https://pineight.com/nes/",
  },
  "holy-diver-m7": {
    summaryEn: "Mapper detection demo (Mapper 7 / AxROM).",
    howtoEn: "Shows detection results after boot. Not a playable game.",
    copyright: "© Damian Yerrick — All-Permissive",
    url: "https://pineight.com/nes/",
  },
};
