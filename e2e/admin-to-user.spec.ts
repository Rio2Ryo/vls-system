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
    // Clean localStorage before each test
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

    // Create new event with custom password
    await page.getByRole("button", { name: /新規作成/ }).click();
    await page.getByTestId("event-name-input").fill("Admin確認イベント");
    await page.getByTestId("event-date-input").fill("2026-06-15");
    await page.getByTestId("event-password-input").fill("ADMINTEST1");
    await page.getByRole("button", { name: /保存/ }).click();
    await expect(page.getByTestId("admin-toast")).toBeVisible();

    // Verify event appears in list
    await expect(page.getByText("Admin確認イベント")).toBeVisible();
    await expect(page.getByText("ADMINTEST1")).toBeVisible();

    // User logs in with the admin-created password
    await page.goto("/");
    await page.getByTestId("password-input").fill("ADMINTEST1");
    await page.getByRole("button", { name: /写真を見る/ }).click();
    await expect(page).toHaveURL(/\/survey/);

    // Verify correct event name in session
    const eventName = await page.evaluate(() => sessionStorage.getItem("eventName"));
    expect(eventName).toBe("Admin確認イベント");

    // Clean up
    await page.evaluate(() => localStorage.removeItem("vls_admin_events"));
  });

  test("2: Admin-registered company CM video plays in STEP 2", async ({ page }) => {
    // Clear companies so only our test company exists
    await page.evaluate(() => {
      localStorage.setItem("vls_admin_companies", "[]");
    });

    // Admin: add a platinum company with specific CM video ID
    await adminLogin(page);
    await page.getByRole("button", { name: /企業管理/ }).click();

    // No companies should be listed (cleared)
    await page.getByRole("button", { name: /企業追加/ }).click();
    await page.getByTestId("company-name-input").fill("テストCM企業");
    await page.getByTestId("company-tier-select").selectOption("platinum");
    await page.getByTestId("company-tags-input").fill("education");
    await page.getByTestId("company-cm15-input").fill("L_jWHffIx5E");
    await page.getByTestId("company-cm30-input").fill("L_jWHffIx5E");
    await page.getByTestId("company-cm60-input").fill("L_jWHffIx5E");
    await page.getByRole("button", { name: /保存/ }).click();
    await expect(page.getByTestId("admin-toast")).toBeVisible();

    // Verify company appears in admin list
    await expect(page.getByText("テストCM企業")).toBeVisible();

    // Verify localStorage was properly updated before navigating
    const stored = await page.evaluate(() => localStorage.getItem("vls_admin_companies"));
    const companies = JSON.parse(stored!);
    expect(companies).toHaveLength(1);
    expect(companies[0].name).toBe("テストCM企業");
    expect(companies[0].videos.cm15).toBe("L_jWHffIx5E");

    // Set session data while still on admin page (avoid extra navigation)
    await page.evaluate(() => {
      sessionStorage.setItem("eventId", "evt-summer");
      sessionStorage.setItem("eventName", "夏祭り 2026");
      sessionStorage.setItem("userTags", JSON.stringify(["education"]));
    });

    // Navigate directly to STEP 2
    await page.goto("/processing");

    // Verify video player shows with our registered CM video
    await expect(page.getByTestId("video-player")).toBeVisible({ timeout: 10000 });
    const iframe = page.locator("iframe");
    await expect(iframe).toBeVisible({ timeout: 5000 });
    const src = await iframe.getAttribute("src");
    expect(src).toContain("youtube.com/embed/L_jWHffIx5E");

    // Verify the company name appears in the CM label
    await expect(page.getByText("テストCM企業")).toBeVisible();

    // Clean up
    await page.evaluate(() => localStorage.removeItem("vls_admin_companies"));
  });

  test("3: Admin-uploaded photos appear in STEP 3 with watermarks", async ({ page }) => {
    // Admin: upload a photo to the summer event
    await adminLogin(page);
    await page.getByRole("button", { name: /写真管理/ }).click();

    // Default first event (夏祭り 2026) should be selected
    await expect(page.getByTestId("photo-event-select")).toBeVisible();

    // Upload test image
    const fileInput = page.getByTestId("photo-file-input");
    await fileInput.setInputFiles({
      name: "test-upload.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });

    // Wait for upload success
    await expect(page.getByTestId("admin-toast")).toBeVisible();
    await expect(page.getByTestId("admin-toast")).toContainText("写真を追加しました");

    // Verify photo count increased (12 default + 1 uploaded = 13)
    await expect(page.getByRole("heading", { name: /13枚/ })).toBeVisible();

    // User: go to STEP 3
    await page.goto("/");
    await page.evaluate(() => {
      sessionStorage.setItem("eventId", "evt-summer");
      sessionStorage.setItem("eventName", "夏祭り 2026");
    });
    await page.goto("/photos");

    // Verify 13 photos shown
    await expect(page.getByText(/13枚の写真が見つかりました/)).toBeVisible();

    // Verify watermarked canvas elements are rendered
    await expect(page.getByTestId("photo-grid")).toBeVisible();
    const canvases = page.locator("canvas");
    await expect(canvases.first()).toBeVisible({ timeout: 10000 });
    const count = await canvases.count();
    expect(count).toBe(13);

    // Clean up
    await page.evaluate(() => localStorage.removeItem("vls_admin_events"));
  });
});
