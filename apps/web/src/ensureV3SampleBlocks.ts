/**
 * v3 サンプル（Player / Mover / Main）にブロックが無いとき、既定ブロックを埋め込む。
 */
import {
  capturePartBlockState,
  captureSceneBlockState,
  isEmptyBlockState,
  loadDefaultMainSceneBlocks,
  loadDefaultMoverPartBlocks,
  loadDefaultPlayerPartBlocks,
} from "./blocks/blockEditor.js";
import { PART_TOOLBOX, SCENE_TOOLBOX } from "./blocks/toolbox.js";
import type { ProjectV3 } from "./projectV3.js";
import { ensureSamplePlacements } from "./ensureSamplePlacements.js";
import { ensureSampleGraphics } from "./ensureSampleGraphics.js";

/** ブロック／配置／見えるドットを埋めたら true。 */
export function ensureV3SampleBlocks(project: ProjectV3): boolean {
  let changed = false;

  for (const id of project.characterOrder) {
    const ch = project.characters[id];
    if (!ch || !isEmptyBlockState(ch.behaviorBlocks)) continue;
    if (ch.name === "Player") {
      const captured = capturePartBlockState(loadDefaultPlayerPartBlocks, PART_TOOLBOX);
      ch.behaviorBlocks = captured.blocks;
      ch.legacyCode = captured.code;
      changed = true;
    } else if (ch.name === "Mover") {
      const captured = capturePartBlockState(loadDefaultMoverPartBlocks, PART_TOOLBOX);
      ch.behaviorBlocks = captured.blocks;
      ch.legacyCode = captured.code;
      changed = true;
    }
  }

  for (const id of project.sceneOrder) {
    const sc = project.scenes[id];
    if (!sc || !isEmptyBlockState(sc.logicBlocks)) continue;
    if (sc.name === "Main") {
      const captured = captureSceneBlockState(loadDefaultMainSceneBlocks, SCENE_TOOLBOX);
      sc.logicBlocks = captured.blocks;
      sc.legacyCode = captured.code;
      changed = true;
    }
  }

  if (ensureSamplePlacements(project)) changed = true;
  if (ensureSampleGraphics(project)) changed = true;
  return changed;
}
