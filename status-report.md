# VLS System — Status Report

**最終更新**: 2026-03-03
**ブランチ**: main (`f797e1e`)
**本番URL**: https://vls-system.vercel.app
**デモURL**: https://vls-demo.vercel.app (/ → /demo 自動リダイレクト)

---

## 完成済み機能一覧 (77件)

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
| 9 | アルバム共有リンク | `/album/[token]` | パスワード不要家族共有 (30日有効) + 閲覧カウンター + スポンサーバナー + オファー表示 |
| 10 | 参加者マイページ | `/my`, `/my/[token]` | メールアドレスでマジックリンクログイン → 過去の参加イベント・DL済み写真一覧 + 再ダウンロード (7日間有効トークン) |
| 11 | NPSアンケート | `/survey-nps/[token]` | イベント後フォローアップ。0-10スコア + 自由記述。7日間有効トークン。Resendメール送信 |

### 管理画面 (14タブ + 18サブページ)

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
| 16 | 統合管理センター | `/admin/command` | マルチイベント横断KPI + 異常検知ハイライト + 日付フィルター + 10秒ポーリング |
| 17 | スポンサーROIダッシュボード | `/admin/roi` | CPV・CVR・属性別効果分析 (Recharts) + A/BテストCM尺比較 + 月次ROIレポートメール送信 |
| 18 | スポンサー効果比較 | `/admin/sponsor-compare` | Tier別/イベント別CPV・CVR・完了率横比較。散布図+ヒートマップ+CSV/PDFエクスポート |
| 19 | アンケートリアルタイム集計 | `/admin/survey-live` | 5秒ポーリング + タグクラウド + 回答速度グラフ + ライブフィード + フルスクリーン |
| 20 | NPSダッシュボード | `/admin/nps` | NPSスコア集計 + 推奨者/批判者分類 + イベント比較 + メール送信 + コメント一覧 |
| 21 | 管理者監査ログ | `/admin/audit` | 全admin操作をD1記録。KPIカード (総数/今日/実行者数/最頻操作) + アクション別・期間別フィルター + テーブル (50件/ページ) + CSV出力。EventsTab/CompaniesTab/PhotosTab連携 |
| 22 | 参加者行動ヒートマップ | `/admin/heatmap` | ユーザー操作ログ (PV/離脱/タップ/スクロール) をD1記録 → ステップファネルヒートマップ + 時間帯別PVチャート + タップ頻度テーブル + 離脱分析 + CSV出力 |
| 23 | スポンサーオファー効果測定 | `/admin/offers` | クーポン配布・コピー・クリック追跡 + 企業別CTR/コピー率テーブル + Rechartsバーチャート + 最適化レコメンド + CSV出力 |
| 24 | イベント比較レポートPDF | `/admin/event-compare` | 複数イベント横断KPI比較 (参加率/CM視聴率/DL率/NPS) + jsPDF A4横PDF自動生成 + Resendメール送信 |
| 25 | イベントスケジューラー | `/admin/scheduler` | Cron的タスクマネージャー。ScheduledTask (5種別) + 30秒自動チェック + 手動実行 + 実行ログ + CSV出力 |

### インフラ・基盤

| # | 機能 | 概要 |
|---|------|------|
| 16 | マルチテナント | 3テナント (さくら学園/ひまわり幼稚園/イベントプロ) + Super Admin。データ分離 + ライセンス管理 |
| 17 | Cloudflare D1 永続化 | localStorage キャッシュ + D1 KVストア (23キー)。DbSyncProvider で起動時同期 |
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
| 30 | E2Eテスト | Playwright 99テスト (13 spec)。QRチェックインフロー含む。Phase10-14新機能カバー |
| 31 | デモサイト別デプロイ | vls-demo.vercel.app — middleware ホスト名判定で / → /demo リダイレクト |
| 32 | PWAオフラインモード | Service Worker (app shell cache) + IndexedDB (offline D1 sync queue) + OfflineIndicator UI |
| 33 | 写真AI自動分類 | Claude Vision API (Haiku) で写真シーン分類 (個人/グループ/会場/アクティビティ)。フィルター + 手動分類 + 一括AI分類 |
| 34 | スポンサーレポートPDF | 企業別CM再生数・完了率・平均視聴秒・属性分布・CPV試算。jsPDF A4 PDF即DL |
| 35 | 写真プレビュー低画質化 | 30%解像度 + blur(1.5px) + "© みらい発見ラボ" 2x2グリッド透かし (alpha 0.18, fontSize w/18)。モーダルは閲覧専用 (DLボタン廃止) |
| 36 | フレーム合成プレビュー | Canvas描画で選択写真 + frame-template.svg を合成プレビュー表示。DLボタン廃止 |
| 37 | プラチナスポンサーバナー | platinumCMs全社 (max3) を complete/downloading 画面に sticky bottom 表示 |
| 38 | 写真公開期間管理 | EventData に publishedAt/expiresAt/status 追加。期限UI + アーカイブ + ログイン時期限チェック |
| 39 | メール後日DL送付 | /api/send-download-link (Resend) + /dl/[token] DLページ + 7日有効トークン |
| 40 | Webhook外部連携 | /admin 設定タブ Webhook設定UI。チェックイン/DL完了/CM視聴/アンケート回答時にPOST通知。リトライ3回+配信ログ |
| 41 | イベントテンプレート＋クローン | `/admin/events` + EventsTab。イベントクローン (ワンクリック複製) + テンプレート保存/読込/削除。アンケート・スポンサー割当丸ごとコピー |
| 42 | 多言語対応 (i18n) | next-intl (non-routing mode)。ja/en 切替 (cookie + Accept-Language)。ユーザーフロー6ページ + 子コンポーネント3個の全UI文言を翻訳。LanguageSwitcher で即時切替。既存URL構造・E2Eテスト影響なし |
| 43 | スポンサーセルフポータル | `/sponsor` — 企業ID+パスワード認証 → 3タブ (CM素材管理/再生レポート/オファー編集)。Company.portalPassword追加。Platinum2社+Gold3社にパスワード設定。/api/sponsor/update PUT API |
| 44 | アクセシビリティ改善 (Phase2) | sponsor, roi, album, my, dl ページにrole=tablist/tab/aria-selected、focus-visible:ring、aria-live/role=status、role=contentinfo、loading状態aria-label追加 |
| 45 | Error Boundaries強化 (H2) | fetchWithRetry (3回リトライ+exponential backoff+timeout)。DbSyncProvider失敗時オフラインバナー。全新ページにloading.tsx追加 (sponsor/demo/scan/my/dl/album) |
| 46 | スポンサー効果比較ダッシュボード | `/admin/sponsor-compare` — Tier別/イベント別/期間別のCPV・CVR・完了率横比較。Recharts散布図 (CPV vs 完了率) + ヒートマップ (Event×Company) + Tier比較棒グラフ。CSV/PDFエクスポート |
| 47 | アンケート回答リアルタイム集計 | `/admin/survey-live` — 5秒ポーリング + タグクラウド (動的フォントサイズ12-36px) + 回答速度グラフ (5分バケットLineChart) + 質問別回答分布 (BarChart) + 新着フラッシュ通知 + 最新回答フィード (AnimatePresence) + フルスクリーン対応 |
| 48 | 参加者NPSフォローアップ | `/survey-nps/[token]` 公開回答ページ (0-10スコア+自由記述) + `/admin/nps` ダッシュボード (NPSゲージ/推奨者・中立者・批判者PieChart/スコア分布/イベント比較/週次トレンド/コメント一覧) + `/api/nps` (GET/POST) + `/api/send-nps` (Resendメール送信) |
| 49 | 写真AI品質スコアリング | Claude Vision API (Haiku) で品質採点 (sharpness 40%+exposure 30%+composition 30%)。`/api/score-photo` API。PhotosTab一括スコアリングボタン+スコアバッジ (80↑黄/50↑灰/50↓赤)。PhotoGrid「おすすめ」バッジ。photos/page.tsx おすすめ順ソート |
| 50 | 管理者監査ログ | `logAudit()` ヘルパー (fire-and-forget)。AuditLog型 (20アクション種別)。`/api/audit` GET/POST。`/admin/audit` ダッシュボード (KPI+フィルター+テーブル+CSV)。EventsTab (9箇所) + CompaniesTab (3箇所) + PhotosTab (4箇所) に監査ログ連携 |
| 51 | SSEリアルタイム通知 | `/api/sse` Edge Runtime SSEエンドポイント (D1 3秒ポーリング+変更差分プッシュ+ハートビート)。`useEventStream` カスタムフック (SSE自動接続+3回リトライ後ポーリングフォールバック)。`/admin/live` + `/admin/survey-live` を SSE化。LIVE表示が SSE/LIVE/停止中 に |
| 52 | 写真顔認識グルーピング | Claude Vision (Haiku) で顔検出 (`/api/detect-faces`) + 人物特徴ベース自動グルーピング (`/api/group-faces`)。PhotosTab: 一括顔検出+グルーピングボタン+顔数バッジ+グループ表示。/photos: 人物別フィルターピル (全員/人物A/人物B...)。PhotoData に faceCount/faceDescriptions/faceGroupId、FaceGroup型追加 |
| 53 | スポンサーA/Bテストエンジン | ABTest/ABVariant/ABAssignment型。`/lib/abtest.ts` (ランダムバリアント割当+χ²有意差検定)。`/admin/ab-test` ダッシュボード (テスト作成/バリアント比較BarChart/完了率・CVR表/有意差判定/サンプルサイズ進捗)。`/processing` CM再生時にバリアント自動割当+完了記録 |
| 54 | 参加者行動ヒートマップ | BehaviorEvent型 (page_view/page_leave/tap/scroll/form_submit)。`/lib/tracker.ts` クライアント計測ライブラリ。全ユーザーページ (/, /survey, /processing, /photos, /complete) にPV/離脱/スクロール/タップ計測統合。`/api/behavior` D1取得API。`/admin/heatmap` ダッシュボード (KPI+ステップファネルヒートマップ+時間帯PVチャート+タップ頻度Top20+離脱分析+CSV) |
| 55 | スポンサーオファー効果測定 | OfferInteraction型 (offer_view/offer_click/coupon_view/coupon_copy/coupon_redeem)。`/lib/offerTracker.ts` クライアント計測ライブラリ。complete/page.tsx にオファー表示/クリック/クーポンコピー計測統合 (コードclick-to-copy対応)。`/api/coupon` D1取得API。`/admin/offers` ダッシュボード (KPI+企業別テーブル+BarChart+最適化レコメンド+CSV) |
| 56 | イベント比較レポートPDF | `EventKPI` インターフェース。`/lib/eventCompareReport.ts` (KPI算出+jsPDF A4横PDF生成+base64出力)。`/admin/event-compare` ダッシュボード (イベント複数選択+KPI比較テーブル (ベスト値ハイライト)+CSSファネル比較+PDFダウンロード+メール送信+CSV出力)。`/api/send-report` (Resend/SendGrid PDF添付メール送信、3段フォールバック) |
| 57 | 写真一括アップロード+自動最適化 | PhotosTab ドラッグ&ドロップ強化。`adminUtils.ts` に `resizeImageBlob()` (Canvas 2048px JPEG 0.85) + `createThumbnailBlobAR()` (アスペクト比維持400px) + `validateImageFiles()` (JPEG/PNG/WebP/HEIC, 30MB上限)。ファイル別進捗UI (✓/↑/· アイコン) + バリデーションエラー表示 + 圧縮率トースト。PhotoData に uploadedAt/originalSize/optimizedSize 追加 |
| 58 | イベントスケジュール自動化 | ScheduledTask型 (photo_publish/photo_archive/nps_send/report_generate/event_expire) + TaskExecutionLog型。store.ts CRUD (10関数)。`/admin/scheduler` ダッシュボード (KPIカード+3タブ: タスク一覧/新規作成/実行ログ+30秒自動チェック+CSV出力)。`/api/lifecycle` POST (タスク実行エンドポイント) |
| 59 | 管理者ロール・権限管理 (RBAC) | AdminRole (super_admin/tenant_admin/viewer) + Permission (9種) + ROLE_PERMISSIONS定数 + AdminUser型。store.ts CRUD (7関数)。auth.ts viewer認証対応 (DEFAULT_ADMIN_USERS)。middleware.ts viewer書込禁止 (POST/PUT/DELETE→403)。AdminHeader ロール別ナビ表示制御。/admin/users ロール管理UI (追加/編集/有効無効/削除+権限凡例) |
| 60 | ランディングページ | `/lp` — プロダクト紹介LP。ヒーロー (グラデーション+CTA) + 5ステップフロー + 主要機能5カード + 料金プラン3カラム + CTA + フッター。framer-motion whileInView アニメーション。認証不要パブリックページ |
| 61 | 参加者エンゲージメントスコア | EngagementScore型 (PV回数/滞在時間/CM視聴完了/写真DL数/NPS回答/クーポン利用を重み付け合算)。`/lib/engagement.ts` スコア算出 (PV 10%+滞在15%+CM 25%+DL 25%+NPS 15%+クーポン10%)。`/admin/engagement` ダッシュボード (KPIカード+スコア分布ヒストグラム+イベント比較+上位参加者テーブル+ランク分布バー+CSVエクスポート) |
| 62 | Stripe決済連携 | PricingPlan/Purchase型。`/api/checkout` (Stripe Checkout Session作成、デモモード対応)。`/api/webhook/stripe` (Stripe Webhook受信、CSRF除外)。`/api/purchases` (D1 CRUD)。`/admin/purchases` ダッシュボード (売上KPI+日別売上チャート+購入履歴テーブル+料金プラン管理+領収書PDF生成)。store.ts CRUD (デフォルト3プラン: 無料/ベーシック¥1,980/プレミアム¥3,980)。`/lib/receipt.ts` jsPDF領収書 |
| 63 | Web Push通知 | PushSubscriptionRecord/PushLog型。`sw.js` push/notificationclick イベントハンドラ。`/api/push-subscribe` (VAPID鍵配布+サブスクリプション登録/解除)。`/api/push-send` (web-push配信+デモモード+期限切れ自動クリーンアップ)。`/admin/push` ダッシュボード (3タブ: 通知送信テンプレート4種+登録デバイス一覧+配信ログ+KPI4種)。`usePushSubscription` フック。VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY環境変数で本番有効化 |
| 64 | カスタムダッシュボード | `/admin/dashboard` — react-grid-layout v2 ドラッグ&ドロップウィジェット配置。11ウィジェット (4 KPI + 3チャート + 1テーブル + 3追加KPI)。3プリセット (概要/分析/運用)。ウィジェット表示/非表示トグル。レイアウト localStorage 永続化。ResizeObserver コンテナ幅自動計測。レスポンシブ cols (4/8/12) |
| 65 | リアルタイム通知バナー | SSE (`/api/sse`) 活用リアルタイム通知。`useAdminNotifications` フック (SSE接続+ID追跡+差分検出)。`NotificationBanner` コンポーネント (トースト自動消去5秒+履歴パネル最大50件+未読バッジ+音声設定)。対応イベント4種: チェックイン/DL完了/NPS回答/決済完了。Web Audio APIビープ音。AdminHeader全ページ統合 |
| 66 | データエクスポート一括ダウンロード | `/admin/export` — 13データ種別 (イベント/企業/参加者/分析/CM再生/アンケート/購入/NPS/監査ログ/通知ログ/Push配信/行動イベント/オファー) をCSV/JSON選択→JSZip一括ZIP生成。日付範囲フィルター+テナントスコープ+件数プレビュー+プログレスバー+BOM付きUTF-8 CSV (Excel対応)+メタデータJSON |
| 67 | 管理画面グローバル検索 | Cmd+K / Ctrl+K キーボードショートカットで検索モーダル起動。`GlobalSearchModal` コンポーネント (イベント名/企業名/参加者名/21管理ページを横断fuzzy検索)。スコアリング付きfuzzy match+部分一致ハイライト+キーボードナビゲーション (↑↓/Enter/ESC)+最近の検索履歴8件 (localStorage永続化)+AdminHeader全ページ統合 |
| 68 | APIレート制限+ブルートフォース対策 | `middleware.ts` にIPベーススライディングウィンドウ方式レート制限追加。4ティア: ログイン試行5回/分 (超過→60秒ロックアウト)、API mutation 30回/分、公開POST 10回/分、公開GET 120回/分。429レスポンス+X-RateLimit-Remaining/Reset/Retry-Afterヘッダー返却。定期クリーンアップ (60秒間隔) |
| 69 | 自動週次ダイジェストメール | `/api/digest` GET (KPIプレビュー) + POST (メール送信)。D1から前週/前々週KPI集計 (新規アクセス数/DL完了数/CM視聴完了率/NPS平均/売上合計) + 前週比較 (増減%+矢印)。テナント別HTMLメールテンプレート (インラインCSS)。Resend送信。スケジューラーに `weekly_digest` タスクタイプ追加+手動トリガーボタン |
| 70 | バックアップ＆リストア | `/admin/export` にインポートタブ追加。#66 ZIPエクスポートと対になるZIPインポート機能。`_export_meta.json` 検証 (形式/テナントスコープ)。データ種別ごとに既存件数 vs インポート件数プレビュー。マージ (ID重複スキップ) or 上書き (完全置換) 選択。確認ダイアログ (上書き時は赤警告)。D1同期。ドラッグ&ドロップ対応。JSON形式のみインポート対応 (CSV形式は警告表示) |
| 71 | 参加者セグメント＋ターゲット配信 | `/admin/segments` — AND条件ビルダー (スコア範囲/アンケートタグ/イベント/チェックイン/DL/CM視聴/NPS回答の7条件)。エンゲージメントスコア連携。セグメント作成/編集/削除。条件マッチプレビュー (上位5名+スコア)。キャンペーン送信 (Push/Email)。配信履歴テーブル。KPIカード4種 |
| 74 | リアルタイムコラボレーション | `/api/presence` SSEエンドポイント (Edge Runtime)。In-memoryプレゼンス管理 (15s TTL) + 編集ロック (60s auto-expire)。`useAdminPresence` フック (5秒heartbeat + sendBeacon離脱通知)。`AdminPresenceBar` コンポーネント (アバター表示+ページ別ユーザー一覧+ロックインジケーター)。AdminHeader全ページ統合。EventsTab編集ロック連携 (acquireLock/releaseLock/ロック警告/ロックアイコン)。POST: heartbeat/lock/unlock/leave。GET: SSE stream (2秒間隔)。409 Conflict応答で同時編集防止 |
| 73 | データ保持ポリシー＋自動クリーンアップ | `/admin` 設定タブにデータ保持ポリシーセクション追加。8データ種別 (分析/CM再生/行動/オファー/監査/通知/Push/NPS) ごとに保持期間設定 (30/60/90/180/365日/無制限)。削除プレビュー (総件数/削除対象/残件数テーブル)。確認ダイアログ (赤警告+件数表示)。`runDataCleanup()` 一括削除。スケジューラーに `data_cleanup` タスクタイプ追加。`RetentionPolicy` 型+`DEFAULT_RETENTION_POLICY` |
| 72 | スポンサー向けレポート共有リンク | `/report/[token]` — 公開ROIレポートページ (30日有効)。企業別パフォーマンステーブル (再生数/完了率/平均視聴秒/推定費用) + Tier別Pie + CM尺別Bar + イベント別比較。`/api/sponsor-report` POST (共有作成) + GET (トークン検証+D1データ取得)。`/admin/roi` に共有リンク発行ボタン+URLコピー。SponsorReportShare型+store CRUD。フィルター条件 (企業/イベント/期間) をトークンに保存 |
| 75 | イベントカレンダービュー | `/admin/calendar` — 月/週/日3ビュー切替。イベントD&Dスケジュール変更 (ドラッグで日付移動+store永続化)。日ビュードリルダウンでイベント別KPI (参加者/チェックイン率/CM完了率/DL率)。クリックで詳細モーダル (6 KPIカード+ステータス+写真数+slug表示)。日本の祝日表示 (2025-2027年)。framer-motionビュー遷移アニメーション。テナントスコープ対応。KPIサマリー3カード (全件/今月/今後)。AdminHeaderナビ+middleware認証+PresenceBar連携 |
| 76 | 写真ウォーターマークカスタマイズ | テナント別ウォーターマーク設定。`WatermarkConfig` 型 (テキスト/フォントサイズ/色/透明度/回転/配置6種/タイルグリッド/画像オーバーレイ/ぼかし)。`/admin` 設定タブにウォーターマークセクション追加 (リアルタイムCanvasプレビュー+スライダーUI+カラーピッカー)。`drawWatermark()` 共通描画関数。PhotoGrid+PhotoModalが `getWatermarkConfig(tenantId)` からテナント設定読込。store.ts CRUD (getWatermarkConfig/setWatermarkConfig)。デフォルトリセット機能 |
| 77 | E2Eテスト拡充＋CI/CD | Playwright 67→99テスト (+32)。Phase10-14新機能カバー: 決済/Push/カスタムDB/エクスポート/セグメント/カレンダー/ROI/スケジューラー/ウォーターマーク設定/コラボ/ナビゲーション/公開ページ (LP/デモ/レポート/スキャン)。GitHub Actions CI (`ci.yml`): build→e2e→deploy (preview PR/production main)→Telegram通知。Vercel自動デプロイ (amondnet/vercel-action)。テストアーティファクト自動保存 |

---

## 未実装・残タスク

### HIGH — Phase 2 実装予定

| ID | 内容 | ページ | 概要 |
|----|------|--------|------|
| P2-1 | ✅ スポンサーレポートPDF | `/admin` レポートタブ | 企業別CM再生数・完了率・属性分布・CPV試算をPDF自動生成 (`87b86b5`) |
| P2-2 | ✅ ライブイベントダッシュボード | `/admin/live` | 当日リアルタイムKPI (5秒ポーリング) + フルスクリーン + チェックイン進捗リング + アラート通知 |
| P2-3 | ✅ Webhook外部連携 | `/admin` 設定タブ | チェックイン/DL完了/CM視聴/アンケート回答時にPOST通知 (Slack/LINE/Zapier) (`b884b66`) |
| P2-4 | ✅ 写真AI自動分類 | `/admin/photos` | Claude Vision APIでシーン分類 + ギャラリーフィルター (`73bf4bf`) |
| P2-5 | ✅ マルチイベント統合管理 | `/admin/command` | 同日複数イベント横断KPI + 異常検知ハイライト (`49b98e9`) |
| P2-6 | ✅ PWAオフラインモード | 全ページ | Service Worker + IndexedDB。オフラインチェックイン対応、オンライン復帰時D1自動同期 (`ee11fc2`) |

### Phase 12 — 次フェーズ提案

| ID | 優先度 | 内容 | 概要 |
|----|--------|------|------|
| Phase12-1 | ✅ HIGH | APIレート制限+ブルートフォース対策 | middleware.ts IPベーススライディングウィンドウ。ログイン5回/分、API mutation 30回/分、公開GET 120回/分。429+ロックアウト+X-RateLimitヘッダー |
| Phase12-2 | ✅ MEDIUM | 自動週次ダイジェストメール | /api/digest 前週KPI集計 (アクセス/DL/CM視聴/NPS/売上) + 前々週比較。Resendテナント管理者送信。スケジューラーweekly_digestタスク。手動トリガー |
| Phase12-3 | ✅ MEDIUM | バックアップ＆リストア | /admin/export インポートタブ追加。#66 ZIPエクスポートの逆操作。meta検証→プレビュー→マージ/上書き選択→D1復元 |

### その他 (未着手)

| ID | 優先度 | 内容 | 備考 |
|----|--------|------|------|
| L3 | LOW | 実CM動画差替え | 現在はパブリックYouTube動画 (Rick Astley等)。実スポンサーCM素材待ち |
| L4 | LOW | 実企業ロゴ差替え | 現在は ui-avatars.com テキストアイコン。実ロゴ画像待ち |
| A2 | ✅ LONG-TERM | 認証強化 (RBAC) | AdminRole (3ロール) + Permission (9権限) + viewer書込禁止 + AdminHeader権限フィルタ + /admin/usersロール管理 |
| M1 | ✅ MEDIUM | モバイル最適化 | Admin テーブル横スクロール + touch-pan-x (`89ffa4c`) |

### 環境設定のみ (コード変更不要)

| 項目 | コマンド | 現状 |
|------|---------|------|
| Sentry本番有効化 | `vercel env add NEXT_PUBLIC_SENTRY_DSN` | DSN未設定のため無効 |
| SendGrid設定 | `vercel env add SENDGRID_API_KEY` | Resend のみ有効 |
| 写真AI分類有効化 | `vercel env add ANTHROPIC_API_KEY` | 未設定時は手動分類のみ |

### tasks.txt 完了済みフェーズ

| フェーズ | タスク | 状態 |
|----------|--------|------|
| — | matching.ts platinum枠ランダム抽選化 | ✅ 完了 (`783ba6d`) |
| Phase3 | 保護者向けアルバム共有 / ROIダッシュボード / テンプレート+クローン | ✅ 全3件完了 |
| Phase4 | 参加者マイページ / 多言語対応 / スポンサーポータル | ✅ 全3件完了 |
| Phase5 | アクセシビリティ改善P2 / スポンサー比較 / アンケートライブ / Error Boundaries | ✅ 全4件完了 |
| Phase6 | NPSフォローアップ / AI品質スコアリング / 監査ログ | ✅ 全3件完了 |
| Phase7 | SSEリアルタイム / 顔認識グルーピング / A/Bテスト | ✅ 全3件完了 |
| Phase8 | 行動ヒートマップ / オファー効果測定 / イベント比較PDF | ✅ 全3件完了 |
| Phase9 | 写真アップロード最適化 / スケジュール自動化 / RBAC権限管理 | ✅ 全3件完了 |
| Phase10 | Stripe決済連携 / Web Push通知 / カスタムダッシュボード | ✅ 全3件完了 |
| Phase11 | リアルタイム通知バナー / データエクスポート / グローバル検索 | ✅ 全3件完了 |
| Phase12 | APIレート制限 / 週次ダイジェスト / バックアップ＆リストア | ✅ 全3件完了 |
| Phase13 | 参加者セグメント / スポンサーレポート共有 / データ保持ポリシー | ✅ 全3件完了 |
| Phase14 | リアルタイムコラボ / カレンダー / ウォーターマーク | ✅ 全3件完了 |
| Phase15 | E2Eテスト+CI/CD / パフォーマンス / レポートビルダー | 1/3完了 |

---

## Phase 2 — 初期提案 (全完了)

| # | 機能 | 状態 |
|---|------|------|
| P2-1 | ✅ スポンサーレポートPDF | 完了 (`87b86b5`) |
| P2-2 | ✅ ライブイベントダッシュボード | 完了 (`b12a99e`) |
| P2-3 | ✅ Webhook外部連携 | 完了 (`b884b66`) |
| P2-4 | ✅ 写真AI自動分類 | 完了 (`73bf4bf`) |
| P2-5 | ✅ マルチイベント統合管理 | 完了 (`49b98e9`) |
| P2-6 | ✅ PWAオフラインモード | 完了 (`ee11fc2`) |

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
| AI | Claude Haiku 4.5 Vision (写真分類+品質スコアリング+顔検出+グルーピング) |
| Analytics | 行動トラッキング (PV/離脱/タップ/スクロール) + オファー効果測定 + A/Bテスト (χ²検定) |
| Monitoring | Sentry + D1エラーログ |
| Testing | Playwright (99 tests, 13 specs) |
| i18n | next-intl (non-routing, cookie-based ja/en) |
| PWA | Service Worker + IndexedDB (offline sync queue) |
| Deploy | Vercel (本番 + デモ 2プロジェクト) |

---

## デプロイ履歴 (直近)

| 日付 | コミット | 内容 |
|------|---------|------|
| 2026-03-03 | — | #77 E2Eテスト拡充+CI/CD — Playwright 67→99テスト + GitHub Actions ci.yml (build→e2e→deploy→notify) + 2テストファイル新規 (4ファイル) |
| 2026-03-03 | — | #76 写真ウォーターマークカスタマイズ — WatermarkConfig型 + SettingsTab設定UI + Canvasプレビュー + PhotoGrid/PhotoModal連携 (5ファイル) |
| 2026-03-03 | — | #75 イベントカレンダービュー — /admin/calendar 月/週/日ビュー + D&Dスケジュール変更 + KPIドリルダウン + 祝日表示 (4ファイル) |
| 2026-03-03 | — | #74 リアルタイムコラボレーション — /api/presence SSE + useAdminPresence フック + AdminPresenceBar + EventsTab編集ロック (6ファイル) |
| 2026-03-03 | — | #73 データ保持ポリシー＋自動クリーンアップ — SettingsTab保持期間設定 + プレビュー + 確認ダイアログ + runDataCleanup() + スケジューラーdata_cleanup (4ファイル) |
| 2026-03-03 | — | #72 スポンサー向けレポート共有リンク — /report/[token] 公開ROIレポート + /api/sponsor-report + /admin/roi 共有リンク発行 (4ファイル) |
| 2026-03-03 | — | #71 参加者セグメント＋ターゲット配信 — /admin/segments + AND条件ビルダー7種 + エンゲージメントスコア連携 + キャンペーン送信 (Push/Email) + 配信履歴 (4ファイル) |
| 2026-03-03 | — | #67 管理画面グローバル検索 — Cmd+K検索モーダル + fuzzy match + 21ページ/イベント/企業/参加者横断 + キーボードナビ + 検索履歴 (2ファイル) |
| 2026-03-03 | — | #66 データエクスポート一括ダウンロード — /admin/export + 13種別CSV/JSON→ZIP + JSZip + 日付フィルター + テナントスコープ (1ファイル) |
| 2026-03-03 | — | #65 リアルタイム通知バナー — SSE活用 + useAdminNotifications + NotificationBanner (トースト+履歴+未読バッジ+音声) + AdminHeader統合 (3ファイル) |
| 2026-03-03 | — | #64 カスタムダッシュボード — react-grid-layout v2 + 11ウィジェット + 3プリセット + D&Dレイアウト永続化 (1ファイル) |
| 2026-03-03 | — | #63 Web Push通知 — sw.js pushハンドラ + /api/push-subscribe + /api/push-send + /admin/push ダッシュボード + usePushSubscriptionフック (6ファイル) |
| 2026-03-03 | — | #62 Stripe決済連携 — PricingPlan/Purchase型 + /api/checkout + /api/webhook/stripe + /api/purchases + /admin/purchases ダッシュボード + /lib/receipt.ts 領収書PDF (7ファイル) |
| 2026-03-03 | — | #61 参加者エンゲージメントスコア — EngagementScore型 + /lib/engagement.ts スコア算出 + /admin/engagement ダッシュボード (3ファイル) |
| 2026-03-03 | — | #60 ランディングページ `/lp` — ヒーロー+5ステップ+機能カード+料金プラン+CTA (1ファイル新規) |
| 2026-03-03 | — | Phase9-3 管理者ロール・権限管理 (RBAC) — AdminRole/Permission/AdminUser型 + auth.ts viewer認証 + middleware viewer書込禁止 + AdminHeader権限フィルタ + /admin/users ロール管理UI (7ファイル) |
| 2026-03-03 | — | Phase9-2 イベントスケジュール自動化 — ScheduledTask/TaskExecutionLog型 + store CRUD + /admin/scheduler ダッシュボード + /api/lifecycle POST (5ファイル) |
| 2026-03-03 | — | Phase9-1 写真一括アップロード+自動最適化 — adminUtils.ts (resizeImageBlob/createThumbnailBlobAR/validateImageFiles) + PhotosTab進捗UI強化 + PhotoData型拡張 (3ファイル) |
| 2026-03-03 | — | Phase8-3 イベント比較レポートPDF — /lib/eventCompareReport.ts + /admin/event-compare + /api/send-report (5ファイル) |
| 2026-03-03 | — | Phase8-2 スポンサーオファー効果測定 — /lib/offerTracker.ts + /api/coupon + /admin/offers ダッシュボード + complete/page.tsx計測統合 (8ファイル) |
| 2026-03-03 | — | Phase8-1 参加者行動ヒートマップ — /lib/tracker.ts + /api/behavior + /admin/heatmap ダッシュボード + 全5ユーザーページ計測統合 (10ファイル) |
| 2026-03-03 | — | Phase7-3 スポンサーA/Bテストエンジン — /lib/abtest.ts + /admin/ab-test ダッシュボード + /processing バリアント割当連携 (5ファイル) |
| 2026-03-03 | — | Phase7-2 写真顔認識グルーピング — /api/detect-faces + /api/group-faces + PhotosTab顔検出UI + /photos人物フィルター (6ファイル) |
| 2026-03-03 | — | Phase7-1 SSEリアルタイム通知 — /api/sse Edge SSE + useEventStream フック + /admin/live, /admin/survey-live SSE化 (4ファイル) |
| 2026-03-02 | — | Phase6-3 管理者監査ログ — /lib/audit.ts + /api/audit + /admin/audit ダッシュボード + EventsTab/CompaniesTab/PhotosTab連携 (8ファイル) |
| 2026-03-02 | — | Phase6-2 写真AI品質スコアリング — /api/score-photo + PhotoGrid「おすすめ」バッジ + photos/page おすすめ順ソート + PhotosTab一括スコアリング (4ファイル) |
| 2026-03-02 | — | Phase6-1 参加者NPSフォローアップ — /survey-nps/[token] + /admin/nps + /api/nps + /api/send-nps (8ファイル) |
| 2026-03-02 | — | Phase5-2 スポンサー効果比較 `/admin/sponsor-compare` — 散布図+ヒートマップ+CSV/PDFエクスポート (2ファイル) |
| 2026-03-02 | — | Phase5-3 アンケートリアルタイム集計 `/admin/survey-live` — タグクラウド+回答速度グラフ+フルスクリーン (2ファイル) |
| 2026-03-02 | — | H2 Error Boundaries強化 — fetchWithRetry + DbSyncProvider失敗UI + loading.tsx×6 (10ファイル) |
| 2026-03-02 | — | アクセシビリティ改善 Phase2 — sponsor/roi/album/my/dl全7ファイル a11y強化 |
| 2026-03-02 | — | Phase4-3 スポンサーセルフポータル `/sponsor` — 3タブ (CM管理/レポート/オファー) (8ファイル) |
| 2026-03-02 | — | Phase4-2 多言語対応 (i18n) — next-intl ja/en 切替 (17ファイル変更) |
| 2026-03-01 | `f797e1e` | アクセシビリティ改善 — aria-label/focus-visible/role=meter追加 (6ファイル) |
| 2026-03-01 | `89ffa4c` | M1 モバイル最適化 — 全Adminテーブル横スクロール + touch-pan-x (13ファイル) |
| 2026-03-01 | `49b98e9` | P2-5 マルチイベント統合管理 /admin/command |
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
