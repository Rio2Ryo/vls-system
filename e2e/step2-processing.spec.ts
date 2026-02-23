import { test, expect } from "@playwright/test";

test.describe("STEP 2 – Processing (45s forced CM wait)", () => {
  test.beforeEach(async ({ page }) => {
    // Set session data directly and navigate
    await page.goto("/");
    await page.evaluate(() => {
      sessionStorage.setItem("eventId", "evt-summer");
      sessionStorage.setItem("eventName", "夏祭り 2026");
      sessionStorage.setItem("userTags", JSON.stringify(["education", "cram_school", "age_4_6"]));
    });
    await page.goto("/processing");
  });

  test("shows loading title and progress bar", async ({ page }) => {
    await expect(page.getByText("イベントの全写真データを読み込んでいます")).toBeVisible();
    await expect(page.getByText("読み込み中")).toBeVisible();
  });

  test("proceed button starts disabled", async ({ page }) => {
    const btn = page.getByRole("button", { name: /写真を見る/ });
    await expect(btn).toBeDisabled();
  });

  test("shows CM video or loading animation", async ({ page }) => {
    // Should show either a CM card with iframe or the loading animation
    const hasContent = await page.locator("iframe, [data-testid='loading-animation']").first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasContent).toBeTruthy();
  });
});
