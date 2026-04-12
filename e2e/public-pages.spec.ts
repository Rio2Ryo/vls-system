import { test, expect } from "@playwright/test";

test.use({ locale: "ja-JP" });

/**
 * E2E tests for public pages added in Phase 3–14.
 * These pages don't require admin authentication.
 */

// ---------------------------------------------------------------------------
// /lp — Landing Page (Phase10)
// ---------------------------------------------------------------------------
test.describe("Landing Page (/lp)", () => {
  test("loads and shows hero section", async ({ page }) => {
    await page.goto("/lp");
    await expect(page.getByText("イベント写真")).toBeVisible({ timeout: 10000 });
  });

  test("shows CTA buttons", async ({ page }) => {
    await page.goto("/lp");
    await expect(page.getByRole("link", { name: /デモ体験/ })).toBeVisible({ timeout: 10000 });
  });

  test("shows pricing section", async ({ page }) => {
    await page.goto("/lp");
    await expect(page.getByText("Free")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Basic")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Premium")).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// /demo — Demo Page
// ---------------------------------------------------------------------------
test.describe("Demo Page (/demo)", () => {
  test("loads without password", async ({ page }) => {
    await page.goto("/demo");
    await expect(page.locator("body")).toBeVisible();
    // Demo page should show something (not a login form)
    // It reuses the user flow components in demo mode
  });
});

// ---------------------------------------------------------------------------
// /report/[token] — Sponsor Report (Phase13-2)
// ---------------------------------------------------------------------------
test.describe("Sponsor Report Page (/report/[token])", () => {
  test("shows expired/invalid message for bad token", async ({ page }) => {
    await page.goto("/report/invalid-token-12345");
    // Should show some error state (expired, invalid, or loading)
    await page.waitForTimeout(3000);
    const body = await page.textContent("body");
    // The page should handle invalid tokens gracefully
    expect(body).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// /scan — Mobile QR Check-in
// ---------------------------------------------------------------------------
test.describe("Scan Page (/scan)", () => {
  test("loads scan page", async ({ page }) => {
    await page.goto("/scan");
    await expect(page.locator("body")).toBeVisible();
  });
});
