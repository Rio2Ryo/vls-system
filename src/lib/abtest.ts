import { ABTest, ABVariant, ABAssignment } from "./types";
import { getStoredABTests, addABAssignment, getStoredABAssignments, updateABTest } from "./store";

/**
 * Find an active A/B test for a given company + event.
 * Returns null if no active test exists.
 */
export function findActiveABTest(companyId: string, eventId: string): ABTest | null {
  const tests = getStoredABTests();
  return tests.find((t) =>
    t.status === "active" &&
    t.companyId === companyId &&
    (!t.eventIds || t.eventIds.length === 0 || t.eventIds.includes(eventId))
  ) || null;
}

/**
 * Randomly assign a variant based on equal weighting.
 * Creates an ABAssignment record and increments the variant's impression count.
 */
export function assignVariant(
  test: ABTest,
  userId: string,
  eventId: string,
): { variant: ABVariant; assignment: ABAssignment } {
  // Check if user already has an assignment for this test
  const existing = getStoredABAssignments().find(
    (a) => a.testId === test.id && a.userId === userId,
  );
  if (existing) {
    const variant = test.variants.find((v) => v.id === existing.variantId);
    if (variant) return { variant, assignment: existing };
  }

  // Random equal-weight selection
  const idx = Math.floor(Math.random() * test.variants.length);
  const variant = test.variants[idx];

  // Create assignment
  const assignment: ABAssignment = {
    id: `ab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    testId: test.id,
    variantId: variant.id,
    userId,
    eventId,
    companyId: test.companyId,
    assignedCmType: variant.cmType,
    timestamp: Date.now(),
    completed: false,
    converted: false,
  };
  addABAssignment(assignment);

  // Increment impressions on the test variant
  const updatedVariants = test.variants.map((v) =>
    v.id === variant.id ? { ...v, impressions: v.impressions + 1 } : v,
  );
  updateABTest(test.id, { variants: updatedVariants });

  return { variant, assignment };
}

/**
 * Record that a user completed watching the assigned CM variant.
 */
export function recordABCompletion(testId: string, userId: string): void {
  const assignments = getStoredABAssignments();
  const assignment = assignments.find((a) => a.testId === testId && a.userId === userId);
  if (!assignment || assignment.completed) return;

  // Update assignment
  const idx = assignments.indexOf(assignment);
  assignments[idx] = { ...assignment, completed: true };
  // Direct safeSet to avoid double-read
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("vls_ab_assignments", JSON.stringify(assignments));
    } catch { /* ignore */ }
  }

  // Increment completions on the test variant
  const tests = getStoredABTests();
  const test = tests.find((t) => t.id === testId);
  if (test) {
    const updatedVariants = test.variants.map((v) =>
      v.id === assignment.variantId ? { ...v, completions: v.completions + 1 } : v,
    );
    updateABTest(testId, { variants: updatedVariants });
  }
}

/**
 * Record that a user converted (engaged with offer) for the assigned variant.
 */
export function recordABConversion(testId: string, userId: string): void {
  const assignments = getStoredABAssignments();
  const assignment = assignments.find((a) => a.testId === testId && a.userId === userId);
  if (!assignment || assignment.converted) return;

  const idx = assignments.indexOf(assignment);
  assignments[idx] = { ...assignment, converted: true };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("vls_ab_assignments", JSON.stringify(assignments));
    } catch { /* ignore */ }
  }

  const tests = getStoredABTests();
  const test = tests.find((t) => t.id === testId);
  if (test) {
    const updatedVariants = test.variants.map((v) =>
      v.id === assignment.variantId ? { ...v, conversions: v.conversions + 1 } : v,
    );
    updateABTest(testId, { variants: updatedVariants });
  }
}

// --- Statistical significance ---

interface SignificanceResult {
  chiSquared: number;
  degreesOfFreedom: number;
  pValue: number;
  significant: boolean;  // p < 0.05
  winner: string | null; // variant ID with best completion rate, or null
}

/**
 * Chi-squared test for independence on completion rates across variants.
 * Tests H0: completion rates are the same across all variants.
 */
export function calcSignificance(variants: ABVariant[]): SignificanceResult {
  const validVariants = variants.filter((v) => v.impressions > 0);
  if (validVariants.length < 2) {
    return { chiSquared: 0, degreesOfFreedom: 0, pValue: 1, significant: false, winner: null };
  }

  const totalImpressions = validVariants.reduce((s, v) => s + v.impressions, 0);
  const totalCompletions = validVariants.reduce((s, v) => s + v.completions, 0);

  if (totalImpressions === 0 || totalCompletions === 0) {
    return { chiSquared: 0, degreesOfFreedom: validVariants.length - 1, pValue: 1, significant: false, winner: null };
  }

  const overallRate = totalCompletions / totalImpressions;

  let chiSq = 0;
  for (const v of validVariants) {
    // Expected completions
    const expectedYes = v.impressions * overallRate;
    const expectedNo = v.impressions * (1 - overallRate);

    if (expectedYes > 0) {
      chiSq += Math.pow(v.completions - expectedYes, 2) / expectedYes;
    }
    if (expectedNo > 0) {
      chiSq += Math.pow((v.impressions - v.completions) - expectedNo, 2) / expectedNo;
    }
  }

  const df = validVariants.length - 1;

  // Chi-squared critical values (two-tailed, α = 0.05)
  const criticalValues: Record<number, number> = { 1: 3.841, 2: 5.991, 3: 7.815, 4: 9.488 };
  const critical = criticalValues[df] || 7.815;

  // Approximate p-value
  let pValue: number;
  if (chiSq >= critical * 2) pValue = 0.001;
  else if (chiSq >= critical * 1.5) pValue = 0.01;
  else if (chiSq >= critical) pValue = 0.04;
  else if (chiSq >= critical * 0.7) pValue = 0.1;
  else pValue = 0.5;

  // Find winner (highest completion rate)
  let winner: string | null = null;
  let bestRate = -1;
  for (const v of validVariants) {
    const rate = v.completions / v.impressions;
    if (rate > bestRate) {
      bestRate = rate;
      winner = v.id;
    }
  }

  return {
    chiSquared: Math.round(chiSq * 1000) / 1000,
    degreesOfFreedom: df,
    pValue,
    significant: chiSq >= critical,
    winner: chiSq >= critical ? winner : null,
  };
}
