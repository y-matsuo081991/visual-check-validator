# Visual Check Validator (VCV) - AI Agent Guidelines

本ファイルは、AIエージェントが本プロジェクト（`visual-check-validator`）を操作する際に遵守すべき絶対のガイドライン（Ground Truth）です。

## 1. Project Overview (プロジェクト概要)
データセンターの配線監査をオフライン（電波暗室）で行うための Edge AI アプリケーション。
クラウドに依存せず端末単体で0.1秒推論を行い、機密情報（IPアドレス等）をエッジ側でマスキング（黒塗り）した上で、オンライン復帰後にGCPへ安全にエビデンスを同期します。

## 2. Tech Stack (技術スタック)
* **Frontend:** React 19, TypeScript, Vite, PWA
* **Edge AI:** `@tensorflow/tfjs` (v4.22.0+), `@tensorflow-models/coco-ssd`
* **Local DB:** `dexie`, `dexie-react-hooks`
* **Testing:** `vitest`, `@testing-library/react`

## 3. Architecture & Conventions (アーキテクチャと規約)
* **Offline-First:** iOS Safariの制約回避のため、StandaloneのPWAとして構成。
* **Sync-Aware UX:** ネットワークのサイレントエラーを防ぐため、Dexieを用いて「未同期〇件」のバッジを常時表示し、同期完了を以て作業完了（DoD）とする。
* **Zero-Warning Policy:** Linter (`eslint .`) および TypeScript (`tsc -b`) の警告・エラーはゼロを維持すること。

## 4. Anti-Patterns & Project Rules (絶対ルールと罠の回避)

### 4-1. TensorFlow.js (Edge AI) のメモリ管理
* **NEVER [Async Scope Trap]:** 非同期関数（`async/await`）内で `tf.engine().startScope()` と `endScope()` を使用してはならない。非同期タスクのインターリーブによりメモリリーク（OOM）が発生する。
* **ALWAYS [Explicit Dispose]:** 推論ループ内で映像からテンソルを生成する場合は明示的に行い、`try...finally` ブロックを用いて成功・エラーに関わらず必ず `.dispose()` でVRAMを解放すること。
* **ALWAYS [Video Dimensions]:** `tf.browser.fromPixels` に渡す `<video>` には、必ずHTMLタグとして `width` と `height` 属性（絶対値）を付与すること。CSSのみでは 0x0 テンソルとなり検知がサイレントに失敗する。
* **ALWAYS [WASM Fallback Versioning]:** `setWasmPaths` でCDNからバイナリを取得する際は、必ず `package.json` と同バージョンのWASMバイナリ（例: `@tensorflow/tfjs-backend-wasm@4.22.0`）を明示的に指定すること。

### 4-2. React とアニメーションループ
* **NEVER [Stale Closure in rAF]:** `requestAnimationFrame` を用いた推論ループを実装する際、コンポーネント内に直接定義した非同期関数を渡してはならない。また、安易に関数を `useRef` に詰めるハックも Strict Mode で初期化に失敗（Dead Loop）するため禁止する。
* **ALWAYS [Standard Effect Loop]:** ループの管理は必ず `useEffect` 内に閉じ込め、以下の方針を厳守すること。
  1. `let animationId: number;` を用いて、クリーンアップ関数で必ず `cancelAnimationFrame` を呼ぶ。
  2. Stateの更新は必ず「Functional Update (`setState(prev => prev + 1)`)」を使用し、クロージャ内の古い変数への依存を完全に断ち切る。
  3. ループの起動・停止は、イベントハンドラから直接行うのではなく、依存配列 (`[isScanning]`) を監視する `useEffect` の発火に委譲する。

### 4-3. セキュリティ (Defensive Masking)
* **ALWAYS [Fail-Safe Masking]:** ADR-002に基づき、Defensive MaskingがONの場合は、**検知件数が0件であっても背景を必ず黒塗り（`fillRect`）すること**。対象物が検知された場合のみ `destination-out` で「くり抜く」設計とし、情報漏洩（背景の素通し）を物理的に防ぐこと。

## 5. Build, Test & Run (AIが実行すべきコマンド)
AIはコード修正後、以下のコマンドを自律的に実行して妥当性を証明すること。
* **Dev Server:** `npm run dev`
* **Test (TDD):** `npm run test` (Vitest環境)
* **Linting:** `npm run lint` (ESLint)
* **Type Check:** `npm run build` (tsc -b)

## 6. Self-Correction (自己修復プロセス)
* JSdom環境でWeb API（Canvas, MediaStream, WebGL）をテストする場合は必ず適切なモック（`vi.mock`, `vi.stubGlobal`）を用意し、テスト自体のサイレントエラー（偽のGREEN）を警戒すること。
* ルールに違反したコードを発見した場合、ユーザーの指示を待たずに自律的に修正を提案すること。
