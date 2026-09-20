/**
 * サンプルシーンに配置が無いとき、Player / Mover を placements に載せる。
 * （v2 由来の instance は logicBlocks 側にあり、ツリーシェイクが見落とすため）
 */
import { newAssetId, type ProjectV3, type ScenePlacement } from "./projectV3.js";

function findCharacterIdByName(project: ProjectV3, name: string): string | undefined {
  return project.characterOrder.find((id) => project.characters[id]?.name === name);
}

/** 変更したら true。 */
export function ensureSamplePlacements(project: ProjectV3): boolean {
  const mainId = project.sceneOrder.find((id) => project.scenes[id]?.name === "Main");
  if (!mainId) return false;
  const sc = project.scenes[mainId]!;
  if (sc.placements.length > 0) return false;

  const playerId = findCharacterIdByName(project, "Player");
  const moverId = findCharacterIdByName(project, "Mover");
  if (!playerId && !moverId) return false;

  const next: ScenePlacement[] = [];
  if (playerId) next.push({ id: newAssetId("plc"), characterId: playerId, x: 120, y: 100 });
  if (moverId) next.push({ id: newAssetId("plc"), characterId: moverId, x: 200, y: 50 });
  sc.placements = next;
  return true;
}
