# VLS System — Status Report

**最終更新**: 2026-03-01
**ブランチ**: main (`24684a3`)
**本番URL**: https://vls-system.vercel.app
**デモURL**: https://vls-demo.vercel.app (/ → /demo 自動リダイレクト)

---

## 完成済み機能一覧 (27件)

### ユーザーフロー (5ステップ + 補助3ページ)

| # | 機能 | ページ | 概要 |
|---|------|--------|------|
| 1 | ログイン | `/`, `/e/[slug]` | パスワード認証 + slug自動ログイン |
| 2 | アンケート | `/survey` | 名前入力 + 3問タグ選択 (テーマ/サービス/年齢) |
| 3 | CM再生 | `/processing` | スコアリングCMマッチング → Platinum 15s + Matched 30s/60s |
| 4 | 写真選択 | `/photos` | 低画質プレビュー (30%解像度+blur+3x3透かし) + マルチセレクトギャラリー |
| 5 | 完了 | `/complete` | SVGフレーム合成DL + 写真DL + メール後日DL + プラチナバナー + オファー |
| 6 | デモ体験 | `/demo` | パスワード不要5ステップウォークスルー (CM 5秒短縮、analytics無し) |
| 7 | モバイルQRチェックイン | `/scan` | html5-qrcode カメラ読取 + 手動選択 + ワンタップチェックイン |
| 8 | メールDLリンク | `/dl/[token]` | 後日メール送付 (Resend) + 7日有効トークン + 写真DLページ |

### 管理画面 (14タブ + 7サブページ)

| # | 機能 | パス/タブ | 概要 |
|---|------|----------|------|
| 8 | ダッシュボード | `/admin` | 14タブ統合管理画面 (ダッシュボード, イベント, 写真, 企業, CM動画, アンケート, ストレージ, ファネル, マッチング, 通知ログ, エラーログ, 設定, チェックイン, CSV) |
| 9 | イベント管理 | `/admin/events` | CRUD + QRコード生成 + 共有URL |
| 10 | アンケート分析 | `/admin/analytics` | Recharts日付フィルター + ファネル + 離脱分析 |
| 11 | CM統計 | `/admin/stats` | 企業別CM再生数・完了率ダッシュボード |
| 12 | ユーザー管理 | `/admin/users` | セッション一覧 + CSV出力 |
| 13 | CSVインポート | `/admin/import` | 参加者/イベント/ライセンス/企業の4タブ一括取込 |
| 14 | チェックイン | `/admin/checkin` | イベント選択 → 検索 → ワンクリックチェックイン → バルク操作 |
| 15 | ライブダッシュボード | `/admin/live` | 当日リアルタイムKPI (5秒ポーリング) + フルスクリーン + チェックイン進捗リング + アラート通知 |

### インフラ・基盤

| # | 機能 | 概要 |
|---|------|------|
| 16 | マルチテナント | 3テナント (さくら学園/ひまわり幼稚園/イベントプロ) + Super Admin。データ分離 + ライセンス管理 |
| 17 | Cloudflare D1 永続化 | localStorage キャッシュ + D1 KVストア (9キー)。DbSyncProvider で起動時同期 |
| 18 | Cloudflare R2 ストレージ | テナントスコープ写真アップロード/一覧/削除 + HMAC署名付きPresigned URL |
| 19 | CMスコアリングマッチング | テーマ15pt + サービス20pt + 年齢25pt + Tier30pt + 広範囲15pt (22社4Tier) |
| 20 | 請求書PDF生成 | jsPDF日本語対応。企業別請求書自動生成 |
| 21 | 通知システム | Resend (primary) → SendGrid (fallback) → console.log 3段フォールバック |

### セキュリティ・品質

| # | 機能 | 概要 |
|---|------|------|
| 22 | API認証ミドルウェア | `middleware.ts` 統合。ADMIN_API_RULES テーブルでルート×メソッド保護。JWT or x-admin-password |
| 23 | CSRF保護 | Double-submit cookie パターン。csrf_token cookie + x-csrf-token ヘッダー検証 |
| 24 | SEO/OGP | metadataBase + title template + OG画像動的生成 (1200x630) + Twitter Card + 全12ページ個別metadata |
| 25 | ダークモード | `darkMode: "class"` + DarkModeProvider + 全管理画面・UIコンポーネント対応 |
| 26 | アクセシビリティ | ARIA属性 + focus-visible + SkipToContent + キーボードナビ + sr-only + モーダルEsc/auto-focus |
| 27 | Sentryエラー監視 | @sentry/nextjs v10 (client/server/edge) + /monitoring tunnel。DSN未設定時自動無効化。D1エラーログと併用 |
| 28 | テナントブランディング | primaryColor + logoUrl + CSS変数テーマ切替 + 設定タブ編集 |
| 29 | 削除カスケード | `deleteTenantCascade()` — 子レコード全削除 + 影響サマリー確認ダイアログ |
| 30 | E2Eテスト | Playwright 67テスト (11 spec)。QRチェックインフロー含む |
| 31 | デモサイト別デプロイ | vls-demo.vercel.app — middleware ホスト名判定で / → /demo リダイレクト |
| 32 | PWAオフラインモード | Service Worker (app shell cache) + IndexedDB (offline D1 sync queue) + OfflineIndicator UI |
| 33 | 写真AI自動分類 | Claude Vision API (Haiku) で写真シーン分類 (個人/グループ/会場/アクティビティ)。フィルター + 手動分類 + 一括AI分類 |
| 34 | スポンサーレポートPDF | 企業別CM再生数・完了率・平均視聴秒・属性分布・CPV試算。jsPDF A4 PDF即DL |
| 35 | 写真プレビュー低画質化 | 30%解像度 + blur(1.5px) + "© 未来発見ラボ" 3x3グリッド透かし (alpha 0.30) |
| 36 | フレーム合成プレビュー | Canvas描画で選択写真 + frame-template.svg を合成プレビュー表示。DLボタン廃止 |
| 37 | プラチナスポンサーバナー | platinumCMs全社 (max3) を complete/downloading 画面に sticky bottom 表示 |
| 38 | 写真公開期間管理 | EventData に publishedAt/expiresAt/status 追加。期限UI + アーカイブ + ログイン時期限チェック |
| 39 | メール後日DL送付 | /api/send-download-link (Resend) + /dl/[token] DLページ + 7日有効トークン |
| 40 | Webhook外部連携 | /admin 設定タブ Webhook設定UI。チェックイン/DL完了/CM視聴/アンケート回答時にPOST通知。リトライ3回+配信ログ |

---

## 未実装・残タスク

### HIGH — Phase 2 実装予定

| ID | 内容 | ページ | 概要 |
|----|------|--------|------|
| P2-1 | ✅ スポンサーレポートPDF | `/admin` レポートタブ | 企業別CM再生数・完了率・属性分布・CPV試算をPDF自動生成 (`87b86b5`) |
| P2-2 | ✅ ライブイベントダッシュボード | `/admin/live` | 当日リアルタイムKPI (5秒ポーリング) + フルスクリーン + チェックイン進捗リング + アラート通知 |
| P2-3 | ✅ Webhook外部連携 | `/admin` 設定タブ | チェックイン/DL完了/CM視聴/アンケート回答時にPOST通知 (Slack/LINE/Zapier) (`b884b66`) |
| P2-4 | ✅ 写真AI自動分類 | `/admin/photos` | Claude Vision APIでシーン分類 + ギャラリーフィルター (`73bf4bf`) |
| P2-5 | マルチイベント統合管理 | `/admin/command` | 同日複数イベント横断KPI + 異常検知ハイライト |
| P2-6 | ✅ PWAオフラインモード | 全ページ | Service Worker + IndexedDB。オフラインチェックイン対応、オンライン復帰時D1自動同期 (`ee11fc2`) |

### その他 (未着手)

| ID | 優先度 | 内容 | 備考 |
|----|--------|------|------|
| L3 | LOW | 実CM動画差替え | 現在はパブリックYouTube動画 (Rick Astley等)。実スポンサーCM素材待ち |
| L4 | LOW | 実企業ロゴ差替え | 現在は ui-avatars.com テキストアイコン。実ロゴ画像待ち |
| A2 | LONG-TERM | 認証強化 | パスワード文字列比較のみ → NextAuth/Clerk sessions + RBAC |
| M1 | MEDIUM | モバイル最適化 | Admin テーブル横スクロール + タッチ操作最適化 |

### 環境設定のみ (コード変更不要)

| 項目 | コマンド | 現状 |
|------|---------|------|
| Sentry本番有効化 | `vercel env add NEXT_PUBLIC_SENTRY_DSN` | DSN未設定のため無効 |
| SendGrid設定 | `vercel env add SENDGRID_API_KEY` | Resend のみ有効 |
| 写真AI分類有効化 | `vercel env add ANTHROPIC_API_KEY` | 未設定時は手動分類のみ |

### tasks.txt 残タスク

| タスク | 状態 |
|--------|------|
| matching.ts platinum枠ランダム抽選化 | ✅ 完了 (`783ba6d`) |

---

## Phase 2 — 次フェーズ機能提案 (ビジネスインパクト順)

| # | 機能 | ページ | 概要 | Why |
|---|------|--------|------|-----|
| P2-1 | スポンサーレポートPDF | `/admin/reports` | 企業別CM再生数・完了率・属性分布・CPV試算をPDF自動生成。jsPDF + Chart.js canvas export活用 | 営業資料自動化 → 契約更新率UP |
| P2-2 | ライブイベントダッシュボード | `/admin/live` | 当日リアルタイム画面。チェックイン進捗・CM視聴中人数・DL完了数 (5秒ポーリング) + フルスクリーン + アラート通知 | イベント当日の即時状況判断 |
| P2-3 | Webhook外部連携 | `/admin` 設定タブ | チェックイン/DL完了/CM視聴/アンケート回答時にPOST通知。Slack/LINE/Zapier連携。リトライ3回 + ログ | 既存業務フロー組み込み |
| P2-4 | 写真AI自動分類 | `/admin/photos` | R2アップロード時にClaude Vision APIでシーン分類 + 顔検出カウント → ギャラリーフィルター | 写真探し時間削減 → DL率UP |
| P2-5 | マルチイベント統合管理 | `/admin/command` | 同日複数イベントの横断KPI表示 (チェックイン率/CM視聴率/DL率) + 異常検知ハイライト | 複数会場並行運営対応 |

---

## 技術スタック

| カテゴリ | 技術 |
|----------|------|
| Framework | Next.js 14.2 (App Router) |
| Language | TypeScript 5, React 18 |
| Styling | Tailwind CSS 3.4 |
| Animation | framer-motion |
| Charts | Chart.js (react-chartjs-2) + Recharts |
| PDF | jsPDF |
| QR | qrcode + html5-qrcode |
| Storage | Cloudflare R2 + D1 |
| Auth | NextAuth (credentials) + JWT |
| AI | Claude Haiku 4.5 Vision (写真分類) |
| Monitoring | Sentry + D1エラーログ |
| Testing | Playwright (67 tests) |
| PWA | Service Worker + IndexedDB (offline sync queue) |
| Deploy | Vercel (本番 + デモ 2プロジェクト) |

---

## デプロイ履歴 (直近)

| 日付 | コミット | 内容 |
|------|---------|------|
| 2026-03-01 | `24684a3` | トップページブランディング変更 — 未来開発ラボ + 六角形SVGロゴ |
| 2026-03-01 | `b9e679c` | PhotoGrid UI改善 — ボタンバー追加、左上チェックマーク削除 |
| 2026-03-01 | `e951707` | downloading/page.tsx 下部スポンサーバナー削除 |
| 2026-03-01 | `ccee15f` | complete/page.tsx Canvas描画フレーム合成プレビュー実装 |
| 2026-03-01 | `af40fc4` | complete/page.tsx フレームDLボタン削除 + 選択写真プレビューに変更 |
| 2026-03-01 | `b884b66` | Webhook外部連携 (P2-3) — 設定UI + チェックイン/DL/CM/アンケート POST通知 + リトライ3回 |
| 2026-03-01 | `b19714e` | 5要件一括実装 (#1写真低画質, #3プラチナバナー, #5公開期間, #6メールDL, #8フレーム合成) |
| 2026-03-01 | `b12a99e` | ライブイベントダッシュボード (P2-2) — 5秒ポーリング + フルスクリーン + アラート |
| 2026-03-01 | `87b86b5` | スポンサーレポートPDF (企業別KPI + CPV試算 + jsPDF A4) |
| 2026-03-01 | `73bf4bf` | 写真AI自動分類 (Claude Vision API + フィルター + 手動/一括分類) |
| 2026-03-01 | `ee11fc2` | PWAオフラインモード (SW + IndexedDB + OfflineIndicator) |
| 2026-03-01 | `783ba6d` | a11y強化 (管理画面全10タブ) + platinum ランダム抽選 |
| 2026-03-01 | `b928d88` | /scan モバイルQRチェックイン |
| 2026-03-01 | `d3b966b` | /demo デモ体験 + complete バグ修正 + CM動画ID長尺化 |
| 2026-03-01 | `cd87aeb` | Phase 2 提案追加 |
| 2026-02-28 | `ea24f6b` | Sentry エラー監視 |
| 2026-02-28 | `250c3b9` | CM動画URL自動抽出 + アクセシビリティ強化 |
