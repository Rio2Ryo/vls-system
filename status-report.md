# VLS System — Status Report

**最終更新**: 2026-03-01
**ブランチ**: main (`b928d88`)
**本番URL**: https://vls-system.vercel.app
**デモURL**: https://vls-demo.vercel.app (/ → /demo 自動リダイレクト)

---

## 完成済み機能一覧 (17件)

### ユーザーフロー (5ステップ + 補助2ページ)

| # | 機能 | ページ | 概要 |
|---|------|--------|------|
| 1 | ログイン | `/`, `/e/[slug]` | パスワード認証 + slug自動ログイン |
| 2 | アンケート | `/survey` | 名前入力 + 3問タグ選択 (テーマ/サービス/年齢) |
| 3 | CM再生 | `/processing` | スコアリングCMマッチング → Platinum 15s + Matched 30s/60s |
| 4 | 写真選択 | `/photos` | マルチセレクトギャラリー + Canvas透かし + プレビューモーダル |
| 5 | 完了 | `/complete` | 記念フレームPNG DL + 写真DL + オファー/クーポン表示 |
| 6 | デモ体験 | `/demo` | パスワード不要5ステップウォークスルー (CM 5秒短縮、analytics無し) |
| 7 | モバイルQRチェックイン | `/scan` | html5-qrcode カメラ読取 + 手動選択 + ワンタップチェックイン |

### 管理画面 (14タブ + 6サブページ)

| # | 機能 | パス/タブ | 概要 |
|---|------|----------|------|
| 8 | ダッシュボード | `/admin` | 14タブ統合管理画面 (ダッシュボード, イベント, 写真, 企業, CM動画, アンケート, ストレージ, ファネル, マッチング, 通知ログ, エラーログ, 設定, チェックイン, CSV) |
| 9 | イベント管理 | `/admin/events` | CRUD + QRコード生成 + 共有URL |
| 10 | アンケート分析 | `/admin/analytics` | Recharts日付フィルター + ファネル + 離脱分析 |
| 11 | CM統計 | `/admin/stats` | 企業別CM再生数・完了率ダッシュボード |
| 12 | ユーザー管理 | `/admin/users` | セッション一覧 + CSV出力 |
| 13 | CSVインポート | `/admin/import` | 参加者/イベント/ライセンス/企業の4タブ一括取込 |
| 14 | チェックイン | `/admin/checkin` | イベント選択 → 検索 → ワンクリックチェックイン → バルク操作 |

### インフラ・基盤

| # | 機能 | 概要 |
|---|------|------|
| 15 | マルチテナント | 3テナント (さくら学園/ひまわり幼稚園/イベントプロ) + Super Admin。データ分離 + ライセンス管理 |
| 16 | Cloudflare D1 永続化 | localStorage キャッシュ + D1 KVストア (9キー)。DbSyncProvider で起動時同期 |
| 17 | Cloudflare R2 ストレージ | テナントスコープ写真アップロード/一覧/削除 + HMAC署名付きPresigned URL |
| 18 | CMスコアリングマッチング | テーマ15pt + サービス20pt + 年齢25pt + Tier30pt + 広範囲15pt (22社4Tier) |
| 19 | 請求書PDF生成 | jsPDF日本語対応。企業別請求書自動生成 |
| 20 | 通知システム | Resend (primary) → SendGrid (fallback) → console.log 3段フォールバック |

### セキュリティ・品質

| # | 機能 | 概要 |
|---|------|------|
| 21 | API認証ミドルウェア | `middleware.ts` 統合。ADMIN_API_RULES テーブルでルート×メソッド保護。JWT or x-admin-password |
| 22 | CSRF保護 | Double-submit cookie パターン。csrf_token cookie + x-csrf-token ヘッダー検証 |
| 23 | SEO/OGP | metadataBase + title template + OG画像動的生成 (1200x630) + Twitter Card + 全12ページ個別metadata |
| 24 | ダークモード | `darkMode: "class"` + DarkModeProvider + 全管理画面・UIコンポーネント対応 |
| 25 | アクセシビリティ | ARIA属性 + focus-visible + SkipToContent + キーボードナビ + sr-only + モーダルEsc/auto-focus |
| 26 | Sentryエラー監視 | @sentry/nextjs v10 (client/server/edge) + /monitoring tunnel。DSN未設定時自動無効化。D1エラーログと併用 |
| 27 | テナントブランディング | primaryColor + logoUrl + CSS変数テーマ切替 + 設定タブ編集 |
| 28 | 削除カスケード | `deleteTenantCascade()` — 子レコード全削除 + 影響サマリー確認ダイアログ |
| 29 | E2Eテスト | Playwright 67テスト (11 spec)。QRチェックインフロー含む |
| 30 | デモサイト別デプロイ | vls-demo.vercel.app — middleware ホスト名判定で / → /demo リダイレクト |

---

## 未実装・残タスク

### 未着手 (コード変更が必要)

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

### tasks.txt 残タスク

| タスク | 状態 |
|--------|------|
| matching.ts platinum枠ランダム抽選化 | 未着手 |

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
| Monitoring | Sentry + D1エラーログ |
| Testing | Playwright (67 tests) |
| Deploy | Vercel (本番 + デモ 2プロジェクト) |

---

## デプロイ履歴 (直近)

| 日付 | コミット | 内容 |
|------|---------|------|
| 2026-03-01 | `b928d88` | /scan モバイルQRチェックイン |
| 2026-03-01 | `d3b966b` | /demo デモ体験 + complete バグ修正 + CM動画ID長尺化 |
| 2026-03-01 | `cd87aeb` | Phase 2 提案追加 |
| 2026-02-28 | `ea24f6b` | Sentry エラー監視 |
| 2026-02-28 | `250c3b9` | CM動画URL自動抽出 + アクセシビリティ強化 |
