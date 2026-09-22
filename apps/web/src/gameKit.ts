/**
 * Create テンプレ／手書き DSL 用のゲーム組み立てヘルパー。
 * ランタイム衝突エンジンの代わりに、分岐距離に収まる近接判定を生成する。
 */

/** 矩形近接（size×size）。a に hit/hx/hy、b に hx/hy が必要。 */
export function dslHitBox(
  a: string,
  b: string,
  size: number,
  thenLines: string[],
): string {
  const body = thenLines.map((l) => `    ${l}`).join("\n");
  const s = Math.max(1, Math.min(64, size | 0));
  return [
    `  ${b}.hx = ${b}.x;`,
    `  ${b}.hx += ${s};`,
    `  ${a}.hit = 0;`,
    `  if (${a}.x > ${b}.x) {`,
    `    if (${a}.x < ${b}.hx) { ${a}.hit = 1; }`,
    `  } else {`,
    `    if (${a}.x < ${b}.x) {`,
    `      ${a}.hx = ${a}.x;`,
    `      ${a}.hx += ${s};`,
    `      if (${b}.x < ${a}.hx) { ${a}.hit = 1; }`,
    `    } else {`,
    `      ${a}.hit = 1;`,
    `    }`,
    `  }`,
    `  if (${a}.hit) {`,
    `    ${b}.hy = ${b}.y;`,
    `    ${b}.hy += ${s};`,
    `    ${a}.hit = 0;`,
    `    if (${a}.y > ${b}.y) {`,
    `      if (${a}.y < ${b}.hy) { ${a}.hit = 1; }`,
    `    } else {`,
    `      if (${a}.y < ${b}.y) {`,
    `        ${a}.hy = ${a}.y;`,
    `        ${a}.hy += ${s};`,
    `        if (${b}.y < ${a}.hy) { ${a}.hit = 1; }`,
    `      } else {`,
    `        ${a}.hit = 1;`,
    `      }`,
    `    }`,
    `  }`,
    `  if (${a}.hit) {`,
    body,
    `  }`,
  ].join("\n");
}

/**
 * 右向き立ち/歩きの 2 タイル。左向きは drawSpriteFlip(..., 1) で水平反転。
 * pixels は最低 128（tileW=2）。
 */
export function paintHeroWalkSheet(pixels: number[]): void {
  if (pixels.length < 128) return;
  for (let i = 0; i < Math.min(pixels.length, 256); i++) pixels[i] = 0;

  const paintPose = (tileBase: number, legShift: boolean) => {
    const put = (x: number, y: number, c: number) => {
      pixels[tileBase + y * 8 + x] = c;
    };
    for (let x = 2; x <= 5; x++) put(x, 1, 3);
    for (let y = 2; y <= 5; y++) for (let x = 2; x <= 5; x++) put(x, y, 2);
    if (legShift) {
      put(2, 6, 1);
      put(5, 6, 1);
      put(3, 7, 1);
    } else {
      put(3, 6, 1);
      put(4, 6, 1);
    }
  };

  paintPose(0, false); // 立ち
  paintPose(64, true); // 歩き
}

/**
 * 横移動＋Bダッシュ＋向き＋2ポーズ歩行＋Aジャンプのヒーロー behavior 断片。
 * drawSpriteFlip の tile は 0–1（立/歩）、左向きは flip=1。
 */
export function dslHeroPlatformerMove(opts?: {
  groundY?: number;
  spriteId?: number;
}): string {
  const groundY = opts?.groundY ?? 180;
  const sid = opts?.spriteId ?? 0;
  return [
    "field x = 40;",
    `field y = ${groundY};`,
    "field onGround = 1;",
    "field jumpLeft = 0;",
    "field facing = 0;",
    "field walk = 0;",
    "field moving = 0;",
    "field hx = 0;",
    "field hy = 0;",
    "field hit = 0;",
    "field hurt = 0;",
    "",
    "behavior move(self) {",
    "  self.moving = 0;",
    "  if (btn.right) {",
    "    if (btn.b) { self.x += 3; } else { self.x += 2; }",
    "    self.facing = 0;",
    "    self.moving = 1;",
    "  }",
    "  if (btn.left) {",
    "    if (btn.b) { self.x -= 3; } else { self.x -= 2; }",
    "    self.facing = 1;",
    "    self.moving = 1;",
    "  }",
    "  if (btn.a_just_pressed) {",
    "    if (self.onGround) { self.jumpLeft = 10; self.onGround = 0; playTone(0, 28, 6); }",
    "  }",
    "  if (self.jumpLeft > 0) { self.y -= 3; self.jumpLeft -= 1; } else { self.y += 2; }",
    `  if (self.y > ${groundY}) { self.y = ${groundY}; self.onGround = 1; }`,
    "  if (self.x < 8) { self.x = 8; }",
    "  if (self.x > 240) { self.x = 240; }",
    "  if (self.hurt > 0) { self.hurt -= 1; }",
    "  if (self.moving) { self.walk += 1; } else { self.walk = 0; }",
    "  if (self.walk > 15) { self.walk = 0; }",
    "  if (self.facing) {",
    "    if (self.walk > 7) {",
    `      drawSpriteFlip(${sid}, self.x, self.y, 1, 4);`,
    "    } else {",
    `      drawSpriteFlip(${sid}, self.x, self.y, 0, 4);`,
    "    }",
    "  } else {",
    "    if (self.walk > 7) {",
    `      drawSprite(${sid}, self.x, self.y, 1, 0);`,
    "    } else {",
    `      drawSprite(${sid}, self.x, self.y, 0, 0);`,
    "    }",
    "  }",
    "}",
  ].join("\n");
}

/** カメラをインスタンス X に追従（背景スクロール）。 */
export function dslFollowCamX(inst: string, y = 0): string {
  return `  setScroll(${inst}.x, ${y});`;
}

/**
 * 簡易床押し戻し（固定 Y の床）。solidY より下に落ちたら戻す。
 * マップエンジンの代わりの最小マクロ。
 */
export function dslClampGround(inst: string, groundY: number): string {
  return [
    `  if (${inst}.y > ${groundY}) {`,
    `    ${inst}.y = ${groundY};`,
    `  }`,
  ].join("\n");
}
