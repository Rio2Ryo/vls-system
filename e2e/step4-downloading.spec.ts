import { test, expect } from "@playwright/test";

test.describe("STEP 4: ダウンロード処理中（CM+アンケート）", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/downloading");
  });

  test("ダウンロード中タイトルが表示される", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("ダウンロードちゅう");
  });

  test("プログレスバーが表示される", async ({ page }) => {
    await expect(page.getByTestId("progress-bar")).toBeVisible();
  });

  test("ローディングアニメーションが初期表示される", async ({ page }) => {
    await expect(page.getByTestId("loading-animation")).toBeVisible();
  });

  test("しばらく待つとCMまたはアンケートが表示される", async ({ page }) => {
    await page.waitForTimeout(4000);

    const cmVisible = await page.getByTestId("cm-player").isVisible().catch(() => false);
    const cmManagerVisible = await page.getByTestId("cm-segment-manager").isVisible().catch(() => false);
    const surveyVisible = await page.getByTestId("survey-form").isVisible().catch(() => false);

    expect(cmVisible || cmManagerVisible || surveyVisible).toBeTruthy();
  });
});
