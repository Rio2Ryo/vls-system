# VLS System 見積項目別 総合テスト結果

テスト日時: 2026-03-18T01:09:17.127Z
対象: https://vls-system.vercel.app

| 結果 | 件数 |
|------|------|
| ✅ PASS | 10 |
| ⚠️ PARTIAL | 4 |
| ❌ FAIL | 6 |
| ⬜ NOT_STARTED | 3 |

## 詳細

| No. | カテゴリ | 項目 | 結果 | 詳細 |
|-----|---------|------|------|------|
| 1 | ユーザー向け画面 | トップページ・遷移ページ | ✅ PASS | title="VLS - イベント写真サービス", viewport=true, logo=true, banner=false |
| 2 | ユーザー向け画面 | 写真一覧選択 | ✅ PASS | photoGrid=true, selectAll=true, preview=true |
| 3 | ユーザー向け画面 | 写真詳細・加工・DL | ✅ PASS | frame=true, download=true |
| 4 | ユーザー向け画面 | CM・動画視聴 | ✅ PASS | cm=true, sponsor=true |
| 5 | ユーザー向け画面 | イベントコード認証・バナー設置 | ✅ PASS | codeInput=true, codeWorks=false |
| 6 | 管理者向け画面 | ダッシュボード・分析 | ❌ FAIL | page.goto: Timeout 30000ms exceeded.
Call log:
  - navigating to "https://vls-system.vercel.app/admin/dashboard", waiting until "networkidle"
 |
| 7 | 管理者向け画面 | 写真・コンテンツ管理 | ❌ FAIL | page.goto: Timeout 30000ms exceeded.
Call log:
  - navigating to "https://vls-system.vercel.app/admin", waiting until "networkidle"
 |
| 8 | 管理者向け画面 | CM・広告・通知管理 | ❌ FAIL | page.goto: Timeout 30000ms exceeded.
Call log:
  - navigating to "https://vls-system.vercel.app/admin", waiting until "networkidle"
 |
| 9 | 管理者向け画面 | ユーザー・セキュリティ管理 | ❌ FAIL | page.goto: Timeout 30000ms exceeded.
Call log:
  - navigating to "https://vls-system.vercel.app/admin/users", waiting until "networkidle"
 |
| 10 | AI機能 | AI顔認識写真絞り込み | ✅ PASS | faceSearch=true |
| 11 | AI機能 | AI写真自動選別・精度検証 | ✅ PASS | classify=true(status:405), score=true(status:405) |
| 12 | AI機能 | AIモデル学習・チューニング | ⚠️ PARTIAL | faceModelsServed=true (精度チューニング・バリデーション報告書は未作成) |
| 13 | インフラ・QA | インフラ設計・構築・セキュリティ | ✅ PASS | HTTPS=true, status=200, secHeaders=true |
| 14 | インフラ・QA | テスト・QA・負荷試験 | ⚠️ PARTIAL | E2Eテスト14ファイル復元済み、負荷試験は未実施 |
| 15 | PM | プロジェクト管理(Sprint1) | ✅ PASS | Sprint0-1完了、GitHub管理 |
| 16 | PM | プロジェクト管理(Sprint2) | ✅ PASS | Sprint2進行中、AI機能開発中 |
| 17 | PM | プロジェクト管理(Sprint3) | ⬜ NOT_STARTED | Sprint3未着手 |
| 18 | 拡張機能 | 高度な認証基盤 | ⚠️ PARTIAL | login=true, social=true, pwReset=true |
| 19 | 拡張機能 | マイページ・会員機能 | ⚠️ PARTIAL | myPage=true |
| 20a | 拡張機能 | 予約機能 | ⬜ NOT_STARTED | 予約在庫管理・メール通知は未実装 |
| 20b | 拡張機能 | 決済・EC機能 | ⬜ NOT_STARTED | クレジット決済・Apple Pay/Google Pay未実装 |
| 21 | 拡張機能 | 権限管理・マルチテナント拡張 | ❌ FAIL | page.goto: Target page, context or browser has been closed
Call log:
  - navigating to "https://vls-system.vercel.app/admin/settings", waiting until "networkidle"
 |
| 22 | 拡張機能 | 分析・外部連携・API整備 | ❌ FAIL | browserContext.newPage: Protocol error (Target.createTarget): Not supported |
