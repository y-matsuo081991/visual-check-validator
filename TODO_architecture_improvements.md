# Architecture Improvements ToDo

現在のTech Spike（PoC）実装において、ADR (Architecture Decision Records) で定義された非機能要件（NFR）および機能要件に対して、いくつかの実装ギャップ（Drift）が存在します。
本番運用に向けた完全な「無敵状態（Enterprise-Grade）」のアーキテクチャを実現するため、以下のリファクタリングおよび追加実装を予定しています。

## 1. Resilience & Storage (耐障害性とデータ永続化)
- [x] **iOS特有の制約回避 (PWA化による IndexedDB データ永続化):**
  iOS Safari等における「7日間未使用による IndexedDB の自動消去仕様」を回避するため、`vite-plugin-pwa` を導入して `manifest.json` と Service Worker を構成し、ホーム画面インストールを前提としたPWAアーキテクチャを完成させる。
- [x] **Sync-Aware UX のUI実装 (ADR-001):**
  IndexedDB（Dexie）の未送信レコード数をリアクティブに監視し、UI上に「未同期〇件」というバッジを常時表示する。これにより、通信断時の「Silent Failure（静かなる失敗）」を防ぐ。
- [x] **【残タスク】オフライン挙動のテスト用スタブ実装 (Sync-Aware UX検証用):**
  オフライン時にデータを保存した場合の「未同期件数バッジの増減」およびオンライン復帰時の「自動同期」の挙動を手動でテスト・検証するため、`App.tsx` の画面上に「📸 検知結果を保存（テスト用）」ボタンを仮設し、IndexedDBへモックデータを書き込む処理を実装する。

## 2. Performance & Memory Management (パフォーマンスとメモリ管理)
- [x] **TF.js のメモリリーク解消 (ADR-004):**
  `useObjectDetection.ts` における推論ループ内で生成されるテンソルが解放されていない問題を解決するため、`tf.tidy()` または `tensor.dispose()` を導入し、モバイル端末でのOOM（Out Of Memory）クラッシュを防止する。
- [x] **推論ループのスロットリング:**
  `requestAnimationFrame` を用いた無制限の推論（約60fps）は、モバイル端末の熱暴走とバッテリー枯渇を招く。フレームレートを制限（例: 5fps）するスロットル制御を導入する。

## 3. Security & Fallback (セキュリティとフォールバック)
- [x] **Defensive Masking の実装 (ADR-002):**
  現在 `CameraScanner.tsx` はBounding Boxの描画のみを行っているが、AIが検知した対象物「以外」の背景をCanvas上で黒塗り（マスキング）する処理を追加実装し、機密情報の流出を物理的に遮断する。
- [x] **WASMバックエンドのフォールバック (ADR-004):**
  iOS環境等で WebGL の16-bit浮動小数点制限に起因する推論精度の低下が確認された場合に備え、`@tensorflow/tfjs-backend-wasm` を導入し、動的にバックエンドを切り替えられるフォールバック処理を実装する。
