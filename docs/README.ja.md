# REAL FLIGHT

[English](../README.md)

実物のドローンが現実の空で戦う対戦ゲーム。操縦者は Quest 3 をかぶり、機体のカメラ映像を HUD 付きのコックピットとして見ながら Touch コントローラーで飛ばし、標的を照準に収め続けて撃墜する。観客はコックピット映像と実物の機体を並べて見る。

> 状態: MVP を開発中。操縦者1人・Tello 1機・ArUco マーカー付きの標的。ドローンは交換できる部品で、Tello は最初の検証機にすぎない。

## QuickStart

Mac、Tello、開発者モードを有効にした Quest 3、`adb` が必要。

```bash
mise install
bun install
```

Mac を Tello の Wi-Fi につなぎ、Quest を USB で接続して `adb reverse` を実行し、Quest のブラウザでコックピットを開く。起動コマンドは最初の機能と一緒に追加する。
