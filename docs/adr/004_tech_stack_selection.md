# ADR-004: 完全オフライン・エッジ推論を実現する技術スタックの選定

## Status
* Accepted

## Context (背景と課題)
ADR-001〜003で決定した「完全オフライン（電波暗室）動作」「TensorFlow.jsによるEdge AI」「GCPサーバーレス（Firestore/Storage）」というビジネス要件・アーキテクチャ要件を実現するため、具体的なフロントエンドおよびバックエンドのフレームワーク選定が必要となった。
また、現場のデバイスが「iOS端末（Safari）」となる想定であり、iOS特有のWeb機能の制約（Background Sync非対応、Private Browsing時のIndexedDB無効化等）を回避できるスタックを選ぶ必要があった。

## Decision (決定事項)
以下の技術スタック（Golden Stack）を採用する。

1. **UIフレームワーク: `React (Vite) + TypeScript + PWA`**
   * **選定理由:** SSR（Server Side Rendering）が不要な完全オフラインアプリであるため、Next.jsではなく、軽量で静的ビルドが高速な Vite ベースの SPA (Single Page Application) を採用。iOSの「7日間未使用でIndexedDBが消去される」仕様を回避するため、必ず「ホーム画面に追加（PWA）」する運用とする。
2. **Edge AIエンジン: `TensorFlow.js (tfjs-backend-webgl / wasm)`**
   * **選定理由:** iOS Safari上で動作し、マスキング用の `<canvas>` API と相性が良い。ただし、iOSの WebGL は16-bit浮動小数点（float16）テクスチャ制限があるデバイスが多く、32-bitモデルでは精度低下のリスクがある。そのため、精度問題が起きた場合は `WASM` バックエンドへフォールバックできる設計とする。
3. **ローカルデータベース: `Dexie.js (IndexedDB)`**
   * **選定理由:** 圏外で撮影した画像（Blobデータ）の一時保存先として、5MB制限のある localStorage は使用不可。大容量保存が可能なブラウザ標準の IndexedDB を採用し、ラップライブラリとして Dexie.js を利用する。
4. **クラウド・バックエンド: `Firebase (Firestore / Cloud Storage)`**
   * **選定理由:** Firestore Web SDK (v9+) の `persistentLocalCache` を有効化することで、追加のインフラ構築なしに「オフライン時のデータ読み書きとオンライン復帰時の自動同期」が実現できるため。

## Consequences (結果・影響)
* **[Good] インフラ管理の最小化:** サーバー側（Node.js等）のプロセスが不要となり、静的ファイルホスティングとBaaS（Firebase）のみで完結するため、運用コストが極めて低くなる。
* **[Bad] iOS Safariの制約依存:** PWAとして運用しない場合や、作業者が「プライベートブラウズモード」で起動した場合は IndexedDB が機能せず、オフライン動作が破綻する致命的リスク（罠）がある。運用マニュアルで「ホーム画面からの起動」を厳格に徹底する必要がある。
