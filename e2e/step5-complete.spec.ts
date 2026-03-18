import { test, expect } from "@playwright/test";

test.describe("STEP 5 – Complete (Offer + Download)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      sessionStorage.setItem("eventId", "evt-summer");
      sessionStorage.setItem("eventName", "夏祭り 2026");
      sessionStorage.setItem("selectedPhotoIds", JSON.stringify(["p1", "p2", "p3"]));
      sessionStorage.setItem(
        "matchedCompany",
        JSON.stringify({
          id: "co-gold-1",
          name: "ファミリートラベル",
          logoUrl: "https://ui-avatars.com/api/?name=FT",
          tier: "gold",
          tags: ["travel"],
          videos: { cm15: "dQw4w9WgXcQ", cm30: "dQw4w9WgXcQ", cm60: "dQw4w9WgXcQ" },
          offerText: "家族旅行10%OFFクーポン",
          offerUrl: "https://example.com/family-travel",
          couponCode: "VLSTRIP2026",
        })
      );
      sessionStorage.setItem(
        "platinumCompany",
        JSON.stringify({
          id: "co-platinum-1",
          name: "キッズラーニング株式会社",
          logoUrl: "https://ui-avatars.com/api/?name=KL",
          tier: "platinum",
          tags: ["education"],
          videos: { cm15: "dQw4w9WgXcQ", cm30: "dQw4w9WgXcQ", cm60: "dQw4w9WgXcQ" },
          offerText: "無料体験レッスン1ヶ月分プレゼント！",
          offerUrl: "https://example.com/kids-learning",
          couponCode: "VLSKIDS2026",
        })
      );
    });
    await page.goto("/complete");
  });

  test("shows completion header", async ({ page }) => {
    await expect(page.getByText("写真の準備ができました！")).toBeVisible();
  });

  test("shows selected photo count", async ({ page }) => {
    await expect(page.getByTestId("photo-count-label")).toContainText("3枚の写真が選択されています");
  });

  test("shows platinum sponsor frame", async ({ page }) => {
    await expect(page.getByText(/キッズラーニング株式会社 提供/)).toBeVisible();
    await expect(page.getByRole("button", { name: /記念フレームを保存/ })).toBeVisible();
  });

  test("shows matched company offer", async ({ page }) => {
    await expect(page.getByText("ファミリートラベル")).toBeVisible();
    await expect(page.getByText("家族旅行10%OFFクーポン")).toBeVisible();
    await expect(page.getByText("VLSTRIP2026")).toBeVisible();
  });

  test("download button toggles state", async ({ page }) => {
    const btn = page.getByRole("button", { name: /記念フレームを保存/ });
    await btn.click();
    await expect(page.getByRole("button", { name: /保存済み/ })).toBeVisible();
  });

  test("shows download card with photo count", async ({ page }) => {
    await expect(page.getByText("3枚の高画質写真をまとめてダウンロード")).toBeVisible();
  });

  test("has offer link", async ({ page }) => {
    await expect(page.getByTestId("offer-link")).toHaveAttribute(
      "href",
      "https://example.com/family-travel"
    );
  });

  test("has back to top link", async ({ page }) => {
    await expect(page.getByText("トップに戻る")).toBeVisible();
  });
});
