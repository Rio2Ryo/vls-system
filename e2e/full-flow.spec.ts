import { test, expect } from "@playwright/test";

test.describe("Full Flow – STEP 0 → STEP 5", () => {
  test("STEP 0 → 1 → 2 (UI check) → 3 → modal → 4 (UI check) → 5", async ({ page }) => {
    // ===== STEP 0: Password Auth =====
    await page.goto("/");
    await expect(page.getByText("イベント写真サービス")).toBeVisible();
    await page.getByTestId("password-input").fill("SUMMER2026");
    await page.getByRole("button", { name: /写真を見る/ }).click();
    await expect(page).toHaveURL(/\/survey/);

    // ===== STEP 1: Survey (3 questions) =====
    // Q1
    await expect(page.getByText("Q1 / 3")).toBeVisible();
    await page.getByText("教育").click();
    await page.getByText("テクノロジー").click();
    await page.getByRole("button", { name: /つぎへ/ }).click();

    // Q2
    await expect(page.getByText("Q2 / 3")).toBeVisible();
    await page.getByText("学習塾").click();
    await page.getByRole("button", { name: /つぎへ/ }).click();

    // Q3
    await expect(page.getByText("Q3 / 3")).toBeVisible();
    await page.getByText("4〜6歳").click();
    await page.getByRole("button", { name: /スタート/ }).click();
    await expect(page).toHaveURL(/\/processing/);

    // ===== STEP 2: Processing (45s wait + CM) =====
    await expect(page.getByText("イベントの全写真データを読み込んでいます")).toBeVisible();
    await expect(page.getByText("読み込み中")).toBeVisible();
    // Button should be disabled initially
    await expect(page.getByRole("button", { name: /写真を見る/ })).toBeDisabled();

    // Verify session data was saved for later steps
    const hasTags = await page.evaluate(() => {
      const tags = sessionStorage.getItem("userTags");
      return tags !== null && JSON.parse(tags).length > 0;
    });
    expect(hasTags).toBeTruthy();

    // Skip the 45s wait by navigating directly with session data intact
    await page.goto("/photos");

    // ===== STEP 3: Photo Gallery =====
    await expect(page.getByText("夏祭り 2026 の写真")).toBeVisible();
    await expect(page.getByText(/12枚の写真が見つかりました/)).toBeVisible();

    // Wait for photo grid to render
    const photoItem = page.getByTestId("photo-summer-photo-1");
    await expect(photoItem).toBeVisible({ timeout: 10000 });

    // Click photo → modal opens
    await photoItem.click();
    await expect(page.getByTestId("photo-modal")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("透かし入りプレビュー")).toBeVisible();

    // Modal has download button
    const dlBtn = page.getByTestId("photo-download-btn");
    await expect(dlBtn).toBeVisible();
    await expect(dlBtn).toContainText("この写真の高画質データを生成");

    // Click download → navigates to STEP 4
    await dlBtn.click();
    await expect(page).toHaveURL(/\/downloading/);

    // Verify selectedPhotoIds was stored
    const photoIds = await page.evaluate(() => {
      return JSON.parse(sessionStorage.getItem("selectedPhotoIds") || "[]");
    });
    expect(photoIds).toEqual(["summer-photo-1"]);

    // ===== STEP 4: Downloading (60s wait + CM) =====
    await expect(page.getByText("高画質データを生成中")).toBeVisible();
    await expect(page.getByText("1枚の写真を処理中")).toBeVisible();
    await expect(page.getByText("データ生成中")).toBeVisible();
    await expect(page.getByRole("button", { name: /ダウンロードへ/ })).toBeDisabled();

    // Verify matched company CM is shown (from sessionStorage set during processing)
    const hasMatchedCompany = await page.evaluate(() => {
      return sessionStorage.getItem("matchedCompany") !== null;
    });
    expect(hasMatchedCompany).toBeTruthy();

    // Skip the 60s wait by navigating directly
    await page.goto("/complete");

    // ===== STEP 5: Complete (Offer + Download) =====
    await expect(page.getByText("写真の準備ができました！")).toBeVisible();

    // Check platinum sponsor (if set)
    const hasPlatinum = await page.evaluate(() => {
      return sessionStorage.getItem("platinumCompany") !== null;
    });
    if (hasPlatinum) {
      await expect(page.getByText(/提供 記念フレーム/)).toBeVisible();
      await expect(page.getByRole("button", { name: /記念フレームを保存/ })).toBeVisible();
    }

    // Check matched company offer (if set)
    const hasMatched = await page.evaluate(() => {
      return sessionStorage.getItem("matchedCompany") !== null;
    });
    if (hasMatched) {
      await expect(page.getByText("限定オファー")).toBeVisible();
      await expect(page.getByTestId("offer-link")).toBeVisible();
    }

    // Back to top link
    await expect(page.getByText("トップに戻る")).toBeVisible();
  });
});
