import { test, expect } from "@playwright/test";

test.describe("STEP 0: トップページ - イベントコード入力", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("タイトル「VLS」が表示される", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("VLS");
  });

  test("イベントコード入力フィールドが表示される", async ({ page }) => {
    await expect(page.getByTestId("event-code-input")).toBeVisible();
  });

  test("空のコードでsubmitするとエラーが表示される", async ({ page }) => {
    await page.getByRole("button", { name: /はじめる/ }).click();
    await expect(page.getByTestId("error-message")).toBeVisible();
    await expect(page.getByTestId("error-message")).toContainText("入力してください");
  });

  test("短すぎるコードでエラーが表示される", async ({ page }) => {
    await page.getByTestId("event-code-input").fill("AB");
    await page.getByRole("button", { name: /はじめる/ }).click();
    await expect(page.getByTestId("error-message")).toContainText("4文字以上");
  });

  test("有効なコードで /upload に遷移する", async ({ page }) => {
    await page.getByTestId("event-code-input").fill("SUMMER2026");
    await page.getByRole("button", { name: /はじめる/ }).click();
    await expect(page).toHaveURL("/upload");
  });
});
