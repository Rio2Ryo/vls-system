import { test, expect } from "@playwright/test";

test.describe("STEP 1 – Survey (Tag Selection)", () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto("/");
    await page.getByTestId("password-input").fill("SUMMER2026");
    await page.getByRole("button", { name: /写真を見る/ }).click();
    await expect(page).toHaveURL(/\/survey/);
  });

  test("shows first question (Q1/3)", async ({ page }) => {
    await expect(page.getByText("Q1 / 3")).toBeVisible();
    await expect(page.getByText("親子で興味があるテーマは？")).toBeVisible();
  });

  test("shows tag options for Q1", async ({ page }) => {
    await expect(page.getByText("教育")).toBeVisible();
    await expect(page.getByText("スポーツ")).toBeVisible();
  });

  test("next button is disabled with no selection", async ({ page }) => {
    const nextBtn = page.getByRole("button", { name: /つぎへ/ });
    await expect(nextBtn).toBeDisabled();
  });

  test("can select tags and proceed to Q2", async ({ page }) => {
    await page.getByText("教育").click();
    const nextBtn = page.getByRole("button", { name: /つぎへ/ });
    await expect(nextBtn).toBeEnabled();
    await nextBtn.click();
    await expect(page.getByText("Q2 / 3")).toBeVisible();
    await expect(page.getByText("気になるサービスは？")).toBeVisible();
  });

  test("completes all 3 questions and navigates to /processing", async ({ page }) => {
    // Q1
    await page.getByText("教育").click();
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
  });
});
