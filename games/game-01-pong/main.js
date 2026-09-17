// 1本目の同梱ゲーム: 壁打ちPong（シングルプレイ）
// 左側のパドルを上下キーで操作し、跳ね返るボールを打ち返し続けるだけのミニゲーム。
// docs/03_DSL_SPEC.md のv1（シーン/パーツ構成モデル）で書かれている。
// ボール(Ball)とパドル(Paddle)をそれぞれ独立した「パーツ」として定義し、
// シーン(Main)にインスタンスとして配置して組み合わせている。
//
// 遊び方: このファイルの中身をWeb IDEの「パーツ」「シーン」タブへ、パーツ・シーンごとに
// 分けて貼り付け（part {}/scene {}の中身だけをそれぞれのコードエディタへ）、
// パーツごとのドット絵タブでタイル0番に好きな絵を描いてから「ビルド&実行」を押す。
// 矢印キー(上/下)またはタッチパッドでパドルを操作する。

part Ball {
  field x = 128;
  field y = 120;
  field goingRight = 1;
  field goingDown = 1;

  // 上下・右の壁での跳ね返り判定（このパーツだけで完結する自己完結ロジック）。
  // 「移動する前」の位置で判定し、方向フラグだけを更新する
  // （移動してから判定すると、壁際で8bit値が0未満にラップして判定を取りこぼすため）。
  behavior checkWalls(self) {
    if (self.y < 2) { self.goingDown = 1; }
    if (self.y > 228) { self.goingDown = 0; }
    if (self.x > 248) { self.goingRight = 0; }
  }

  // 取り逃した（左端まで来た）場合のリセット。シーン側のパドル衝突判定の後に呼ぶことで、
  // 衝突判定の結果より優先してリセットされる（衝突域と取り逃し域が重なる左端付近でも安全）。
  behavior checkMiss(self) {
    if (self.x < 4) {
      self.x = 128;
      self.y = 120;
      self.goingRight = 1;
      playTone(1, 12, 15);
    }
  }

  behavior move(self) {
    if (self.goingRight) { self.x += 2; } else { self.x -= 2; }
    if (self.goingDown) { self.y += 2; } else { self.y -= 2; }
    drawSprite(1, self.x, self.y, 0, 0);
  }
}

part Paddle {
  field y = 100;
  field bottom = 108;

  behavior move(self) {
    if (btn.up) {
      if (self.y > 2) { self.y -= 2; }
    }
    if (btn.down) {
      if (self.y < 224) { self.y += 2; }
    }
    // self.bottom = self.y + 8（DSLは複合式を使えないので都度計算する）
    self.bottom = self.y;
    self.bottom += 8;
    drawSprite(0, 20, self.y, 0, 0);
  }
}

scene Main {
  instance ball: Ball;
  instance paddle: Paddle;

  function init() {
    setPalette(0, 1, 48, 0, 0);
    setSpritePalette(0, 1, 33, 48, 0);
  }

  function update() {
    Paddle.move(paddle);
    Ball.checkWalls(ball);

    // パドルに当たったら跳ね返してSEを鳴らす（ball.x/paddle.y/paddle.bottomという
    // パーツをまたいだ状態を読む、シーンレベルの相互作用ロジック）。
    if (ball.x < 28) {
      if (ball.y > paddle.y) {
        if (ball.y < paddle.bottom) {
          ball.goingRight = 1;
          playTone(0, 28, 5);
        }
      }
    }

    Ball.checkMiss(ball);
    Ball.move(ball);
  }
}
