import { test, expect } from "@playwright/test";

/**
 * E2E tests for Face Recognition infrastructure (A1).
 * Tests the /api/face/detect endpoint and client model loading.
 *
 * Admin-protected routes require x-admin-password header.
 * CSRF-protected routes require matching csrf_token cookie + x-csrf-token header.
 */

const ADMIN_HEADERS = {
  "x-csrf-token": "e2e-test-csrf-token",
  "x-admin-password": "ADMIN_VLS_2026",
  "Content-Type": "application/json",
  Cookie: "csrf_token=e2e-test-csrf-token",
};

test.describe("Face Detection API (/api/face/detect)", () => {
  test("returns error for missing action", async ({ request }) => {
    const res = await request.post("/api/face/detect", {
      headers: ADMIN_HEADERS,
      data: {},
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Unknown action");
  });

  test("store action validates required fields", async ({ request }) => {
    const res = await request.post("/api/face/detect", {
      headers: ADMIN_HEADERS,
      data: { action: "store" },
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("eventId");
  });

  test("search action validates required fields", async ({ request }) => {
    const res = await request.post("/api/face/detect", {
      headers: ADMIN_HEADERS,
      data: { action: "search", eventId: "evt1" },
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("queryEmbedding");
  });

  test("detect action requires imageUrl", async ({ request }) => {
    const res = await request.post("/api/face/detect", {
      headers: ADMIN_HEADERS,
      data: { action: "detect" },
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("imageUrl");
  });

  test("get action requires eventId or photoId", async ({ request }) => {
    const res = await request.post("/api/face/detect", {
      headers: ADMIN_HEADERS,
      data: { action: "get" },
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("eventId or photoId");
  });
});

// ---------------------------------------------------------------------------
// /api/face/search
// ---------------------------------------------------------------------------
test.describe("Face Search API (/api/face/search)", () => {
  test("validates eventId required", async ({ request }) => {
    const res = await request.post("/api/face/search", {
      headers: ADMIN_HEADERS,
      data: { queryEmbedding: [0.1, 0.2] },
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("eventId");
  });

  test("validates queryEmbedding required", async ({ request }) => {
    const res = await request.post("/api/face/search", {
      headers: ADMIN_HEADERS,
      data: { eventId: "evt1" },
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("queryEmbedding");
  });
});

// ---------------------------------------------------------------------------
// /api/face/index
// ---------------------------------------------------------------------------
test.describe("Face Index API (/api/face/index)", () => {
  test("validates eventId and photoId required", async ({ request }) => {
    const res = await request.post("/api/face/index", {
      headers: ADMIN_HEADERS,
      data: {},
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("eventId");
  });

  test("returns ok with empty faces array", async ({ request }) => {
    const res = await request.post("/api/face/index", {
      headers: ADMIN_HEADERS,
      data: { eventId: "evt1", photoId: "photo1", faces: [] },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.indexed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Face-api.js model files
// ---------------------------------------------------------------------------
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
