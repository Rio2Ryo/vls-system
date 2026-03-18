import { test, expect } from "@playwright/test";

/**
 * Seed analytics data for dashboard tests.
 * Must be called BEFORE login since login triggers data load.
 */
async function seedAnalytics(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const records = [
      {
        id: "test-a1",
        eventId: "evt-summer",
        timestamp: Date.now() - 3600000,
        respondentName: "テスト太郎",
        surveyAnswers: { q1: ["education", "sports"], q2: ["cram_school"], q3: ["age_4_6"] },
        stepsCompleted: { access: true, survey: true, cmViewed: true, photosViewed: true, downloaded: true },
        matchedCompanyId: "co-gold-1",
        platinumCompanyId: "co-platinum-1",
      },
      {
        id: "test-a2",
        eventId: "evt-sports",
        timestamp: Date.now() - 1800000,
        respondentName: "テスト花子",
        surveyAnswers: { q1: ["food", "travel"], q2: ["travel_service"], q3: ["age_7_9"] },
        stepsCompleted: { access: true, survey: true, cmViewed: true, photosViewed: false, downloaded: false },
        matchedCompanyId: "co-silver-1",
        platinumCompanyId: "co-platinum-1",
      },
    ];
    localStorage.setItem("vls_analytics", JSON.stringify(records));
  });
}

async function seedVideoPlays(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const plays = [
      {
        id: "vp-test-1",
        companyId: "co-platinum-1",
        companyName: "キッズラーニング株式会社",
        videoId: "dQw4w9WgXcQ",
        cmType: "cm15",
        duration: 15,
        watchedSeconds: 15,
        completed: true,
        timestamp: Date.now() - 3600000,
        eventId: "evt-summer",
      },
      {
        id: "vp-test-2",
        companyId: "co-gold-1",
        companyName: "ファミリートラベル",
        videoId: "9bZkp7q19f0",
        cmType: "cm30",
        duration: 30,
        watchedSeconds: 28,
        completed: false,
        timestamp: Date.now() - 1800000,
        eventId: "evt-summer",
      },
    ];
    localStorage.setItem("vls_video_plays", JSON.stringify(plays));
  });
}

/** Login at /admin and then navigate to the target sub-page */
async function loginAndNavigate(page: import("@playwright/test").Page, targetPath: string) {
  await page.goto("/admin");
  await page.getByTestId("admin-password").fill("ADMIN_VLS_2026");
  await page.getByRole("button", { name: /ログイン/ }).click();
  await expect(page.getByTestId("admin-dashboard")).toBeVisible();
  await page.goto(targetPath);
}

// ===== /admin/analytics =====
test.describe("Admin Analytics Page (/admin/analytics)", () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { localStorage.removeItem("vls_analytics"); });
  });

  test("shows login form and authenticates", async ({ page }) => {
    // Unauthenticated access redirects to /admin login
    await page.goto("/admin/analytics");
    await expect(page.getByText("管理画面ログイン")).toBeVisible();
    await expect(page.getByTestId("admin-password")).toBeVisible();

    // Login and navigate to analytics
    await page.getByTestId("admin-password").fill("ADMIN_VLS_2026");
    await page.getByRole("button", { name: /ログイン/ }).click();
    await expect(page.getByTestId("admin-dashboard")).toBeVisible();
    await page.goto("/admin/analytics");
    await expect(page.getByText("アンケート分析ダッシュボード")).toBeVisible();
  });

  test("shows summary cards with seeded data", async ({ page }) => {
    await page.goto("/admin");
    await seedAnalytics(page);
    await loginAndNavigate(page, "/admin/analytics");

    await expect(page.getByText("総アクセス")).toBeVisible();
    await expect(page.getByText("アンケート回答", { exact: true })).toBeVisible();
  });

  test("event filter exists", async ({ page }) => {
    await page.goto("/admin");
    await seedAnalytics(page);
    await loginAndNavigate(page, "/admin/analytics");

    const filter = page.getByTestId("analytics-event-filter");
    await expect(filter).toBeVisible();
  });

  test("shows no-data message when empty", async ({ page }) => {
    await page.goto("/admin");
    await page.evaluate(() => localStorage.removeItem("vls_analytics"));
    await loginAndNavigate(page, "/admin/analytics");

    await expect(page.getByText("まだアンケート回答データがありません")).toBeVisible();
  });

  test("has consistent admin navigation", async ({ page }) => {
    await loginAndNavigate(page, "/admin/analytics");
    // AdminHeader nav links
    await expect(page.getByRole("link", { name: "Admin" })).toBeVisible();
    await expect(page.getByRole("link", { name: "イベント" })).toBeVisible();
    await expect(page.getByRole("link", { name: "CM統計" })).toBeVisible();
    await expect(page.getByRole("link", { name: "ユーザー" })).toBeVisible();
  });
});

// ===== /admin/stats =====
test.describe("Admin Stats Page (/admin/stats)", () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { localStorage.removeItem("vls_video_plays"); });
  });

  test("shows login form and authenticates", async ({ page }) => {
    // Unauthenticated access redirects to /admin login
    await page.goto("/admin/stats");
    await expect(page.getByText("管理画面ログイン")).toBeVisible();
    await expect(page.getByTestId("admin-password")).toBeVisible();

    // Login and navigate to stats
    await page.getByTestId("admin-password").fill("ADMIN_VLS_2026");
    await page.getByRole("button", { name: /ログイン/ }).click();
    await expect(page.getByTestId("admin-dashboard")).toBeVisible();
    await page.goto("/admin/stats");
    await expect(page.getByText("CM統計ダッシュボード")).toBeVisible();
  });

  test("shows no-data message when empty", async ({ page }) => {
    await page.goto("/admin");
    await page.evaluate(() => localStorage.removeItem("vls_video_plays"));
    await loginAndNavigate(page, "/admin/stats");

    await expect(page.getByText("まだ再生データがありません")).toBeVisible();
  });

  test("shows stats summary with seeded video plays", async ({ page }) => {
    await page.goto("/admin");
    await seedVideoPlays(page);
    await loginAndNavigate(page, "/admin/stats");

    await expect(page.getByText("総再生回数")).toBeVisible();
    await expect(page.getByText("視聴完了率")).toBeVisible();
    await expect(page.getByText("平均視聴時間")).toBeVisible();
  });

  test("event filter exists", async ({ page }) => {
    await page.goto("/admin");
    await seedVideoPlays(page);
    await loginAndNavigate(page, "/admin/stats");

    const eventFilter = page.getByTestId("stats-event-filter");
    await expect(eventFilter).toBeVisible();
  });
});

// ===== /admin/users =====
test.describe("Admin Users Page (/admin/users)", () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      localStorage.removeItem("vls_analytics");
      localStorage.removeItem("vls_video_plays");
    });
  });

  test("shows login form and authenticates", async ({ page }) => {
    // Unauthenticated access redirects to /admin login
    await page.goto("/admin/users");
    await expect(page.getByText("管理画面ログイン")).toBeVisible();

    // Login and navigate to users page
    await loginAndNavigate(page, "/admin/users");
    await expect(page.getByText("ユーザー管理")).toBeVisible();
  });

  test("shows user sessions with seeded data", async ({ page }) => {
    await page.goto("/admin");
    await seedAnalytics(page);
    await seedVideoPlays(page);
    await loginAndNavigate(page, "/admin/users");

    await expect(page.getByText("テスト太郎")).toBeVisible();
    await expect(page.getByText("テスト花子")).toBeVisible();
  });

  test("shows empty state when no data", async ({ page }) => {
    await page.goto("/admin");
    await page.evaluate(() => {
      localStorage.removeItem("vls_analytics");
      localStorage.removeItem("vls_video_plays");
    });
    await loginAndNavigate(page, "/admin/users");

    await expect(page.getByText("まだユーザーデータがありません")).toBeVisible();
  });
});

// ===== /admin/events =====
test.describe("Admin Events Page (/admin/events)", () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { localStorage.removeItem("vls_admin_events"); });
  });

  test("shows login form and authenticates", async ({ page }) => {
    // Unauthenticated access redirects to /admin login
    await page.goto("/admin/events");
    await expect(page.getByText("管理画面ログイン")).toBeVisible();

    // Login and navigate to events page
    await loginAndNavigate(page, "/admin/events");

    // Should show event headings
    await expect(page.getByRole("heading", { name: "夏祭り 2026" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "運動会 2026" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "卒業式 2026" })).toBeVisible();
  });

  test("can create new event", async ({ page }) => {
    await loginAndNavigate(page, "/admin/events");

    // Create new event
    await page.getByRole("button", { name: /新規イベント作成/ }).click();
    await page.getByTestId("event-name-input").fill("E2Eテストイベント");
    await page.getByTestId("event-date-input").fill("2026-12-31");
    await page.getByTestId("event-password-input").fill("E2ETEST1");
    await page.getByRole("button", { name: /保存/ }).click();

    // Verify created
    await expect(page.getByRole("heading", { name: "E2Eテストイベント" })).toBeVisible();
  });

  test("shows QR code for event", async ({ page }) => {
    await loginAndNavigate(page, "/admin/events");

    // Click QR button (text-based since sub-page doesn't use data-testid)
    const qrBtn = page.locator("button", { hasText: "QRコード" }).first();
    await expect(qrBtn).toBeVisible();
    await qrBtn.click();

    // QR image should appear
    await expect(page.locator("img[alt^='QR Code']").first()).toBeVisible({ timeout: 5000 });

    // QR download button should appear
    await expect(page.locator("button", { hasText: "QRコードをダウンロード" })).toBeVisible();
  });

  test("has consistent admin navigation", async ({ page }) => {
    await loginAndNavigate(page, "/admin/events");

    await expect(page.getByRole("link", { name: "Admin" })).toBeVisible();
    await expect(page.getByRole("link", { name: "アンケート" })).toBeVisible();
    await expect(page.getByRole("link", { name: "CM統計" })).toBeVisible();
    await expect(page.getByRole("link", { name: "ユーザー" })).toBeVisible();
  });
});
