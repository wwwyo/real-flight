# REAL FLIGHT

[English](../README.md)

実物のドローンが現実の空で戦う対戦ゲーム。操縦者は Quest 3 をかぶり、機体のカメラ映像を HUD 付きのコックピットとして見ながら Touch コントローラーで飛ばし、標的を照準に収め続けて撃墜する。観客はコックピット映像と実物の機体を並べて見る。

> 状態: MVP を開発中。操縦者1人・Tello 1機・ArUco マーカー付きの標的。ドローンは交換できる部品で、Tello は最初の検証機にすぎない。

## QuickStart

Mac が必要。Bun・ffmpeg・`adb` は `mise install` で入る。

```bash
mise install
bun install
bun run dev                  # シミュレーターの機体で http://localhost:8080 にコックピットを起動
```

Chrome で `http://localhost:8080` を開く。シミュレーターの機体は、標的のマーカーを置いた平らな世界の上でカメラを飛ばすので、実機なしでコックピット全体を動かせる。キーは `T` 離陸、`W/S` 上昇・下降、`A/D` 旋回、矢印キーで前後左右、`L` 着陸、`Space` 非常停止。URL に `?debug` を付けると、フレームレート・デコード待ち・検出時間を HUD に表示する。WebXR は [Immersive Web Emulator](https://github.com/meta-quest/immersive-web-emulator) 拡張で机上で試せる。

実機（Tello と、開発者モードの Quest 3）では次のようにする。

```bash
DRONE=tello bun run start    # Mac を Tello の Wi-Fi につないだ状態で
adb reverse tcp:8080 tcp:8080
```

Quest のブラウザで `http://localhost:8080` を開き、「Enter VR」を押す。出撃は離陸から着陸の数秒後まで録画され、Mac の `recordings/` に保存される。標的は `http://localhost:8080/markers` から印刷する。
