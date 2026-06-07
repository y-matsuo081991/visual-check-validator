# N/A: 次期フェーズに向けたE2Eテスト基盤およびBFF連携の戦略

## Status
* Proposed

## Context (背景と課題)
PoC (Tech Spike) フェーズにおいて、Edge AI (TensorFlow.js) を用いたオフライン推論と、Sync-Aware UX（非同期キューイング・冪等性の担保）の実装・単体テストは完了し、システムの高いレジリエンスが証明された。
しかし、本番運用（Day 2 Operations）へ向けて、以下のアーキテクチャ上の課題（Test/Integration Gap）が残存している。

1. **視覚的テストの欠落:** 現在のテスト基盤（Vitest + JSDOM）では、Canvas API をモックしているため、「Defensive Masking（黒塗り）」が実際のブラウザのピクセル上で正確に描画されているかを証明できない。
2. **BFF連携時の API Drift:** 現在はローカル環境用のフォールバック（500ms遅延モック）で動作しているが、実際のGCPエンドポイントと連携した際、スキーマの変更（API Drift）によるサイレントエラーや実行時クラッシュが懸念される。
3. **実機パフォーマンステストの不在:** 10fpsへのスロットリングは実装済みだが、ローエンドタブレット等での長時間のサーマルスロットリング（熱暴走）限界値がプロファイリングされていない。

## Decision (決定事項)
これらの課題を解決し、エンタープライズ品質を完全なものにするため、次期開発フェーズにおいて以下のアーキテクチャ要素を導入することを決定（提案）する。

1. **Playwright と Agentic Visual QA の導入:**
   * E2Eテストフレームワークとして `Playwright` を導入し、実際の Chromium/WebKit 環境でテストを実行する。
   * テスト内で UI のスクリーンショットを自動撮影し、VLM (Vision Language Model) を用いた `Agentic Visual QA` パイプラインに流し込むことで、マスキングの座標ズレやUI崩れを自動検知する。
2. **Zod による実行時バリデーション (Schema-Driven Development):**
   * BFF（バックエンド）から提供される `openapi.json` と同期する Zod スキーマを導入し、`syncService.ts` 等でのフェッチ時に防衛的パース（Defensive Runtime Parsing）を行う。
3. **実機プロファイリング環境の構築:**
   * 長時間稼働時の VRAM 推移とフレームドロップを可視化するデバッグ用のダッシュボードモードを開発し、実機での耐久テストを実施する。

## Consequences (結果・影響)
* **[Good] セキュリティの視覚的証明:** Defensive Masking の確実性がピクセルレベルで自動保証され、情報漏洩リスクへの監査耐性が劇的に向上する。
* **[Good] 実行時の安全性:** API Drift による UI クラッシュ（Cannot read property of undefined 等）を、Zod によるフェイルセーフ層で完全に遮断できる。
* **[Bad] ビルド・テスト時間の増加:** Playwright と VQA パイプラインの導入により、CI/CD の実行時間が大幅に増加する。VQAの実行コスト（API課金）もトレードオフとなる。
* **[Bad] バンドルサイズの微増:** Zod および関連するスキーマ定義の導入により、フロントエンドの初期バンドルサイズがわずかに増加する。
