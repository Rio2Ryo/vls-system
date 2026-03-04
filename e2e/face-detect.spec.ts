import { test, expect } from "@playwright/test";

/**
 * E2E tests for Face Recognition infrastructure (A1).
 * Tests the /api/face/detect endpoint and client model loading.
 */

test.describe("Face Detection API (/api/face/detect)", () => {
  test("returns error for missing action", async ({ request }) => {
    const res = await request.post("/api/face/detect", {
      headers: {
        "x-csrf-token": "e2e-test-csrf-token",
        "Content-Type": "application/json",
      },
      data: {},
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Unknown action");
  });

  test("store action validates required fields", async ({ request }) => {
    const res = await request.post("/api/face/detect", {
      headers: {
        "x-csrf-token": "e2e-test-csrf-token",
        "Content-Type": "application/json",
      },
      data: { action: "store" },
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("eventId");
  });

  test("search action validates required fields", async ({ request }) => {
    const res = await request.post("/api/face/detect", {
      headers: {
        "x-csrf-token": "e2e-test-csrf-token",
        "Content-Type": "application/json",
      },
      data: { action: "search", eventId: "evt1" },
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("queryEmbedding");
  });

  test("detect action requires imageUrl", async ({ request }) => {
    const res = await request.post("/api/face/detect", {
      headers: {
        "x-csrf-token": "e2e-test-csrf-token",
        "Content-Type": "application/json",
      },
      data: { action: "detect" },
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("imageUrl");
  });

  test("get action requires eventId or photoId", async ({ request }) => {
    const res = await request.post("/api/face/detect", {
      headers: {
        "x-csrf-token": "e2e-test-csrf-token",
        "Content-Type": "application/json",
      },
      data: { action: "get" },
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("eventId or photoId");
  });
});

test.describe("Face-api.js model files", () => {
  test("tiny_face_detector model manifest is accessible", async ({ request }) => {
    const res = await request.get("/models/tiny_face_detector_model-weights_manifest.json");
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json.length).toBeGreaterThan(0);
  });

  test("face_recognition_model manifest is accessible", async ({ request }) => {
    const res = await request.get("/models/face_recognition_model-weights_manifest.json");
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
  });

  test("face_landmark_68_model manifest is accessible", async ({ request }) => {
    const res = await request.get("/models/face_landmark_68_model-weights_manifest.json");
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
  });
});
