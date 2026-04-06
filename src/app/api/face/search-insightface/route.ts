/**
 * @deprecated This endpoint is deprecated. Use POST /api/face/search instead.
 * This file is kept for backward compatibility and simply re-exports from the main search API.
 */

export { POST } from "../search/route";
export const runtime = "nodejs";
export const maxDuration = 60;
