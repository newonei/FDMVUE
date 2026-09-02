import type { LocationQuery, LocationQueryRaw } from 'vue-router';

function first(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

export function generationRunIdFromQuery(query: Record<string, unknown>) {
  const value = first(query.generationRunId);
  return typeof value === 'string' && /^\d+$/.test(value) ? value : undefined;
}

export function fulfillmentPlanContextFromQuery(
  query: Record<string, unknown>,
) {
  const fulfillmentPlanId = first(query.fulfillmentPlanId);
  const rawVersion = first(query.expectedPlanVersion);
  const expectedPlanVersion =
    typeof rawVersion === 'string' && /^\d+$/.test(rawVersion)
      ? Number(rawVersion)
      : undefined;
  if (
    typeof fulfillmentPlanId !== 'string' ||
    !/^\d+$/.test(fulfillmentPlanId) ||
    !Number.isSafeInteger(expectedPlanVersion) ||
    expectedPlanVersion === undefined ||
    expectedPlanVersion < 0
  ) {
    return undefined;
  }
  return { expectedPlanVersion, fulfillmentPlanId };
}

export function withGenerationRunIdQuery(
  query: LocationQuery,
  generationRunId?: string,
): LocationQueryRaw {
  const next: LocationQueryRaw = { ...query };
  if (generationRunId) next.generationRunId = generationRunId;
  else delete next.generationRunId;
  return next;
}

export function requisitionGenerationRouteQuery(
  fulfillmentPlanId: string,
  expectedPlanVersion: number,
) {
  return {
    expectedPlanVersion: String(expectedPlanVersion),
    fulfillmentPlanId,
  };
}
