# ADR-008: Resilience and Memory Leak Prevention

## Status
* **Status:** Proposed
* **Date:** 2026-06-10
* **Deciders:** [TBD / プロジェクトメンバー]

## Context and Problem Statement (背景と課題)
コードレビューを通じ、エッジAIのオフライン動作と同期アーキテクチャにおいて、以下の3つの重大な信頼性のリスク（非機能要件の欠如）が特定された。

1. **推論ループのゾンビ化（メモリリーク）:**
   `requestAnimationFrame` を用いたAI推論（`useInferenceLoop`）において、React コンポーネントのアンマウント時にキャンセル処理は実装されているものの、非同期処理（`await detect()`）の完了直後に再びループを呼び出してしまう状態が存在している。これにより、カメラ停止後も裏側で推論ループが回り続けるメモリリーク（ゾンビ化）が発生し、端末の異常発熱やバッテリー枯渇を引き起こす。
   
2. **ネットワーク再接続時の「静かなる未同期」 (Silent Failure):**
   オフライン環境での作業を前提とした Sync-Aware UX にて、未同期バッジが存在する間にユーザーがタブを閉じたり、Safariをスワイプキルした場合、データは Dexie (IndexedDB) に保存されたままクラウド同期が実行されないまま取り残されてしまう。
   
3. **バックエンド通信時の冪等性の欠如:**
   不安定なネットワーク環境（Flaky Network）において、クライアントがGCP（Cloud Functions / API）へデータを送信した後、200 OK のレスポンスを受け取る前に接続が切れた場合、クライアントはリトライを試みる。現状、バックエンド側でこの重複リクエスト（同一データ）を識別・排除する機構がないため、GCPの Firestore に二重のレコードが保存されるレースコンディション（冪等性の欠如）のリスクがある。

## Decision Drivers (決定要因)
* 端末（モバイル含む）のリソース保護（CPU/GPUメモリ・バッテリー）
* オフライン作業下でのデータロストの防止（Sync-Aware UXの実現）
* 不安定なネットワーク環境下でのデータ整合性の担保

## Considered Options (検討した代替案)
* **Option 1 (`beforeunload` + 同期APIへの依存):** 実装は容易だが、iOS Safari 等のモバイル環境ではタブのキル時に発火が保証されず、データロストの根本解決にならないため却下。
* **Option 2 (`visibilitychange` + IndexedDB + 状態フラグ管理):** 本命案。ページがバックグラウンドに回った時点で状態を確実にローカルへ保存し、オンライン復帰時に同期を図るアプローチ。モバイルでの信頼性が高いため採用。
* **Option 3 (定期的なポーリングによる強制同期):** 実装はシンプルになるが、オフラインを前提とする本システムでは通信エラーが多発し、バッテリー消費も激しいため不採用。

## Decision Outcome (決定事項)
これらの問題を解決し、エンタープライズ品質の堅牢性を担保するため、以下の実装と設計ルールを導入する。

1. **非同期キャンセルフラグとリソース破棄（ゾンビプロセス防止）:**
   推論ループ（`useInferenceLoop`）のクリーンアップ関数（`useEffect` の return）内で非同期処理を安全に終了させるため、`isCancelled` フラグを導入する。`await detect()` の復帰直後にこのフラグを評価し、破棄済みの場合はループを再開しない。
   さらに、**`cancelAnimationFrame`** の確実な呼び出しと、TensorFlow.js/MediaPipe 等の**推論モデルやカメラストリームリソースの明示的な破棄（`dispose()` / `track.stop()`）**を義務付ける。可能であれば `AbortController` も併用する。

2. **`visibilitychange` イベントと Background Sync への移行 (タブ離脱対策):**
   モバイル環境では `beforeunload` が発火しないことが多いため、離脱警告用途に限定する。
   代わりに **`visibilitychange`** イベントを利用し、ページがバックグラウンドに回った瞬間に状態を IndexedDB へ保存する。
   将来的（Future Work）には、PWA の **Background Sync API** を導入し、オフライン時にIndexedDBへ保存したデータをオンライン復帰時にバックグラウンドで自動同期するアーキテクチャへ移行する。

3. **GCP側での Idempotency Key (冪等性キー) 処理の義務化:**
   フロントエンドの送信リトライロジックは維持した上で、データ送信時は必ず各レコード固有の UUID (`id` フィールド) を付与する。バックエンドの Cloud Functions および Firestore 側でこれを Idempotency Key（冪等性キー）として扱い、トランザクション処理等で既存の `id` を確認してから Append-Only で保存する設計を運用要件に加える。

## Consequences (影響)

### Positive Consequences
* 端末のリソース枯渇（VRAMリーク）とクラッシュを防止できる。
* `visibilitychange` と Background Sync の組み合わせにより、より確実なデータ保存と同期が可能になる。
* 通信不安定環境下でのデータの増殖を防ぎ、監査ログの正確性を担保できる。

### Negative Consequences
* バックエンド側（Cloud Functions等）の実装にも冪等性担保のロジック（トランザクション処理等）を追加・設計する必要がある。
* `visibilitychange` や Background Sync API の実装は、既存の単純な通信ロジックよりも複雑になる。 Safari など一部ブラウザのAPI対応状況に留意する必要がある。

## Links (関連リンク)
* [MDN Web Docs: visibilitychange event](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event)
* [MDN Web Docs: Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)
* [React Docs: Synchronizing with Effects (Cleanup logic)](https://react.dev/learn/synchronizing-with-effects)
