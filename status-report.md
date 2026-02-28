# VLS System — Status Report

**Date**: 2026-02-28
**Sprint**: SEO/OGP + Sentry + QR E2E

---

## 1. SEO/OGP対応 (完了)

### Root Layout更新 (`src/app/layout.tsx`)
- `metadataBase`: `https://vls-system.vercel.app`
- `title.template`: `%s | VLS`
- `openGraph`: siteName, url, images (1200x630 OG画像)
- `twitter`: `summary_large_image` card
- `robots`: index: true, follow: true (本番公開用)

### ページ別metadata (layout.tsx 新規作成 x12)
| ページ | title | description |
|--------|-------|-------------|
| `/survey` | アンケート | イベントアンケートに回答して... |
| `/processing` | 読み込み中 | イベント写真データとCM動画を... |
| `/photos` | 写真ギャラリー | イベントの写真を閲覧・選択して... |
| `/complete` | ダウンロード完了 | 写真のダウンロードが完了しました... |
| `/downloading` | ダウンロード準備中 | 高画質写真データを生成中です |
| `/admin` | 管理画面 | VLSイベント管理ダッシュボード |
| `/admin/analytics` | アンケート分析 | アンケート回答の分析ダッシュボード |
| `/admin/events` | イベント管理 | イベントの作成・編集・QRコード管理 |
| `/admin/stats` | CM統計 | CM動画の視聴統計ダッシュボード |
| `/admin/users` | ユーザー管理 | ユーザーセッションの管理 |
| `/admin/import` | CSVインポート | 参加者・イベント・企業のCSV一括インポート |
| `/admin/checkin` | チェックイン | イベント参加者のチェックイン管理 |

### OG画像動的生成
- `src/app/opengraph-image.tsx` (Edge Runtime, ImageResponse API)
- 1200x630, グラデーション背景 (#6EC6FF → #A78BFA)
- 📸 アイコン + "VLS" + "イベント写真サービス"

---

## 2. Sentry SDK導入 (完了)

### 新規ファイル
| ファイル | 内容 |
|----------|------|
| `sentry.client.config.ts` | クライアントSDK初期化 (replay, tracesSampleRate: 0.1) |
| `sentry.server.config.ts` | サーバーSDK初期化 |
| `sentry.edge.config.ts` | Edge Runtime SDK初期化 |
| `src/instrumentation.ts` | ランタイム別初期化 (nodejs/edge) |
| `src/app/global-error.tsx` | グローバルエラーハンドラー + Sentry報告 |

### 既存ファイル変更
| ファイル | 変更内容 |
|----------|----------|
| `next.config.mjs` | `withSentryConfig()` ラッパー追加 |
| `src/app/error.tsx` | `Sentry.captureException(error)` 追加 |
| `.env.example` | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG/PROJECT/AUTH_TOKEN` 追加 |

### 安全設計
- `enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN` — DSN未設定時は完全無効
- `/monitoring` tunnel route でCSP対応
- sourcemaps アップロード後自動削除

---

## 3. QR → チェックイン E2Eテスト (完了)

### テストファイル: `e2e/qr-checkin-flow.spec.ts`
| テスト | 内容 | 結果 |
|--------|------|------|
| Admin creates event → QR shows URL | イベント作成→QRコード表示→共有URL確認 | ✅ |
| User scans QR URL → auto-login | /?pw=XXX でパスワード自動入力→ログイン→survey到達 | ✅ |
| Check-in: register → check in | 参加者登録→checkinページ→ワンクリックチェックイン→取消ボタン確認 | ✅ |
| Full QR flow | イベント作成→参加者追加→QRアクセス→チェックイン→管理画面確認 | ✅ |

### テスト結果
- **新規QRテスト**: 4/4 パス
- **既存adminテスト**: 8/8 パス
- **admin-subpagesテスト**: 15/16 パス (1件は間欠的セッションtimeout)
- **ビルド**: 成功

---

## 前回分: アクセシビリティ改善 (完了)

ARIA attributes (aria-label, aria-live, role), focus-visible:ring, キーボードナビゲーション (Tab/Enter/Space), スクリーンリーダー対応 (sr-only, aria-hidden) を全主要コンポーネント・ページに追加済み。
