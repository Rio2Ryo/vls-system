import { test, expect } from "@playwright/test";

test.describe("STEP 3 – Photos (Watermarked Gallery)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      sessionStorage.setItem("eventId", "evt-summer");
      sessionStorage.setItem("eventName", "夏祭り 2026");
    });
    await page.goto("/photos");
  });

  test("shows event name and photo count", async ({ page }) => {
    await expect(page.getByText("夏祭り 2026 の写真")).toBeVisible();
    await expect(page.getByText(/枚の写真が見つかりました/)).toBeVisible();
  });

  test("renders photo grid with canvas watermarks", async ({ page }) => {
    // Photos are rendered as canvas elements (watermarked)
    const canvases = page.locator("canvas");
    await expect(canvases.first()).toBeVisible({ timeout: 10000 });
    const count = await canvases.count();
    expect(count).toBeGreaterThan(0);
  });

  test("shows download CTA", async ({ page }) => {
    await expect(page.getByRole("button", { name: /高画質でダウンロード/ })).toBeVisible();
  });

  test("clicking download CTA navigates to /downloading", async ({ page }) => {
    await page.getByRole("button", { name: /高画質でダウンロード/ }).click();
    await expect(page).toHaveURL(/\/downloading/);
  });
});
