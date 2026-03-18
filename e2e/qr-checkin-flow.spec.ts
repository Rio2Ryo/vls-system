import { test, expect, Page } from "@playwright/test";

async function adminLogin(page: Page) {
  await page.goto("/admin");
  await page.getByTestId("admin-password").fill("ADMIN_VLS_2026", { timeout: 10000 });
  await page.getByRole("button", { name: /ログイン/ }).click();
  await expect(page.getByTestId("admin-dashboard")).toBeVisible();
}

test.describe("QR Code → Check-in Flow", () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      localStorage.removeItem("vls_admin_events");
      localStorage.removeItem("vls_participants");
    });
  });

  test("Admin creates event → QR shows shareable URL", async ({ page }) => {
    await adminLogin(page);

    // Open events tab
    await page.getByRole("button", { name: /イベント管理/ }).click();
    await expect(page.getByTestId("admin-events")).toBeVisible();

    // Create new event
    await page.getByRole("button", { name: /新規作成/ }).click();
    await page.getByTestId("event-name-input").fill("QRテストイベント");
    await page.getByTestId("event-date-input").fill("2026-08-15");
    await page.getByTestId("event-password-input").fill("QRTEST2026");
    await page.getByRole("button", { name: /保存/ }).click();

    // Toast should appear
    await expect(page.getByTestId("admin-toast")).toBeVisible();

    // Shareable URL with password should be shown
    await expect(page.locator("code", { hasText: "/?pw=QRTEST2026" })).toBeVisible();

    // Click QR button for the new event
    const qrBtn = page.locator("button", { hasText: "QRコード" }).last();
    await expect(qrBtn).toBeVisible({ timeout: 5000 });
    await qrBtn.click();

    // QR code image should appear
    await expect(page.locator("img[alt^='QR Code']").first()).toBeVisible({ timeout: 10000 });
  });

  test("User scans QR URL → auto-login → reaches survey", async ({ page }) => {
    // First create event via admin
    await adminLogin(page);
    await page.getByRole("button", { name: /イベント管理/ }).click();
    await page.getByRole("button", { name: /新規作成/ }).click();
    await page.getByTestId("event-name-input").fill("QRテストイベント");
    await page.getByTestId("event-date-input").fill("2026-08-15");
    await page.getByTestId("event-password-input").fill("QRTEST2026");
    await page.getByRole("button", { name: /保存/ }).click();
    await expect(page.getByTestId("admin-toast")).toBeVisible();

    // Simulate QR scan by navigating to URL with ?pw= parameter
    await page.goto("/?pw=QRTEST2026");

    // Password should be auto-filled
    const pwInput = page.getByTestId("password-input");
    await expect(pwInput).toHaveValue("QRTEST2026");

    // Click login button
    await page.getByRole("button", { name: /写真を見る/ }).click();
    await expect(page).toHaveURL(/\/survey/);

    // Verify event name is stored in session
    const eventName = await page.evaluate(() => sessionStorage.getItem("eventName"));
    expect(eventName).toBe("QRテストイベント");
  });

  test("Check-in: admin registers participant → checks in", async ({ page }) => {
    // Login first, then seed participant data
    await adminLogin(page);

    // Add participant directly to localStorage (using default evt-summer)
    await page.evaluate(() => {
      const participants = JSON.parse(localStorage.getItem("vls_participants") || "[]");
      participants.push({
        id: "p-checkin-test-1",
        eventId: "evt-summer",
        name: "チェックインテスト太郎",
        email: "checkin@test.com",
        registeredAt: Date.now(),
        checkedIn: false,
      });
      localStorage.setItem("vls_participants", JSON.stringify(participants));
    });

    // Navigate to checkin page (session already established)
    await page.goto("/admin/checkin");

    // Wait for event select to be loaded with options
    const eventSelect = page.getByTestId("checkin-event-select");
    await expect(eventSelect).toBeVisible({ timeout: 10000 });
    // Wait for options to populate, then select the right event
    await page.waitForFunction(() => {
      const sel = document.querySelector('[data-testid="checkin-event-select"]') as HTMLSelectElement;
      return sel && sel.options.length > 1;
    }, { timeout: 10000 });
    await eventSelect.selectOption("evt-summer");

    // Wait for page to load and show participant
    await expect(page.getByText("チェックインテスト太郎")).toBeVisible({ timeout: 10000 });

    // Click check-in button
    await page.getByTestId("checkin-btn-p-checkin-test-1").click();

    // Toast should confirm check-in
    await expect(page.getByText(/チェックインテスト太郎.*チェックイン/)).toBeVisible({ timeout: 5000 });

    // Button should now show cancel state
    await expect(page.getByTestId("checkin-btn-p-checkin-test-1")).toContainText("取消");
  });

  test("Full QR flow: create event → participant → QR access → checkin → verify", async ({ page }) => {
    await adminLogin(page);

    // 1. Create event
    await page.getByRole("button", { name: /イベント管理/ }).click();
    await page.getByRole("button", { name: /新規作成/ }).click();
    await page.getByTestId("event-name-input").fill("QR統合テスト");
    await page.getByTestId("event-date-input").fill("2026-09-01");
    await page.getByTestId("event-password-input").fill("QRFULL2026");
    await page.getByRole("button", { name: /保存/ }).click();
    await expect(page.getByTestId("admin-toast")).toBeVisible();

    // 2. Add participant to the new event
    await page.evaluate(() => {
      const events = JSON.parse(localStorage.getItem("vls_admin_events") || "[]");
      const newEvent = events.find((e: { name: string }) => e.name === "QR統合テスト");
      if (!newEvent) throw new Error("Event not found");
      const participants = JSON.parse(localStorage.getItem("vls_participants") || "[]");
      participants.push({
        id: "p-qr-full-1",
        eventId: newEvent.id,
        name: "QR統合テスト花子",
        email: "qrfull@test.com",
        registeredAt: Date.now(),
        checkedIn: false,
      });
      localStorage.setItem("vls_participants", JSON.stringify(participants));
    });

    // 3. User scans QR → auto-login → survey
    await page.goto("/?pw=QRFULL2026");
    await expect(page.getByTestId("password-input")).toHaveValue("QRFULL2026");
    await page.getByRole("button", { name: /写真を見る/ }).click();
    await expect(page).toHaveURL(/\/survey/);

    // 4. Admin checks in participant
    await page.goto("/admin/checkin");

    // Select the new event by finding its option
    const eventSelect = page.getByTestId("checkin-event-select");
    const eventId = await page.evaluate(() => {
      const events = JSON.parse(localStorage.getItem("vls_admin_events") || "[]");
      const evt = events.find((e: { name: string }) => e.name === "QR統合テスト");
      return evt?.id || "";
    });
    await eventSelect.selectOption(eventId);

    // Participant should be visible
    await expect(page.getByText("QR統合テスト花子")).toBeVisible({ timeout: 5000 });

    // Check in
    await page.getByTestId("checkin-btn-p-qr-full-1").click();

    // Verify check-in toast
    await expect(page.getByText(/QR統合テスト花子.*チェックイン/)).toBeVisible();

    // Button should show cancel state
    await expect(page.getByTestId("checkin-btn-p-qr-full-1")).toContainText("取消");
  });
});
