import type { LocationQuery, LocationQueryRaw } from 'vue-router';

function first(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

function positiveLong(value: unknown) {
  const normalized = first(value);
  return typeof normalized === 'string' && /^[1-9]\d*$/.test(normalized)
    ? normalized
    : undefined;
}

export function sourcingGenerationRunIdFromQuery(
  query: Record<string, unknown>,
) {
  return positiveLong(query.generationRunId);
}

export function sourcingGenerationContextFromQuery(
  query: Record<string, unknown>,
) {
  const requisitionId = positiveLong(query.requisitionId);
  const rawVersion = first(query.expectedRequisitionVersion);
  const expectedRequisitionVersion =
    typeof rawVersion === 'string' && /^\d+$/.test(rawVersion)
      ? Number(rawVersion)
      : undefined;
  if (
    !requisitionId ||
    expectedRequisitionVersion === undefined ||
    !Number.isSafeInteger(expectedRequisitionVersion) ||
    expectedRequisitionVersion < 0
  ) {
    return undefined;
  }
  return { expectedRequisitionVersion, requisitionId };
}

export function withSourcingGenerationRunIdQuery(
  query: LocationQuery,
  generationRunId?: string,
): LocationQueryRaw {
  const next: LocationQueryRaw = { ...query };
  if (generationRunId) next.generationRunId = generationRunId;
  else delete next.generationRunId;
  return next;
}

export function sourcingGenerationRouteQuery(
  requisitionId: string,
  expectedRequisitionVersion: number,
) {
  return {
    expectedRequisitionVersion: String(expectedRequisitionVersion),
    requisitionId,
  };
}
