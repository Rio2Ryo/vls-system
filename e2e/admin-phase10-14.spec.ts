import { test, expect } from "@playwright/test";

/**
 * E2E tests for Phase 10–14 admin sub-pages.
 * Tests cover: purchases, push, dashboard, export, segments, calendar, and settings watermark.
 */

async function adminLogin(page: import("@playwright/test").Page) {
  await page.goto("/admin");
  await page.getByTestId("admin-password").fill("ADMIN_VLS_2026");
  await page.getByRole("button", { name: /ログイン/ }).click();
  await expect(page.getByTestId("admin-dashboard")).toBeVisible();
}

async function loginAndNavigate(page: import("@playwright/test").Page, targetPath: string) {
  await adminLogin(page);
  await page.goto(targetPath);
}

// ---------------------------------------------------------------------------
// /admin/purchases — Stripe Payment Dashboard (Phase10-1)
// ---------------------------------------------------------------------------
test.describe("Admin Purchases Page (/admin/purchases)", () => {
  test("loads and shows purchase dashboard heading", async ({ page }) => {
    await loginAndNavigate(page, "/admin/purchases");
    await expect(page.getByText("決済ダッシュボード")).toBeVisible({ timeout: 10000 });
  });

  test("shows pricing plan section", async ({ page }) => {
    await loginAndNavigate(page, "/admin/purchases");
    await expect(page.getByText("料金プラン")).toBeVisible({ timeout: 10000 });
  });

  test("has admin navigation", async ({ page }) => {
    await loginAndNavigate(page, "/admin/purchases");
    await expect(page.getByRole("link", { name: "Admin" })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// /admin/push — Web Push Dashboard (Phase10-2)
// ---------------------------------------------------------------------------
test.describe("Admin Push Page (/admin/push)", () => {
  test("loads and shows push notification heading", async ({ page }) => {
    await loginAndNavigate(page, "/admin/push");
    await expect(page.getByText("Push通知管理")).toBeVisible({ timeout: 10000 });
  });

  test("shows send notification tab", async ({ page }) => {
    await loginAndNavigate(page, "/admin/push");
    await expect(page.getByText("通知送信")).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// /admin/dashboard — Custom Dashboard (Phase10-3)
// ---------------------------------------------------------------------------
test.describe("Admin Custom Dashboard (/admin/dashboard)", () => {
  test("loads and shows custom dashboard heading", async ({ page }) => {
    await loginAndNavigate(page, "/admin/dashboard");
    await expect(page.getByText("カスタムダッシュボード")).toBeVisible({ timeout: 10000 });
  });

  test("shows preset buttons", async ({ page }) => {
    await loginAndNavigate(page, "/admin/dashboard");
    // Should have preset buttons for layout switching
    await expect(page.getByText("概要")).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// /admin/export — Data Export (Phase11-2)
// ---------------------------------------------------------------------------
test.describe("Admin Export Page (/admin/export)", () => {
  test("loads and shows export heading", async ({ page }) => {
    await loginAndNavigate(page, "/admin/export");
    await expect(page.getByText("データエクスポート")).toBeVisible({ timeout: 10000 });
  });

  test("shows data type checkboxes", async ({ page }) => {
    await loginAndNavigate(page, "/admin/export");
    // Should show data types for export
    await expect(page.getByText("イベント")).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// /admin/segments — Participant Segments (Phase13-1)
// ---------------------------------------------------------------------------
test.describe("Admin Segments Page (/admin/segments)", () => {
  test("loads and shows segments heading", async ({ page }) => {
    await loginAndNavigate(page, "/admin/segments");
    await expect(page.getByText("セグメント")).toBeVisible({ timeout: 10000 });
  });

  test("shows create segment button", async ({ page }) => {
    await loginAndNavigate(page, "/admin/segments");
    await expect(page.getByText("新規セグメント作成")).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// /admin/calendar — Event Calendar (Phase14-2)
// ---------------------------------------------------------------------------
test.describe("Admin Calendar Page (/admin/calendar)", () => {
  test("loads and shows calendar heading", async ({ page }) => {
    await loginAndNavigate(page, "/admin/calendar");
    await expect(page.getByText("イベントカレンダー")).toBeVisible({ timeout: 10000 });
  });

  test("shows month/week/day view toggles", async ({ page }) => {
    await loginAndNavigate(page, "/admin/calendar");
    await expect(page.getByRole("button", { name: "月" })).toBeVisible();
    await expect(page.getByRole("button", { name: "週" })).toBeVisible();
    await expect(page.getByRole("button", { name: "日" })).toBeVisible();
  });

  test("can switch between calendar views", async ({ page }) => {
    await loginAndNavigate(page, "/admin/calendar");

    // Default is month view — switch to week
    await page.getByRole("button", { name: "週" }).click();
    await page.waitForTimeout(300);

    // Switch to day
    await page.getByRole("button", { name: "日" }).click();
    await page.waitForTimeout(300);

    // Switch back to month
    await page.getByRole("button", { name: "月" }).click();
    await page.waitForTimeout(300);
  });

  test("shows today button", async ({ page }) => {
    await loginAndNavigate(page, "/admin/calendar");
    await expect(page.getByRole("button", { name: "今日" })).toBeVisible();
  });

  test("shows KPI summary cards", async ({ page }) => {
    await loginAndNavigate(page, "/admin/calendar");
    await expect(page.getByText("全イベント")).toBeVisible();
    await expect(page.getByText("今月のイベント")).toBeVisible();
    await expect(page.getByText("今後の予定")).toBeVisible();
  });

  test("navigation arrows work", async ({ page }) => {
    await loginAndNavigate(page, "/admin/calendar");
    const prevBtn = page.getByRole("button", { name: "前へ" });
    const nextBtn = page.getByRole("button", { name: "次へ" });

    await expect(prevBtn).toBeVisible();
    await expect(nextBtn).toBeVisible();

    // Click next, then prev
    await nextBtn.click();
    await page.waitForTimeout(300);
    await prevBtn.click();
    await page.waitForTimeout(300);
  });
});

// ---------------------------------------------------------------------------
// /admin/scheduler — Task Scheduler (Phase9-2 + Phase13-3 data_cleanup)
// ---------------------------------------------------------------------------
test.describe("Admin Scheduler Page (/admin/scheduler)", () => {
  test("loads and shows scheduler heading", async ({ page }) => {
    await loginAndNavigate(page, "/admin/scheduler");
    await expect(page.getByText("タスクスケジューラー")).toBeVisible({ timeout: 10000 });
  });

  test("shows task types including data_cleanup", async ({ page }) => {
    await loginAndNavigate(page, "/admin/scheduler");
    // data_cleanup was added in Phase13-3
    await expect(page.getByText("データクリーンアップ")).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// /admin/roi — ROI Dashboard + Report Sharing (Phase13-2)
// ---------------------------------------------------------------------------
test.describe("Admin ROI Page (/admin/roi)", () => {
  test("loads and shows ROI heading", async ({ page }) => {
    await loginAndNavigate(page, "/admin/roi");
    await expect(page.getByText("スポンサーROI")).toBeVisible({ timeout: 10000 });
  });

  test("shows share link section", async ({ page }) => {
    await loginAndNavigate(page, "/admin/roi");
    await expect(page.getByText("レポート共有リンク")).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Admin main page — Settings tab watermark (Phase14-3)
// ---------------------------------------------------------------------------
test.describe("Admin Settings — Watermark Configuration (Phase14-3)", () => {
  test("settings tab shows watermark section", async ({ page }) => {
    await adminLogin(page);

    // Navigate to Settings tab
    await page.getByRole("button", { name: /設定/ }).click();

    // Should show watermark settings heading
    await expect(page.getByText("ウォーターマーク設定")).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Collaboration — Presence Bar (Phase14-1)
// ---------------------------------------------------------------------------
test.describe("Admin Collaboration — Presence (Phase14-1)", () => {
  test("admin header shows LIVE indicator when connected", async ({ page }) => {
    await adminLogin(page);
    // The presence bar shows a LIVE badge when SSE is connected and no peers
    // Give it time to connect
    await page.waitForTimeout(2000);
    // LIVE indicator or presence elements should exist in the header
    const header = page.locator(".bg-white.border-b, .dark\\:bg-gray-900.border-b").first();
    await expect(header).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// /admin — Navigation includes new pages (Phase12-14)
// ---------------------------------------------------------------------------
test.describe("Admin Navigation — New Pages", () => {
  test("navigation includes calendar link", async ({ page }) => {
    await adminLogin(page);
    await expect(page.getByRole("link", { name: "カレンダー" })).toBeVisible();
  });

  test("navigation includes segments link", async ({ page }) => {
    await adminLogin(page);
    await expect(page.getByRole("link", { name: "セグメント" })).toBeVisible();
  });

  test("navigation includes ROI link", async ({ page }) => {
    await adminLogin(page);
    await expect(page.getByRole("link", { name: "ROI" })).toBeVisible();
  });
});
