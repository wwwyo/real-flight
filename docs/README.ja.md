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

Chrome で `http://localhost:8080` を開く。シミュレーターの機体は、空・雲・山・畑の景色に標的のマーカーを置き、その中でカメラを飛ばすので、実機なしでコックピット全体を動かせる。キーは `T` 離陸、`W/S` 上昇・下降、`A/D` 旋回、矢印キーで前後左右、`L` 着陸、`Space` 非常停止。URL に `?debug` を付けると、フレームレート・デコード待ち・検出時間を HUD に表示する。WebXR は [Immersive Web Emulator](https://github.com/meta-quest/immersive-web-emulator) 拡張で机上で試せる。

最初に離陸したタブが、切断するまで操縦権を持つ。ほかのタブは閲覧だけになり、飛行中に操縦タブが切断すると、ドローンは10秒間ホバリングして待つ。その間にコックピットを開き直して離陸ボタンを押せば操縦に戻れ、戻らなければ着陸する。待つ間もどのタブからでも着陸と非常停止はできる。デコードされた映像が1秒以上更新されなければ、コックピットは映像が止まっている秒数つきの警告を表示する。操縦はそのまま効く。映像は戻ることがあり、機体が勝手に止まったり着陸したりしない。映像がなくても着陸と非常停止は操作できる。操縦タブが切断せずに沈黙した場合（ブラウザがタブを凍結した等）は、relay が最後のスティック入力を打ち消したあと沈黙し、Tello 自身の「15秒間コマンドが無ければ自動着陸する」フェイルセーフで降りる想定（[ADR 0002](adr/0002-safety-stays-on-the-drone.md)）。ただし relay 側も機体側も実機未検証なので、最初の実機出撃は着陸ボタンを構えて行い、アリーナではフェイルセーフに頼らない。着陸後は録画が終わる5秒後まで次の離陸を待つ。飛行中に離陸ボタンを押しても出撃はリセットされない。

ローカルの確認は `bun test` と `bun run typecheck`。シミュレーターのサーバーを起動した状態で `bun run test:e2e` を実行すると、WebSocket API を通して操縦権を検証する。接続先は `REAL_FLIGHT_TEST_URL` で変更できる。サーバーが `drone: sim` と返さなければ、テストは操縦コマンドを送らずに終了する。

実機（Tello と、開発者モードの Quest 3）では次のようにする。

```bash
DRONE=tello bun run start    # Mac を Tello の Wi-Fi につないだ状態で
adb reverse tcp:8080 tcp:8080
```

Quest のブラウザで `http://localhost:8080` を開き、「Enter VR」を押す。出撃は離陸から着陸の数秒後まで録画され、Mac の `recordings/` に保存される。標的は `http://localhost:8080/markers` から印刷する。
