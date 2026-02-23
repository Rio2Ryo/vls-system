import { test, expect } from "@playwright/test";

test.describe("STEP 0 – Password Auth (Top Page)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows title and password input", async ({ page }) => {
    await expect(page.getByText("イベント写真サービス")).toBeVisible();
    await expect(page.getByTestId("password-input")).toBeVisible();
    await expect(page.getByRole("button", { name: /写真を見る/ })).toBeVisible();
  });

  test("shows error for empty submit", async ({ page }) => {
    await page.getByRole("button", { name: /写真を見る/ }).click();
    await expect(page.getByTestId("error-message")).toContainText("パスワードを入力してください");
  });

  test("shows error for wrong password", async ({ page }) => {
    await page.getByTestId("password-input").fill("WRONG_PASSWORD");
    await page.getByRole("button", { name: /写真を見る/ }).click();
    await expect(page.getByTestId("error-message")).toContainText("パスワードが違います");
  });

  test("navigates to /survey on correct password", async ({ page }) => {
    await page.getByTestId("password-input").fill("SUMMER2026");
    await page.getByRole("button", { name: /写真を見る/ }).click();
    await expect(page).toHaveURL(/\/survey/);
  });

  test("password is case-insensitive", async ({ page }) => {
    await page.getByTestId("password-input").fill("summer2026");
    await page.getByRole("button", { name: /写真を見る/ }).click();
    await expect(page).toHaveURL(/\/survey/);
  });
});
