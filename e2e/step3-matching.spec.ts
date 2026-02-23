import { test, expect } from "@playwright/test";

test.describe("STEP 3: 写真マッチング結果", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/matching");
  });

  test("結果タイトルが表示される", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("みつかったよ");
  });

  test("マッチ結果グリッドが表示される", async ({ page }) => {
    await expect(page.getByTestId("match-results").first()).toBeVisible();
  });

  test("確実マッチセクションが表示される", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /確実マッチ/ })).toBeVisible();
  });

  test("ダウンロードボタンが表示される", async ({ page }) => {
    const button = page.getByRole("button", { name: /ダウンロード/ });
    await expect(button).toBeVisible();
  });

  test("ダウンロードボタンをクリックすると downloading に遷移", async ({ page }) => {
    await page.getByRole("button", { name: /ダウンロード/ }).click();
    await expect(page).toHaveURL("/downloading");
  });

  test("写真タグが表示される", async ({ page }) => {
    // At least one tag should be visible on match cards
    const tags = page.locator("[data-testid^='tag-']");
    await expect(tags.first()).toBeVisible();
  });

  test("高確率マッチセクションが表示される", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /高確率マッチ/ })).toBeVisible();
  });

  test("要確認セクションが表示される", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /要確認/ })).toBeVisible();
  });
});
