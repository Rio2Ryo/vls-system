import { test, expect } from "@playwright/test";

test.describe("Admin Panel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin");
  });

  test("shows admin login form", async ({ page }) => {
    await expect(page.getByText("管理画面ログイン")).toBeVisible();
    await expect(page.getByTestId("admin-password")).toBeVisible();
  });

  test("rejects wrong password", async ({ page }) => {
    await page.getByTestId("admin-password").fill("WRONG");
    await page.getByRole("button", { name: /ログイン/ }).click();
    await expect(page.getByText("パスワードが違います")).toBeVisible();
  });

  test("logs in with correct password and shows dashboard", async ({ page }) => {
    await page.getByTestId("admin-password").fill("ADMIN_VLS_2026");
    await page.getByRole("button", { name: /ログイン/ }).click();
    await expect(page.getByTestId("admin-dashboard")).toBeVisible();
    await expect(page.getByText("VLS Admin")).toBeVisible();
  });

  test("switches between tabs", async ({ page }) => {
    // Login
    await page.getByTestId("admin-password").fill("ADMIN_VLS_2026");
    await page.getByRole("button", { name: /ログイン/ }).click();

    // Events tab
    await page.getByRole("button", { name: /イベント管理/ }).click();
    await expect(page.getByTestId("admin-events")).toBeVisible();

    // Photos tab
    await page.getByRole("button", { name: /写真管理/ }).click();
    await expect(page.getByTestId("admin-photos")).toBeVisible();

    // Companies tab
    await page.getByRole("button", { name: /企業管理/ }).click();
    await expect(page.getByTestId("admin-companies")).toBeVisible();

    // Survey tab
    await page.getByRole("button", { name: /アンケート/ }).click();
    await expect(page.getByTestId("admin-survey")).toBeVisible();
  });

  test("can logout", async ({ page }) => {
    await page.getByTestId("admin-password").fill("ADMIN_VLS_2026");
    await page.getByRole("button", { name: /ログイン/ }).click();
    await page.getByText("ログアウト").click();
    await expect(page.getByText("管理画面ログイン")).toBeVisible();
  });
});
