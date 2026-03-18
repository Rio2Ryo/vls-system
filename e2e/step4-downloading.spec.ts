import { test, expect } from "@playwright/test";

test.describe("STEP 4 – Downloading (60s forced CM wait)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      sessionStorage.setItem("eventId", "evt-summer");
      sessionStorage.setItem("eventName", "夏祭り 2026");
      sessionStorage.setItem(
        "matchedCompany",
        JSON.stringify({
          id: "co-gold-1",
          name: "ファミリートラベル",
          logoUrl: "https://ui-avatars.com/api/?name=FT&background=FFB6C1&color=fff&size=80&rounded=true",
          tier: "gold",
          tags: ["travel"],
          videos: { cm15: "dQw4w9WgXcQ", cm30: "dQw4w9WgXcQ", cm60: "dQw4w9WgXcQ" },
          offerText: "家族旅行10%OFFクーポン",
          offerUrl: "https://example.com/family-travel",
          couponCode: "VLSTRIP2026",
        })
      );
    });
    await page.goto("/downloading");
  });

  test("shows downloading title and progress", async ({ page }) => {
    await expect(page.getByText("高画質データを生成中")).toBeVisible();
    await expect(page.getByText("データ生成中")).toBeVisible();
  });

  test("proceed button starts disabled", async ({ page }) => {
    const btn = page.getByRole("button", { name: /ダウンロードへ/ });
    await expect(btn).toBeDisabled();
  });

  test("shows matched company CM video", async ({ page }) => {
    await expect(page.getByText("ファミリートラベル からのメッセージ")).toBeVisible();
  });
});
