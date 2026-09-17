// 1本目の同梱ゲーム: 壁打ちPong（シングルプレイ）
// 左側のパドルを上下キーで操作し、跳ね返るボールを打ち返し続けるだけのミニゲーム。
// docs/03_DSL_SPEC.md のv0サブセットのみで書かれている（配列・ループ・複合式なし）。
//
// 遊び方: このファイルの中身を Web IDE の「コード」タブに貼り付け、
// 「ドット絵」タブでタイル1番（パドル）・タイル2番（ボール）に好きな絵を描いてから
// 「ビルド&実行」を押す。矢印キー(上/下)またはタッチパッドでパドルを操作する。

let ballX = 128;
let ballY = 120;
let ballGoingRight = 1;
let ballGoingDown = 1;
let paddleY = 100;
let paddleBottom = 108;

function init() {
  setPalette(0, 1, 48, 0, 0);
  setSpritePalette(0, 1, 33, 48, 0);
}

function update() {
  // --- パドル操作（上下キー、画面外に出ないようクランプ） ---
  if (btn.up) {
    if (paddleY > 2) { paddleY -= 2; }
  }
  if (btn.down) {
    if (paddleY < 224) { paddleY += 2; }
  }

  // paddleBottom = paddleY + 8（DSLは複合式を使えないので都度計算する）
  paddleBottom = paddleY;
  paddleBottom += 8;

  // --- 当たり判定は「移動する前」の位置で行い、方向フラグだけを更新する ---
  // （移動してから判定すると、壁際で8bit値が0未満にラップして判定を取りこぼすため）

  // 上下の壁
  if (ballY < 2) { ballGoingDown = 1; }
  if (ballY > 228) { ballGoingDown = 0; }

  // 右の壁
  if (ballX > 248) { ballGoingRight = 0; }

  // パドルに当たったら跳ね返してSEを鳴らす
  if (ballX < 28) {
    if (ballY > paddleY) {
      if (ballY < paddleBottom) {
        ballGoingRight = 1;
        playTone(0, 28, 5);
      }
    }
  }

  // 取り逃したらボールをリセット（低めのSEで通知）
  if (ballX < 4) {
    ballX = 128;
    ballY = 120;
    ballGoingRight = 1;
    playTone(1, 12, 15);
  }

  // --- 判定結果の方向でボールを移動 ---
  if (ballGoingRight) { ballX += 2; } else { ballX -= 2; }
  if (ballGoingDown) { ballY += 2; } else { ballY -= 2; }

  drawSprite(0, 20, paddleY, 1, 0);
  drawSprite(1, ballX, ballY, 2, 0);
}
