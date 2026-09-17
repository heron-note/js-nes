/**
 * プロジェクト（パーツ/シーン/サウンドの集まり）から、実際にコンパイルするDSLソース全文と
 * CHR-ROM用タイル資産を組み立てる（Phase 6）。
 *
 * - パーツ/シーンはそれぞれ独立して書かれた`code`（`part Name {}`/`scene Name {}`の
 *   ラッパーを除いた中身）を、宣言順に結合するだけ。DSL自体はv1のpart/scene構文を
 *   そのままパース・コンパイルできるので、ここでは単純な文字列結合とラップのみ行う。
 * - サウンドは名前付きアセットとして持ち（ドット絵パーツと同じ発想）、コード中の
 *   `playSound(名前)`という呼び出しを、ここで`playTone(channel, note, duration)`へ
 *   機械的に置き換える。DSLの文法自体は変更しない（Phase 3のタイルオフセットと同じ、
 *   「プロジェクトのビルド時に解決する」方式）。
 */
import type { Project } from "./project.js";

export class ProjectBuildError extends Error {}

const PLAY_SOUND_RE = /playSound\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g;

function resolveSounds(code: string, project: Project): string {
  return code.replace(PLAY_SOUND_RE, (_match, name: string) => {
    const sound = project.sounds.find((s) => s.name === name);
    if (!sound) {
      throw new ProjectBuildError(`未知のサウンド '${name}' が playSound() で参照されています`);
    }
    return `playTone(${sound.channel}, ${sound.note}, ${sound.duration})`;
  });
}

/** プロジェクト全体を1本のDSLソーステキストに組み立てる。 */
export function buildProjectSource(project: Project): string {
  if (project.parts.length === 0 && project.scenes.length === 0) {
    return "";
  }
  const partsCode = project.parts.map((p) => `part ${p.name} {\n${resolveSounds(p.code, project)}\n}\n\n`).join("");
  const scenesCode = project.scenes
    .map((s) => `scene ${s.name} {\n${resolveSounds(s.code, project)}\n}\n\n`)
    .join("");
  return partsCode + scenesCode;
}

/** compile()へ渡すアセット（パーツ種別ごとのタイル配列）を組み立てる。 */
export function buildProjectAssets(project: Project): { partTiles: Record<string, number[][]> } {
  return { partTiles: Object.fromEntries(project.parts.map((p) => [p.name, p.tiles])) };
}
