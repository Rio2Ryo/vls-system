import { test, expect } from "@playwright/test";

async function adminLogin(page: import("@playwright/test").Page) {
  await page.goto("/admin");
  await page.getByTestId("admin-password").fill("ADMIN_VLS_2026");
  await page.getByRole("button", { name: /ログイン/ }).click();
  await expect(page.getByTestId("admin-dashboard")).toBeVisible();
}

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
    await adminLogin(page);
    await expect(page.getByText("VLS Admin")).toBeVisible();
  });

  test("switches between tabs", async ({ page }) => {
    await adminLogin(page);

    await page.getByRole("button", { name: /イベント管理/ }).click();
    await expect(page.getByTestId("admin-events")).toBeVisible();

    await page.getByRole("button", { name: /写真管理/ }).click();
    await expect(page.getByTestId("admin-photos")).toBeVisible();

    await page.getByRole("button", { name: /企業管理/ }).click();
    await expect(page.getByTestId("admin-companies")).toBeVisible();

    await page.getByRole("button", { name: /アンケート/ }).click();
    await expect(page.getByTestId("admin-survey")).toBeVisible();
  });

  test("can logout", async ({ page }) => {
    await adminLogin(page);
    await page.getByText("ログアウト").click();
    await expect(page.getByText("管理画面ログイン")).toBeVisible();
  });
});

test.describe("Admin – Event CRUD", () => {
  test("can create a new event and user can login with its password", async ({ page }) => {
    await adminLogin(page);
    await page.getByRole("button", { name: /イベント管理/ }).click();

    // Create new event
    await page.getByRole("button", { name: /新規作成/ }).click();
    await page.getByTestId("event-name-input").fill("テストイベント");
    await page.getByTestId("event-date-input").fill("2026-12-25");
    await page.getByTestId("event-password-input").fill("TEST1234");
    await page.getByRole("button", { name: /保存/ }).click();
    await expect(page.getByTestId("admin-toast")).toBeVisible();

    // Verify password shows in events list
    await expect(page.getByText("テストイベント")).toBeVisible();
    await expect(page.getByText("TEST1234")).toBeVisible();

    // Now test user can login with this password
    await page.goto("/");
    await page.getByTestId("password-input").fill("TEST1234");
    await page.getByRole("button", { name: /写真を見る/ }).click();
    await expect(page).toHaveURL(/\/survey/);

    // Clean up
    await page.evaluate(() => localStorage.removeItem("vls_admin_events"));
  });
});

test.describe("Admin – Company CRUD", () => {
  test("can add company with CM video IDs", async ({ page }) => {
    await adminLogin(page);
    await page.getByRole("button", { name: /企業管理/ }).click();

    await page.getByRole("button", { name: /企業追加/ }).click();
    await page.getByTestId("company-name-input").fill("テスト企業");
    await page.getByTestId("company-tier-select").selectOption("platinum");
    await page.getByTestId("company-tags-input").fill("education, technology");
    await page.getByTestId("company-cm15-input").fill("dQw4w9WgXcQ");
    await page.getByTestId("company-cm30-input").fill("dQw4w9WgXcQ");
    await page.getByTestId("company-cm60-input").fill("dQw4w9WgXcQ");
    await page.getByRole("button", { name: /保存/ }).click();
    await expect(page.getByTestId("admin-toast")).toBeVisible();

    // Verify company appears with its CM video ID
    const companyCard = page.locator("text=テスト企業").locator("..");
    await expect(page.getByText("テスト企業")).toBeVisible();
    // The new company should show CM status badges
    const newCompanySection = page.locator("text=テスト企業").locator("..").locator("..");
    await expect(newCompanySection.getByText("CM15s ✓")).toBeVisible();

    await page.evaluate(() => localStorage.removeItem("vls_admin_companies"));
  });
});

test.describe("Admin – Survey edit", () => {
  test("can edit survey question text and it reflects in STEP 1", async ({ page }) => {
    await adminLogin(page);
    await page.getByRole("button", { name: /アンケート/ }).click();

    // Edit first question
    const q1Input = page.getByTestId("survey-q-q1");
    await q1Input.clear();
    await q1Input.fill("テスト質問です");
    await page.getByRole("button", { name: /保存/ }).click();
    await expect(page.getByTestId("admin-toast")).toBeVisible();

    // Go to user flow and verify
    await page.goto("/");
    await page.getByTestId("password-input").fill("SUMMER2026");
    await page.getByRole("button", { name: /写真を見る/ }).click();
    await expect(page).toHaveURL(/\/survey/);
    await expect(page.getByText("テスト質問です")).toBeVisible();

    // Clean up
    await page.evaluate(() => localStorage.removeItem("vls_admin_survey"));
  });
});
