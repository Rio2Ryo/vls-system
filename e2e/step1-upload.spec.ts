import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

// Create a tiny test image
function createTestImage(dir: string, name: string): string {
  const filePath = path.join(dir, name);
  // 1x1 pixel PNG
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );
  fs.writeFileSync(filePath, png);
  return filePath;
}

test.describe("STEP 1: 写真アップロード", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/upload");
  });

  test("アップロードページのタイトルが表示される", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("写真をアップロード");
  });

  test("ドロップゾーンが表示される", async ({ page }) => {
    await expect(page.getByTestId("drop-zone")).toBeVisible();
  });

  test("ファイルを選択するとプレビューが表示される", async ({ page }) => {
    const tmpDir = path.join(__dirname, ".tmp");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
    const imgPath = createTestImage(tmpDir, "test.png");

    const fileInput = page.getByTestId("file-input");
    await fileInput.setInputFiles(imgPath);

    await expect(page.getByTestId("photo-count")).toContainText("1枚");

    // Cleanup
    fs.unlinkSync(imgPath);
    fs.rmdirSync(tmpDir);
  });

  test("写真なしではアップロードボタンが無効", async ({ page }) => {
    const button = page.getByRole("button", { name: /アップロードする/ });
    await expect(button).toBeDisabled();
  });

  test("写真選択後にアップロードボタンが有効になりprocessingへ遷移", async ({ page }) => {
    const tmpDir = path.join(__dirname, ".tmp");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
    const imgPath = createTestImage(tmpDir, "test2.png");

    await page.getByTestId("file-input").setInputFiles(imgPath);
    await page.getByRole("button", { name: /アップロードする/ }).click();
    await expect(page).toHaveURL("/processing");

    fs.unlinkSync(imgPath);
    fs.rmdirSync(tmpDir);
  });
});
