/**
 * Demo mode utility.
 * When NEXT_PUBLIC_DEMO_MODE=true, the app hides debug/development features
 * and makes admin pages read-only for client demonstrations.
 */
export const IS_DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
