import { test, expect } from "@playwright/test";

test.describe("STEP 5: 完了画面", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/complete");
  });

  test("完了タイトルが表示される", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("かんりょう");
  });

  test("紙吹雪エフェクトが表示される", async ({ page }) => {
    await expect(page.getByTestId("confetti")).toBeVisible();
  });

  test("もういちど使うボタンが表示される", async ({ page }) => {
    await expect(page.getByRole("button", { name: /もういちどつかう/ })).toBeVisible();
  });

  test("LPリンクが表示される", async ({ page }) => {
    await expect(page.getByTestId("lp-link")).toBeVisible();
    await expect(page.getByTestId("lp-link")).toContainText("もっとくわしく");
  });

  test("もういちど使うボタンでトップに戻る", async ({ page }) => {
    await page.getByRole("button", { name: /もういちどつかう/ }).click();
    await expect(page).toHaveURL("/");
  });
});
