import { test, expect } from "@playwright/test";

test.use({ locale: "ja-JP" });

test.describe("STEP 3 – Photos (Multi-Select Gallery)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("__skip_d1_sync", "1");
      sessionStorage.setItem("eventId", "evt-summer");
      sessionStorage.setItem("eventName", "夏祭り 2026");
    });
    await page.goto("/photos");
  });

  test("shows event name and photo count", async ({ page }) => {
    await expect(page.getByText("夏祭り 2026 の写真")).toBeVisible();
    await expect(page.getByText(/枚の写真が見つかりました/)).toBeVisible();
  });

  test("renders photo grid with items", async ({ page }) => {
    const firstPhoto = page.getByTestId("photo-summer-photo-1");
    await expect(firstPhoto).toBeVisible({ timeout: 10000 });
  });

  test("clicking a photo toggles selection checkmark", async ({ page }) => {
    const firstPhoto = page.getByTestId("photo-summer-photo-1");
    await expect(firstPhoto).toBeVisible({ timeout: 10000 });

    // Initially not selected
    const check = page.getByTestId("check-summer-photo-1");
    await expect(check).toContainText("選択する");

    // Click to select
    await firstPhoto.click();
    await expect(check).toContainText("選択中");

    // Click again to deselect
    await firstPhoto.click();
    await expect(check).toContainText("選択する");
  });

  test("selecting photos shows selection counter", async ({ page }) => {
    const photo1 = page.getByTestId("photo-summer-photo-1");
    const photo2 = page.getByTestId("photo-summer-photo-2");
    await expect(photo1).toBeVisible({ timeout: 10000 });

    // Select two photos
    await photo1.click();
    await expect(page.getByTestId("selection-count")).toContainText("1枚選択中");

    await photo2.click();
    await expect(page.getByTestId("selection-count")).toContainText("2枚選択中");
  });

  test("select all / deselect all works", async ({ page }) => {
    const selectAllBtn = page.getByTestId("select-all-btn");
    await expect(selectAllBtn).toBeVisible();
    await expect(selectAllBtn).toContainText("すべて選択");

    // Wait for grid to render
    await expect(page.getByTestId("photo-summer-photo-1")).toBeVisible({ timeout: 10000 });

    // Select all
    await selectAllBtn.click();
    await expect(selectAllBtn).toContainText("選択解除");
    await expect(page.getByTestId("selection-count")).toBeVisible();

    // Deselect all
    await selectAllBtn.click();
    await expect(selectAllBtn).toContainText("すべて選択");
  });

  test("preview button opens modal", async ({ page }) => {
    const previewBtn = page.getByTestId("preview-summer-photo-1");
    await expect(previewBtn).toBeVisible({ timeout: 10000 });

    await previewBtn.click();
    await expect(page.getByTestId("photo-modal")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("透かし入りプレビュー")).toBeVisible();
  });

  test("modal close button works", async ({ page }) => {
    const previewBtn = page.getByTestId("preview-summer-photo-1");
    await expect(previewBtn).toBeVisible({ timeout: 10000 });
    await previewBtn.click();
    await expect(page.getByTestId("photo-modal")).toBeVisible({ timeout: 5000 });

    await page.getByTestId("modal-close").click();
    await expect(page.getByTestId("photo-modal")).not.toBeVisible();
  });

  test("download button disabled when no photos selected", async ({ page }) => {
    await expect(page.getByTestId("photo-summer-photo-1")).toBeVisible({ timeout: 10000 });
    const dlBtn = page.getByRole("button", { name: /選択した写真をダウンロード/ });
    await expect(dlBtn).toBeDisabled();
  });

  test("selecting photos and clicking download navigates to /downloading", async ({ page }) => {
    const photo1 = page.getByTestId("photo-summer-photo-1");
    const photo2 = page.getByTestId("photo-summer-photo-2");
    await expect(photo1).toBeVisible({ timeout: 10000 });

    await photo1.click();
    await photo2.click();

    const dlBtn = page.getByRole("button", { name: /選択した写真をダウンロード/ });
    await expect(dlBtn).toBeEnabled();
    await dlBtn.click();
    await expect(page).toHaveURL(/\/downloading/);

    // Verify selectedPhotoIds stored
    const ids = await page.evaluate(() => {
      return JSON.parse(sessionStorage.getItem("selectedPhotoIds") || "[]");
    });
    expect(ids).toHaveLength(2);
    expect(ids).toContain("summer-photo-1");
    expect(ids).toContain("summer-photo-2");
  });
});
