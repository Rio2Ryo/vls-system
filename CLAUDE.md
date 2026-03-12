## 🤖 マルチエージェント【確定版・動作確認済み 2026-02-28】

**kin で3エージェント並列実行を確認済み。必ずこのパターンを使うこと。**

CLAUDE_BIN=/home/dai_opcbot/.npm-global/bin/claude

並列起動パターン（env -u CLAUDECODE が必須）:
  env -u CLAUDECODE $CLAUDE_BIN --dangerously-skip-permissions -p 'タスク1' > /tmp/agent1.log 2>&1 &
  PID1=$!
  env -u CLAUDECODE $CLAUDE_BIN --dangerously-skip-permissions -p 'タスク2' > /tmp/agent2.log 2>&1 &
  PID2=$!
  env -u CLAUDECODE $CLAUDE_BIN --dangerously-skip-permissions -p 'タスク3' > /tmp/agent3.log 2>&1 &
  PID3=$!
  wait $PID1 $PID2 $PID3
  cat /tmp/agent1.log /tmp/agent2.log /tmp/agent3.log

なぜenv -u CLAUDECODEが必要か:
Claude CodeはCLAUDECODE環境変数をセットする。子プロセスに残るとネスト起動が拒否される。
env -u CLAUDECODEでその変数を除去してから起動することで解決。

タスク分解パターン:
- agent1: フロントエンド（UIコンポーネント・ページ）
- agent2: バックエンド（API・DB・ビジネスロジック）
- agent3: テスト（ユニット・E2E）
→ wait → 統合 → commit

ルール:
1. 複数ファイルにまたがる実装は必ず並列起動
2. 単独実行は1ファイル以内の小修正のみ
3. プロンプトは具体的に（ファイルパス・実装内容・コードスタイルを含める）
4. 完了報告に「何エージェントで並列実行したか」を明記

---

# VLS System — Claude Code Project Guide

## Overview
VLS (Video Learning System) is a Next.js 14 App Router application for event photo distribution with sponsor CM (commercial) video advertising. Users attend events (school festivals, sports days), fill out a survey, watch matched sponsor CM videos, then download event photos.

## Tech Stack
- **Framework**: Next.js 14.2 (App Router, "use client" components)
- **Language**: TypeScript 5, React 18
- **Styling**: Tailwind CSS 3.4
- **Animation**: framer-motion
- **Charts**: Chart.js (react-chartjs-2) + Recharts
- **PDF**: jsPDF (invoices, QR bulk export)
- **QR**: qrcode library
- **Storage**: Cloudflare R2 (REST API with HMAC-SHA256 presigned tokens)
- **Testing**: Playwright E2E (67 tests, 11 spec files)
- **Deploy**: Vercel

## Architecture

### User Flow (5 Steps)
1. **Login** (`/`) — Event password entry → auto-login via `/e/[slug]`
2. **Survey** (`/survey`) — 3 questions (theme/service/age), multi-select tags
3. **Processing** (`/processing`) — Scoring-based CM matching → Platinum 15s + Matched 30s/60s
4. **Photos** (`/photos`) — Multi-select gallery with canvas watermarks
5. **Complete** (`/complete`) — Photo download + sponsor offer/coupon display

### Admin Dashboard (`/admin`)
15 tabs split into `src/components/admin/tabs/` (DashboardTab, EventsTab, PhotosTab, CompaniesTab, SurveyTab, StorageTab, FunnelAnalysisTab, MatchingDebugTab, NotificationLogTab, SettingsTab) plus existing components (BulkImport, InvoiceGenerator, ChartJsAnalytics, LicenseBulkImport, TenantManager).

### Admin Sub-Pages
- `/admin/analytics` — Recharts analytics with date range filter, funnel, dropout analysis
- `/admin/events` — Standalone events page
- `/admin/stats` — CM statistics dashboard
- `/admin/users` — User management
- `/admin/import` — CSV bulk import (participants, events, companies)

### Data Layer
**localStorage cache + Cloudflare D1 persistence** (`src/lib/store.ts`, `src/lib/d1.ts`).
- On startup: `DbSyncProvider` fetches all data from D1 → populates localStorage
- On write: `safeSet()` writes to localStorage (sync) + D1 via `/api/db` PUT (async fire-and-forget)
- Reads: always from localStorage (synchronous, no component changes needed)
- D1 schema: single `kv_store` table (key TEXT PK, value TEXT, updated_at INTEGER)
- Keys: `vls_admin_events`, `vls_admin_companies`, `vls_admin_survey`, `vls_analytics`, `vls_video_plays`, `vls_admin_tenants`, `vls_participants`, `vls_invoices`, `vls_notification_log`
- Defaults from `src/lib/data.ts`: 22 companies (4 tiers), 4 events, 3 tenants, 3 survey questions

### Multi-Tenant
- 3 demo tenants with separate admin passwords
- Tenant-scoped data via `tenantId` fields + store filter functions
- Super admin sees all; tenant admin sees own data only
- API routes accept `x-tenant-id` header for R2 scoping

### Key Libraries
- `src/lib/matching.ts` — Scoring algorithm (theme 15pt, service 20pt, age 25pt, tier 30pt, breadth 15pt)
- `src/lib/notify.ts` — Email: Resend → SendGrid → console.log (3-tier fallback)
- `src/lib/r2.ts` — Cloudflare R2 PUT/GET/LIST/DELETE + presigned tokens
- `src/lib/d1.ts` — Cloudflare D1 HTTP API client (d1Query, d1Get, d1Set, d1GetAll)
- `src/lib/demo.ts` — `IS_DEMO_MODE` flag from env

## Commands
```bash
npm run dev        # Development server
npm run build      # Production build (must pass for deploy)
npx playwright test # Run all 63 E2E tests
npx vercel --prod --yes  # Deploy to Vercel
```

## Environment Variables
```
CF_ACCOUNT_ID=...       # Cloudflare account ID (R2 + D1)
CF_API_TOKEN=...        # Cloudflare API token (R2 + D1)
D1_DATABASE_ID=...      # Cloudflare D1 database UUID (vls-kv-store)
SENDGRID_API_KEY=...    # (not set) SendGrid for email
NEXT_PUBLIC_DEMO_MODE=true  # (optional) Demo mode flag
```

## Test Constraints
- All 63 Playwright tests must pass before deploy
- Tests use hardcoded data-testid attributes — do not change
- Tests expect specific text: "管理画面ログイン", "アンケート分析", event passwords (SUMMER2026, SPORTS2026, GRADUATION2026)
- Company IDs/names/offerText/couponCode must be preserved for E2E compatibility

## Current Status

### Completed (17 features)
1. User flow (5 steps with animations)
2. Scoring-based CM matching (22 companies, 4 events)
3. CM video tracking (YouTube iframe, 15s/30s/60s)
4. Admin dashboard (14 tabs, split into components)
5. Multi-tenant (3 tenants, data isolation, license management)
6. Analytics dashboards (Chart.js + Recharts, funnel, dropout)
7. CSV bulk import (participants, events, licenses, companies)
8. Invoice PDF generation (jsPDF, Japanese support)
9. Notification system (3-tier email fallback + log viewer)
10. R2 file storage (upload/list/delete, tenant-scoped directories)
11. Event check-in UI (`/admin/checkin` — search, sort, bulk actions, progress bar)
12. Tenant branding (per-tenant primaryColor + logoUrl, CSS variable theming, Settings tab)
13. SEO/OGP (metadataBase, title template, og:image, Twitter Card, per-page metadata via layout.tsx)
14. Sentry SDK (error monitoring with client/server/edge configs, global-error.tsx, auto-disable when no DSN)
15. QR check-in E2E tests (4 tests: QR generation, QR scan login, check-in flow, full integration)
16. Demo page (`/demo` — password-free 5-step walkthrough, CM timer shortened to 5s, existing UI components reused, no analytics recording)
17. Mobile scan check-in (`/scan` — html5-qrcode camera QR reader, event QR scan or manual select, participant name search, one-tap check-in)

### Priority Improvements Needed

#### HIGH — Production Blockers
- **H1. .env.example** — ✅ Created `.env.example` with all required/optional vars.
- **H2. Error boundaries** — Minimal error.tsx. No API retry/timeout. No loading states for async operations.
- **H3. API authentication middleware** — ✅ Consolidated into `middleware.ts`. ADMIN_API_RULES table defines protected routes + methods; middleware validates JWT session or x-admin-password header centrally.
- **H4. CSRF protection** — ✅ Implemented double-submit cookie pattern. Middleware sets csrf_token cookie + validates x-csrf-token header on all mutation API routes.

#### MEDIUM — Quality & UX
- **M1. Mobile optimization** — Admin tables need horizontal scroll. Touch interactions not optimized.
- **M2. Company CSV import** — ✅ Added company CSV import tab to `/admin/import` with template DL, validation, preview, and import.
- **M3. Check-in UI** — ✅ Implemented `/admin/checkin` page with event selector, search, sort, one-click check-in, bulk actions, progress bar, stats.
- **M4. Tenant branding** — ✅ Tenant型にprimaryColor追加。TenantBrandingProviderでCSS変数切り替え。AdminHeader/タブにロゴ表示+テナントカラー反映。設定タブでブランディング編集可能。
- **M5. Delete cascade** — ✅ `deleteTenantCascade()` deletes all child records (events, participants, invoices, analytics, video plays, notification logs). Confirmation dialog shows impact summary before deletion.

#### LOW — Nice to Have
- **L1. Dark mode** — ✅ Implemented. `darkMode: "class"` enabled in tailwind.config.ts. DarkModeProvider with localStorage persistence. Toggle button in AdminHeader. All admin pages (main dashboard, analytics, events, stats, users, import, checkin) and shared UI components (Card, Button) support dark: classes.
- **L2. Accessibility** — ✅ Implemented. ARIA labels/roles on all interactive elements (buttons, inputs, selects, modals, tabs, progress bars). `focus-visible:ring` keyboard focus indicators. `aria-live` regions for toasts/errors. Modal Escape key + auto-focus. Photo grid keyboard navigation (Tab/Enter/Space). Screen reader support via `sr-only` text and `aria-hidden` decorative icons.
- **L3. Real CM videos** — YouTube IDs are public videos (Rick Astley etc). Need real sponsor CMs.
- **L4. Real company logos** — All logos are ui-avatars.com text icons.
- **L5. Sentry error monitoring** — ✅ `@sentry/nextjs` v10導入。sentry.client/server/edge.config.ts + `withSentryConfig` wrapper + `/monitoring` tunnel route。`error.tsx`/`global-error.tsx`で`Sentry.captureException()`（既存D1 `captureError()`と併用）。DSN未設定時は自動無効化。本番有効化は`vercel env add NEXT_PUBLIC_SENTRY_DSN`。

#### LONG-TERM — Architecture
- **A1. Database migration** — ✅ Migrated to Cloudflare D1 (localStorage cache + D1 persistence).
- **A2. Authentication** — Password string comparison only. Needs NextAuth/Clerk for sessions/RBAC.
- **A3. Email configuration** — ✅ Resend API integrated as primary provider, SendGrid as fallback. MailChannels removed. `/api/notify` GET endpoint returns provider config status. Placeholder API key detection prevents wasted calls. Provider errors propagated to UI.

## Agent Teams Configuration
This project supports Agent Teams for parallel execution.

### Team Members
- **mail-agent**: Handles email functionality
- **frame-agent**: Handles frame management
- **docs-agent**: Handles documentation

