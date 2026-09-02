import type { LocationQuery, LocationQueryRaw } from 'vue-router';

export function phaseAfterClosedGenerationRun(
  editing: boolean,
  hasEditableForm: boolean,
) {
  return editing && hasEditableForm ? ('READY' as const) : ('START' as const);
}

export function generationRunIdFromQuery(query: Record<string, unknown>) {
  const value = Array.isArray(query.generationRunId)
    ? query.generationRunId[0]
    : query.generationRunId;
  return typeof value === 'string' && /^\d+$/.test(value) ? value : undefined;
}

export function withGenerationRunIdQuery(
  query: LocationQuery,
  generationRunId?: string,
): LocationQueryRaw {
  const next: LocationQueryRaw = { ...query };
  if (generationRunId) {
    next.generationRunId = generationRunId;
  } else {
    delete next.generationRunId;
  }
  return next;
}
