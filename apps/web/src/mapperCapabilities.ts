/**
 * Create 向けマッパー能力マトリクス。
 *
 * エミュが再生できるマッパーはすべて Create から .nes ビルド可能。
 * バンク切替・IRQ の専用 DSL は未実装だが、単一バンク相当のレイアウトと
 * MMC1/MMC3 の起動初期化により、標準ブロックのゲームはそのまま動く。
 */

import { CREATE_MAPPER_IDS, type CreateMapperId } from "./projectV3.js";

export type MapperCapability = {
  id: CreateMapperId;
  name: string;
  shortLabel: string;
  /** PRG 目安（表示用） */
  prgHint: string;
  /** CHR 目安（表示用） */
  chrHint: string;
  summary: string;
  /** Create ビルドで .nes を出せるか */
  buildSupported: boolean;
  /** ブロック／DSL の差分 */
  blockNote: string;
};

export const MAPPER_CAPABILITIES: Record<CreateMapperId, MapperCapability> = {
  0: {
    id: 0,
    name: "NROM",
    shortLabel: "NROM（小規模）",
    prgHint: "16 KB",
    chrHint: "8 KB ROM",
    summary: "最初の一歩向け。バンク切替なしでシンプル。",
    buildSupported: true,
    blockNote: "標準ブロック一式（描画・音・入力・パーツ／シーン）",
  },
  1: {
    id: 1,
    name: "MMC1",
    shortLabel: "MMC1（中規模）",
    prgHint: "16 KB（拡張余地あり）",
    chrHint: "8 KB ROM",
    summary: "中規模向け。起動時にミラー／バンクを NROM 相当へ初期化。",
    buildSupported: true,
    blockNote: "標準ブロックは NROM と同じ。バンク切替ブロックは後続",
  },
  2: {
    id: 2,
    name: "UxROM",
    shortLabel: "UxROM（PRG バンク）",
    prgHint: "32 KB（16KB×2 相当）",
    chrHint: "8 KB（内部 RAM に初期ロード）",
    summary: "プログラム容量を伸ばす向き。現状は単一構成でビルド。",
    buildSupported: true,
    blockNote: "標準ブロックは NROM と同じ。PRG バンク命令は後続",
  },
  3: {
    id: 3,
    name: "CNROM",
    shortLabel: "CNROM（CHR バンク）",
    prgHint: "16 KB",
    chrHint: "8 KB ROM（1 バンク）",
    summary: "グラフィック差し替えを増やしたいとき。当面 1 CHR バンク。",
    buildSupported: true,
    blockNote: "標準ブロックは NROM と同じ。CHR バンク命令は後続",
  },
  4: {
    id: 4,
    name: "MMC3",
    shortLabel: "MMC3（本格）",
    prgHint: "32 KB",
    chrHint: "8 KB ROM",
    summary: "本格作品向け。起動時に CHR／PRG／ミラーを線形配置へ初期化。",
    buildSupported: true,
    blockNote: "標準ブロックは NROM と同じ。IRQ／バンク切替ブロックは後続",
  },
  7: {
    id: 7,
    name: "AxROM",
    shortLabel: "AxROM（32KB PRG）",
    prgHint: "32 KB",
    chrHint: "8 KB RAM",
    summary: "大きな PRG バンク。ミラーはシングルスクリーン（マッパー仕様）。",
    buildSupported: true,
    blockNote: "標準ブロックは NROM と同じ。バンク命令は後続",
  },
  30: {
    id: 30,
    name: "UNROM 512",
    shortLabel: "UNROM 512",
    prgHint: "32 KB（拡張余地あり）",
    chrHint: "8 KB（内部に初期ロード）",
    summary: "UxROM 拡張。現状は単一構成でビルド。",
    buildSupported: true,
    blockNote: "標準ブロックは NROM と同じ。バンク命令は後続",
  },
};

export function listMapperCapabilities(): MapperCapability[] {
  return CREATE_MAPPER_IDS.map((id) => MAPPER_CAPABILITIES[id]);
}

export function isBuildSupportedMapper(id: number): id is CreateMapperId {
  return (
    (CREATE_MAPPER_IDS as readonly number[]).includes(id) &&
    MAPPER_CAPABILITIES[id as CreateMapperId].buildSupported
  );
}
