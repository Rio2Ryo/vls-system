import { test, expect } from "@playwright/test";

// 1x1 red pixel PNG (admin thumbnail generator upscales to 400x300)
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

async function adminLogin(page: import("@playwright/test").Page) {
  await page.goto("/admin");
  await page.getByTestId("admin-password").fill("ADMIN_VLS_2026");
  await page.getByRole("button", { name: /ログイン/ }).click();
  await expect(page.getByTestId("admin-dashboard")).toBeVisible();
}

test.describe("Admin → User Integration", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.removeItem("vls_admin_events");
      localStorage.removeItem("vls_admin_companies");
      localStorage.removeItem("vls_admin_survey");
    });
  });

  test("1: Admin-created event password allows user login at STEP 0", async ({ page }) => {
    await adminLogin(page);
    await page.getByRole("button", { name: /イベント管理/ }).click();

    // Create new event
    await page.getByRole("button", { name: /新規作成/ }).click();
    await page.getByTestId("event-name-input").fill("Admin確認イベント");
    await page.getByTestId("event-date-input").fill("2026-06-15");
    await page.getByTestId("event-password-input").fill("ADMINTEST1");
    await page.getByRole("button", { name: /保存/ }).click();
    await expect(page.getByTestId("admin-toast")).toBeVisible();

    // Verify event appears with password and shareable URL
    await expect(page.getByRole("heading", { name: "Admin確認イベント" })).toBeVisible();
    await expect(page.locator("code", { hasText: "/?pw=ADMINTEST1" })).toBeVisible();

    // User logs in with the admin-created password
    await page.goto("/");
    await page.getByTestId("password-input").fill("ADMINTEST1");
    await page.getByRole("button", { name: /写真を見る/ }).click();
    await expect(page).toHaveURL(/\/survey/);

    const eventName = await page.evaluate(() => sessionStorage.getItem("eventName"));
    expect(eventName).toBe("Admin確認イベント");

    await page.evaluate(() => localStorage.removeItem("vls_admin_events"));
  });

  test("2: Admin-registered company CM video plays in STEP 2", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem("vls_admin_companies", "[]");
    });

    await adminLogin(page);
    await page.getByRole("button", { name: /企業管理/ }).click();

    // Add platinum company with specific CM video IDs (15s/30s/60s)
    await page.getByRole("button", { name: /企業追加/ }).click();
    await page.getByTestId("company-name-input").fill("テストCM企業");
    await page.getByTestId("company-tier-select").selectOption("platinum");
    await page.getByTestId("company-tags-input").fill("education");
    await page.getByTestId("company-cm15-input").fill("L_jWHffIx5E");
    await page.getByTestId("company-cm30-input").fill("L_jWHffIx5E");
    await page.getByTestId("company-cm60-input").fill("L_jWHffIx5E");
    await page.getByRole("button", { name: /保存/ }).click();
    await expect(page.getByTestId("admin-toast")).toBeVisible();
    await expect(page.getByText("テストCM企業")).toBeVisible();

    // Verify localStorage
    const stored = await page.evaluate(() => localStorage.getItem("vls_admin_companies"));
    const companies = JSON.parse(stored!);
    expect(companies).toHaveLength(1);
    expect(companies[0].videos.cm15).toBe("L_jWHffIx5E");

    // Set session and go to STEP 2
    // Ensure test company is in localStorage before navigation
    // (re-set directly to prevent any race condition with React state)
    await page.evaluate((videoId) => {
      const stored = JSON.parse(localStorage.getItem("vls_admin_companies") || "[]");
      if (stored.length === 0 || stored[0].videos.cm15 !== videoId) {
        throw new Error("Company not found in localStorage: " + JSON.stringify(stored));
      }
      sessionStorage.setItem("eventId", "evt-summer");
      sessionStorage.setItem("eventName", "夏祭り 2026");
      sessionStorage.setItem("userTags", JSON.stringify(["education"]));
    }, "L_jWHffIx5E");
    await page.goto("/processing");

    // Verify CM video plays with our registered video ID
    await expect(page.getByTestId("video-player")).toBeVisible({ timeout: 10000 });
    const iframe = page.locator("iframe");
    await expect(iframe).toBeVisible({ timeout: 5000 });
    const src = await iframe.getAttribute("src");
    expect(src).toContain("youtube.com/embed/L_jWHffIx5E");
    await expect(page.getByText("テストCM企業")).toBeVisible();

    await page.evaluate(() => localStorage.removeItem("vls_admin_companies"));
  });

  test("3: Admin-uploaded photos appear in STEP 3 with watermarks", async ({ page }) => {
    await adminLogin(page);
    await page.getByRole("button", { name: /写真管理/ }).click();
    await expect(page.getByTestId("photo-event-select")).toBeVisible();

    // Upload test image
    const fileInput = page.getByTestId("photo-file-input");
    await fileInput.setInputFiles({
      name: "test-upload.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });

    await expect(page.getByTestId("admin-toast")).toBeVisible();
    await expect(page.getByTestId("admin-toast")).toContainText("写真を追加しました");
    await expect(page.getByRole("heading", { name: /13枚/ })).toBeVisible();

    // User: go to STEP 3
    await page.evaluate(() => {
      sessionStorage.setItem("eventId", "evt-summer");
      sessionStorage.setItem("eventName", "夏祭り 2026");
    });
    await page.goto("/photos");

    await expect(page.getByText(/13枚の写真が見つかりました/)).toBeVisible();
    await expect(page.getByTestId("photo-grid")).toBeVisible();
    const canvases = page.locator("canvas");
    await expect(canvases.first()).toBeVisible({ timeout: 10000 });
    expect(await canvases.count()).toBe(13);

    await page.evaluate(() => localStorage.removeItem("vls_admin_events"));
  });

  test("4: Event shareable URL with ?pw= auto-fills password", async ({ page }) => {
    await adminLogin(page);
    await page.getByRole("button", { name: /イベント管理/ }).click();

    // Verify shareable URL is displayed for default events
    const urlEl = page.getByTestId("event-url-evt-summer");
    await expect(urlEl).toBeVisible();
    const urlText = await urlEl.textContent();
    // URL may use slug (/e/summer2026) or password query (/?pw=SUMMER2026)
    expect(urlText).toMatch(/\/e\/summer2026|\/\?pw=SUMMER2026/);

    // Copy button exists
    const copyBtn = page.getByTestId("event-copy-url-evt-summer");
    await expect(copyBtn).toContainText("URLコピー");

    // Navigate to the shareable URL (test password-based URL still works)
    await page.goto("/?pw=SUMMER2026");

    // Password should be auto-filled
    const input = page.getByTestId("password-input");
    await expect(input).toHaveValue("SUMMER2026");

    // Click submit → should navigate to survey
    await page.getByRole("button", { name: /写真を見る/ }).click();
    await expect(page).toHaveURL(/\/survey/);
  });

  test("5: Full Admin E2E: login → event → photos → CM → URL → user access", async ({ page }) => {
    // ===== STEP A: Admin Login =====
    await adminLogin(page);

    // ===== STEP B: Create Event with Password =====
    await page.getByRole("button", { name: /イベント管理/ }).click();
    await page.getByRole("button", { name: /新規作成/ }).click();
    await page.getByTestId("event-name-input").fill("完全テストイベント");
    await page.getByTestId("event-date-input").fill("2026-08-01");
    await page.getByTestId("event-password-input").fill("FULLTEST1");
    await page.getByRole("button", { name: /保存/ }).click();
    await expect(page.getByTestId("admin-toast")).toBeVisible();
    await expect(page.getByRole("heading", { name: "完全テストイベント" })).toBeVisible();

    // Verify shareable URL appears
    const urlEl = page.locator("[data-testid^='event-url-']").last();
    await expect(urlEl).toContainText("/?pw=FULLTEST1");

    // ===== STEP C: Upload Photos =====
    await page.getByRole("button", { name: /写真管理/ }).click();
    await expect(page.getByTestId("photo-event-select")).toBeVisible();

    // Select the new event
    const newEventId = await page.evaluate(() => {
      const evts = JSON.parse(localStorage.getItem("vls_admin_events") || "[]");
      const found = evts.find((e: { name: string }) => e.name === "完全テストイベント");
      return found?.id;
    });
    expect(newEventId).toBeTruthy();
    await page.getByTestId("photo-event-select").selectOption(newEventId);

    // Upload a test photo
    await page.getByTestId("photo-file-input").setInputFiles({
      name: "full-test-photo.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });
    await expect(page.getByTestId("admin-toast")).toBeVisible();

    // ===== STEP D: Register CM Company (15s/30s/60s) =====
    await page.getByRole("button", { name: /企業管理/ }).click();
    await page.getByRole("button", { name: /企業追加/ }).click();
    await page.getByTestId("company-name-input").fill("フルテスト企業");
    await page.getByTestId("company-tier-select").selectOption("platinum");
    await page.getByTestId("company-tags-input").fill("education, technology");
    await page.getByTestId("company-cm15-input").fill("dQw4w9WgXcQ");
    await page.getByTestId("company-cm30-input").fill("dQw4w9WgXcQ");
    await page.getByTestId("company-cm60-input").fill("dQw4w9WgXcQ");
    await page.getByRole("button", { name: /保存/ }).click();
    await expect(page.getByTestId("admin-toast")).toBeVisible();
    await expect(page.getByText("フルテスト企業")).toBeVisible();

    // Verify CM status badges
    const companySection = page.locator("text=フルテスト企業").locator("..").locator("..");
    await expect(companySection.getByText("CM15s")).toBeVisible();

    // ===== STEP E: User accesses via shareable URL =====
    await page.goto("/?pw=FULLTEST1");
    await expect(page.getByTestId("password-input")).toHaveValue("FULLTEST1");
    await page.getByRole("button", { name: /写真を見る/ }).click();
    await expect(page).toHaveURL(/\/survey/);

    // Verify event name
    const storedName = await page.evaluate(() => sessionStorage.getItem("eventName"));
    expect(storedName).toBe("完全テストイベント");

    // Clean up
    await page.evaluate(() => {
      localStorage.removeItem("vls_admin_events");
      localStorage.removeItem("vls_admin_companies");
    });
  });
});
