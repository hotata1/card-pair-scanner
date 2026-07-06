# card-pair-scanner

モニター/LED表示上のタイル(中央にアルファベット1文字、隅に点滅する3桁数字)をスマホカメラで連続撮影し、「文字+3桁数字」のペアを完全クライアントサイドで識別・記録するWebアプリ。

- 完全オフライン動作(バックエンドなし、GitHub Pages配信予定)
- 認識エンジン2系統: テンプレート照合(既定・軽量)/ Tesseract.js(比較用・アセット同梱)
- 開発用シミュレータ内蔵(実カメラ・実表示なしで全パイプラインを検証可能)

## 起動

```sh
npm install
npm run dev
```

ブラウザで表示されたURL(既定 http://localhost:5173)を開くと本番アプリが起動する。

- **本番アプリ**(`/`): カメラプレビュー+自動/手動撮影+記録一覧・修正・削除+設定(間隔/閾値/エンジン/ソース)
- **開発ハーネス**(`/harness.html`): シミュレータ映像に対する認識の検出枠・処理時間・精度統計(真値突合)を表示。エンジン比較・パラメータ調整用
- **表示用シミュレータ**(`/display.html`): カード盤面を画面いっぱいに静止表示するだけのページ。PC等の画面にこれを映し、**スマホの実カメラでその画面を撮影**すれば、アプリ内蔵シミュレータを介さずに「実カメラ→認識パイプライン」を通しでテストできる。`?seed=123` を付けると同じ盤面を再現可能

カメラはHTTPSまたはlocalhostでのみ利用可。PCでの動作確認は設定(または許可拒否時の案内)から「シミュレータ」に切り替える。実カメラの経路自体をテストしたい場合は、別のPC/モニターで `/display.html` を開いてスマホで撮影する。

## テスト

```sh
npm test        # 例示テスト + プロパティベーステスト(fast-check)
npm run typecheck
```

- PBTはドメインジェネレータ(`tests/generators.ts`)を使用。失敗時は fast-check が **seed と縮小済み最小反例** を出力するので、そのseedで再現できる
- 合成フォント(`tests/synthetic-font.ts`)によりCanvas/DOMなしのNode上で分類・E2Eを検証

## 構成

| パス | 役割 | ユニット |
|---|---|---|
| `src/vision/preprocess/` | グレースケール・Otsu二値化・連結成分・縮小 | Unit 1 |
| `src/vision/detect.ts` | タイル/数字分離・3桁チェーン・ペア対応付け(エンジン共通) | Unit 1 |
| `src/vision/template/` | テンプレート照合エンジン(回転バンク+Dice係数) | Unit 1 |
| `src/vision/tesseract/` | Tesseract.jsエンジン(`public/tesseract/` のアセットを使用) | Unit 1 |
| `src/vision/registry.ts` | エンジン切替・フォールバック | Unit 1 |
| `src/sources/` | 映像ソース抽象(実カメラ / シミュレータ) | Unit 1 |
| `src/sim/` | シミュレータ(仮想モニター+手ブレ、シード再現可) | Unit 1 |
| `src/harness/` | 精度検証(シーン真値との突合) | Unit 1 |
| `src/state/` | RecordStore(IndexedDB永続化・重複排除・修正/削除)+ SettingsStore | Unit 2 |
| `src/services/` | 閾値判定・記録フロー(RecognitionService)+ 撮影制御(CaptureController) | Unit 2 |
| `src/ui/` | 1画面UI(カメラビュー/インジケータ/一覧/設定/ダイアログ) | Unit 2 |
| `src/main.ts` | 本番エントリ | Unit 2 |
| `src/harness-main.ts` + `harness.html` | 開発ハーネスページ | Unit 1 |
| `src/display-main.ts` + `display.html` | 表示用シミュレータ(実カメラ撮影対象) | Unit 1 |

## 実フォントへの差し替え

テンプレートは `src/vision/template/templates.ts` の `TARGET_FONTS` から起動時に生成される。実表示のフォントが判明したらここを差し替える(シミュレータ側は `src/sim/simulator.ts` の `SIM_FONT_FAMILY`。意図的に不一致にしてフォント頑健性を測っている)。

## デプロイ(GitHub Pages)

1. GitHubに新規リポジトリを作成(名前は任意 — base は相対パスなので何でも動く)
2. このディレクトリ(card-pair-scanner/)をリポジトリのルートとしてpush(mainブランチ)
3. リポジトリの **Settings → Pages → Source = "GitHub Actions"** を選択
4. push すると `.github/workflows/deploy.yml` が テスト → ビルド → デプロイ を自動実行(テスト失敗時はデプロイされない)

## オフライン動作の検証手順

1. `npm run build && npm run preview` (または公開URL)をブラウザで開く
2. 一度読み込んだら、DevTools → Network → Offline(実機なら機内モード)
3. 再読み込みしてもアプリが起動し、撮影・記録が動作すればOK
4. Tesseractエンジンは**一度使ってから**オフラインにすること(アセットは初回使用時にキャッシュされる設計)

## 設計ドキュメント

AI-DLCワークフローの成果物を参照: `../aidlc-docs/`(要件・ストーリー・設計・ユニット計画)
