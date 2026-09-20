/**
 * Create 向けマッパー能力マトリクス。
 *
 * 現状の DSL／ブロック API 自体はマッパー共通（バンク切替命令は未実装）。
 * 違うのは「容量の目安」と「ビルド可能か」（当面 Mapper 0 のみ .nes 出力可）。
 * 将来バンク API を足すときは、この表と toolboxForMapper を拡張する。
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
  /** 当面の Create ビルドで .nes を出せるか */
  buildSupported: boolean;
  /** ブロック／DSL の差分（現状は説明のみ。将来カテゴリ切替に使う） */
  blockNote: string;
};

export const MAPPER_CAPABILITIES: Record<CreateMapperId, MapperCapability> = {
  0: {
    id: 0,
    name: "NROM",
    shortLabel: "NROM（小規模）",
    prgHint: "16–32 KB 固定",
    chrHint: "8 KB 固定",
    summary: "最初の一歩向け。バンク切替なしでシンプル。",
    buildSupported: true,
    blockNote: "標準ブロック一式（描画・音・入力・パーツ／シーン）",
  },
  1: {
    id: 1,
    name: "MMC1",
    shortLabel: "MMC1（中規模）",
    prgHint: "バンク切替",
    chrHint: "バンク切替",
    summary: "中規模向け。バンク命令ブロックは後続。",
    buildSupported: false,
    blockNote: "標準ブロックは NROM と同じ。バンク専用ブロックは未実装",
  },
  2: {
    id: 2,
    name: "UxROM",
    shortLabel: "UxROM（PRG バンク）",
    prgHint: "16 KB 切替",
    chrHint: "8 KB RAM 等",
    summary: "プログラム容量を伸ばす向き。",
    buildSupported: false,
    blockNote: "標準ブロックは NROM と同じ。PRG バンク命令は後続",
  },
  3: {
    id: 3,
    name: "CNROM",
    shortLabel: "CNROM（CHR バンク）",
    prgHint: "32 KB 級固定",
    chrHint: "8 KB 切替",
    summary: "グラフィック差し替えを増やしたいとき。",
    buildSupported: false,
    blockNote: "標準ブロックは NROM と同じ。CHR バンク命令は後続",
  },
  4: {
    id: 4,
    name: "MMC3",
    shortLabel: "MMC3（本格）",
    prgHint: "バンク切替",
    chrHint: "バンク切替 + IRQ",
    summary: "本格作品向け。スキャンライン IRQ など。",
    buildSupported: false,
    blockNote: "標準ブロックは NROM と同じ。IRQ／バンクは後続",
  },
  7: {
    id: 7,
    name: "AxROM",
    shortLabel: "AxROM（32KB PRG）",
    prgHint: "32 KB 切替",
    chrHint: "8 KB RAM",
    summary: "大きな PRG バンク切替。",
    buildSupported: false,
    blockNote: "標準ブロックは NROM と同じ。バンク命令は後続",
  },
};

export function listMapperCapabilities(): MapperCapability[] {
  return CREATE_MAPPER_IDS.map((id) => MAPPER_CAPABILITIES[id]);
}

export function isBuildSupportedMapper(id: number): id is CreateMapperId {
  return (CREATE_MAPPER_IDS as readonly number[]).includes(id) && MAPPER_CAPABILITIES[id as CreateMapperId].buildSupported;
}
