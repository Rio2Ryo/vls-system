import { test, expect } from "@playwright/test";

test.describe("Full Flow – STEP 0 → STEP 5", () => {
  test("STEP 0 → 1 → 2 (UI check) → 3 (multi-select) → 4 (UI check) → 5", async ({ page }) => {
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
    await expect(page.getByRole("button", { name: /写真を見る/ })).toBeDisabled();

    // Verify session data was saved
    const hasTags = await page.evaluate(() => {
      const tags = sessionStorage.getItem("userTags");
      return tags !== null && JSON.parse(tags).length > 0;
    });
    expect(hasTags).toBeTruthy();

    // Skip the 45s wait by navigating directly
    await page.goto("/photos");

    // ===== STEP 3: Photo Gallery (Multi-Select) =====
    await expect(page.getByText("夏祭り 2026 の写真")).toBeVisible();
    await expect(page.getByText(/12枚の写真が見つかりました/)).toBeVisible();

    // Wait for photo grid to render
    const photo1 = page.getByTestId("photo-summer-photo-1");
    const photo2 = page.getByTestId("photo-summer-photo-2");
    await expect(photo1).toBeVisible({ timeout: 10000 });

    // Download button disabled before selection
    const dlBtn = page.getByRole("button", { name: /選択した写真をダウンロード/ });
    await expect(dlBtn).toBeDisabled();

    // Select two photos
    await photo1.click();
    await expect(page.getByTestId("check-summer-photo-1")).toContainText("✓");
    await expect(page.getByTestId("selection-count")).toContainText("1枚選択中");

    await photo2.click();
    await expect(page.getByTestId("selection-count")).toContainText("2枚選択中");

    // Preview still works via preview button
    await page.getByTestId("preview-summer-photo-1").click();
    await expect(page.getByTestId("photo-modal")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("透かし入りプレビュー")).toBeVisible();
    await page.getByTestId("modal-close").click();
    await expect(page.getByTestId("photo-modal")).not.toBeVisible();

    // Download selected → STEP 4
    await expect(dlBtn).toBeEnabled();
    await dlBtn.click();
    await expect(page).toHaveURL(/\/downloading/);

    // Verify selectedPhotoIds
    const photoIds = await page.evaluate(() => {
      return JSON.parse(sessionStorage.getItem("selectedPhotoIds") || "[]");
    });
    expect(photoIds).toHaveLength(2);

    // ===== STEP 4: Downloading (60s wait + CM) =====
    await expect(page.getByText("高画質データを生成中")).toBeVisible();
    await expect(page.getByText("2枚の写真を処理中")).toBeVisible();
    await expect(page.getByText("データ生成中")).toBeVisible();
    await expect(page.getByRole("button", { name: /ダウンロードへ/ })).toBeDisabled();

    // Verify matched company CM is shown
    const hasMatchedCompany = await page.evaluate(() => {
      return sessionStorage.getItem("matchedCompany") !== null;
    });
    expect(hasMatchedCompany).toBeTruthy();

    // Skip the 60s wait
    await page.goto("/complete");

    // ===== STEP 5: Complete (Offer + Download) =====
    await expect(page.getByText("写真の準備ができました！")).toBeVisible();

    // Check photo count label
    await expect(page.getByTestId("photo-count-label")).toContainText("2枚の写真が選択されています");

    // Check download card
    await expect(page.getByText(/高画質写真をまとめてダウンロード/)).toBeVisible();

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
