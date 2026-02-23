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
    const canvases = page.locator("canvas");
    await expect(canvases.first()).toBeVisible({ timeout: 10000 });
    const count = await canvases.count();
    expect(count).toBeGreaterThan(0);
  });

  test("clicking a photo opens modal with download button", async ({ page }) => {
    // Target a specific photo item (not the grid container)
    const firstPhoto = page.getByTestId("photo-summer-photo-1");
    await expect(firstPhoto).toBeVisible({ timeout: 10000 });
    await firstPhoto.click();

    await expect(page.getByTestId("photo-modal")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("photo-download-btn")).toBeVisible();
    await expect(page.getByTestId("photo-download-btn")).toContainText("この写真の高画質データを生成");
  });

  test("modal close button works", async ({ page }) => {
    const firstPhoto = page.getByTestId("photo-summer-photo-1");
    await expect(firstPhoto).toBeVisible({ timeout: 10000 });
    await firstPhoto.click();
    await expect(page.getByTestId("photo-modal")).toBeVisible({ timeout: 5000 });

    await page.getByTestId("modal-close").click();
    await expect(page.getByTestId("photo-modal")).not.toBeVisible();
  });

  test("clicking photo download button navigates to /downloading", async ({ page }) => {
    const firstPhoto = page.getByTestId("photo-summer-photo-1");
    await expect(firstPhoto).toBeVisible({ timeout: 10000 });
    await firstPhoto.click();
    await expect(page.getByTestId("photo-download-btn")).toBeVisible({ timeout: 5000 });

    await page.getByTestId("photo-download-btn").click();
    await expect(page).toHaveURL(/\/downloading/);
  });

  test("photo download stores selectedPhotoIds in sessionStorage", async ({ page }) => {
    const firstPhoto = page.getByTestId("photo-summer-photo-1");
    await expect(firstPhoto).toBeVisible({ timeout: 10000 });
    await firstPhoto.click();
    await expect(page.getByTestId("photo-download-btn")).toBeVisible({ timeout: 5000 });
    await page.getByTestId("photo-download-btn").click();

    const ids = await page.evaluate(() => {
      return JSON.parse(sessionStorage.getItem("selectedPhotoIds") || "[]");
    });
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBe("summer-photo-1");
  });

  test("shows all-photos download CTA", async ({ page }) => {
    await expect(page.getByRole("button", { name: /全写真を高画質でダウンロード/ })).toBeVisible();
  });

  test("clicking all-photos CTA navigates to /downloading", async ({ page }) => {
    await page.getByRole("button", { name: /全写真を高画質でダウンロード/ }).click();
    await expect(page).toHaveURL(/\/downloading/);
  });
});
