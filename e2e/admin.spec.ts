import { test, expect } from "@playwright/test";

test.use({ locale: "ja-JP" });
// Run tests sequentially to avoid NextAuth session conflicts on shared server
test.describe.configure({ mode: "serial" });

async function adminLogin(page: import("@playwright/test").Page) {
  await page.goto("/admin");
  await expect(page.getByTestId("admin-password")).toBeVisible({ timeout: 10000 });
  await page.getByTestId("admin-password").fill("ADMIN_VLS_2026");
  await page.getByRole("button", { name: /ログイン/ }).click();
  const dashboard = page.getByTestId("admin-dashboard");
  try {
    await expect(dashboard).toBeVisible({ timeout: 15000 });
  } catch {
    // Session may not have propagated; reload and retry
    await page.reload();
    await expect(page.getByTestId("admin-password")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("admin-password").fill("ADMIN_VLS_2026");
    await page.getByRole("button", { name: /ログイン/ }).click();
    await expect(dashboard).toBeVisible({ timeout: 30000 });
  }
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

    const tablist = page.locator('[role="tablist"]');

    // Switch to events tab
    await tablist.getByRole("button", { name: /イベント管理/ }).click();
    await expect(page.getByTestId("admin-events")).toBeVisible({ timeout: 15000 });

    // Switch to companies tab
    await tablist.getByRole("button", { name: /企業管理/ }).click();
    await expect(page.getByTestId("admin-companies")).toBeVisible({ timeout: 15000 });

    // Switch to survey tab
    await tablist.getByRole("button", { name: /アンケート/ }).click();
    await expect(page.getByTestId("admin-survey")).toBeVisible({ timeout: 15000 });

    // Switch to photos tab
    await tablist.getByRole("button", { name: /写真管理/ }).click();
    await expect(page.getByTestId("admin-photos")).toBeVisible({ timeout: 15000 });
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
    await page.locator('[role="tablist"]').getByRole("button", { name: /イベント管理/ }).click();
    await expect(page.getByTestId("admin-events")).toBeVisible({ timeout: 10000 });

    // Create new event
    await page.getByRole("button", { name: /新規作成/ }).click();
    await page.getByTestId("event-name-input").fill("テストイベント");
    await page.getByTestId("event-date-input").fill("2026-12-25");
    await page.getByTestId("event-password-input").fill("TEST1234");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByTestId("admin-toast")).toBeVisible();

    // Verify event appears in events list (may need to scroll; use .first() since duplicates may exist from prior runs)
    const eventHeading = page.getByRole("heading", { name: "テストイベント" }).first();
    await eventHeading.scrollIntoViewIfNeeded();
    await expect(eventHeading).toBeVisible();

    // Prevent D1 sync from overwriting the newly created event in localStorage
    await page.evaluate(() => localStorage.setItem("__skip_d1_sync", "1"));

    // Now test user can login with this password
    await page.goto("/");
    await page.getByTestId("password-input").fill("TEST1234");
    await page.getByRole("button", { name: /写真を見る/ }).click();
    await expect(page).toHaveURL(/\/survey/);

    // Clean up
    await page.evaluate(() => {
      localStorage.removeItem("vls_admin_events");
      localStorage.removeItem("__skip_d1_sync");
    });
  });
});

test.describe("Admin – Company CRUD", () => {
  test("can add company with CM video IDs", async ({ page }) => {
    await adminLogin(page);
    await page.locator('[role="tablist"]').getByRole("button", { name: /企業管理/ }).click();
    await expect(page.getByTestId("admin-companies")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /企業追加/ }).click();
    await page.getByTestId("company-name-input").fill("テスト企業");
    await page.getByTestId("company-tier-select").selectOption("platinum");
    // Tags are now selected via TagInput dropdown instead of text input
    await page.getByText("タグを選択（クリックして展開）").click();
    // Select tags from dropdown
    const tagDropdown = page.locator(".absolute.z-50");
    await tagDropdown.getByRole("button", { name: "教育" }).click();
    await tagDropdown.getByRole("button", { name: "テクノロジー" }).click();
    await page.getByTestId("company-cm15-input").fill("dQw4w9WgXcQ");
    await page.getByTestId("company-cm30-input").fill("dQw4w9WgXcQ");
    await page.getByTestId("company-cm60-input").fill("dQw4w9WgXcQ");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByTestId("admin-toast")).toBeVisible();

    // Verify company appears in the list (scroll to find it if needed)
    const companyName = page.getByText("テスト企業").first();
    await companyName.scrollIntoViewIfNeeded();
    await expect(companyName).toBeVisible();

    await page.evaluate(() => localStorage.removeItem("vls_admin_companies"));
  });
});

test.describe("Admin – Survey edit", () => {
  test("can edit survey question text and it reflects in STEP 1", async ({ page }) => {
    await adminLogin(page);
    await page.locator('[role="tablist"]').getByRole("button", { name: /アンケート/ }).click();
    await expect(page.getByTestId("admin-survey")).toBeVisible({ timeout: 10000 });

    // Edit first question
    const q1Input = page.getByTestId("survey-q-q1");
    await q1Input.clear();
    await q1Input.fill("テスト質問です");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByTestId("admin-toast")).toBeVisible();

    // Prevent D1 sync from overwriting the saved survey in localStorage
    await page.evaluate(() => localStorage.setItem("__skip_d1_sync", "1"));

    // Go to user flow and verify the edited question text
    await page.goto("/");
    await page.getByTestId("password-input").fill("SUMMER2026");
    await page.getByRole("button", { name: /写真を見る/ }).click();
    await expect(page).toHaveURL(/\/survey/);
    // Survey now shows Q1 directly — verify edited question text
    await expect(page.getByText("テスト質問です")).toBeVisible();

    // Clean up
    await page.evaluate(() => {
      localStorage.removeItem("vls_admin_survey");
      localStorage.removeItem("__skip_d1_sync");
    });
  });
});
