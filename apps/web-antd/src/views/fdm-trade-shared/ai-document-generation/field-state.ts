import type { AiFieldMeta, AiFieldStateMap } from './types';

import { aiFieldValueEquals } from './value-comparison';

function cloneValue<T>(value: T): T {
  if (value === undefined || value === null) return value;
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createAiFieldStateMap(
  fields: readonly AiFieldMeta[] = [],
): AiFieldStateMap {
  return Object.fromEntries(
    fields.map((field) => [
      field.fieldKey,
      {
        ...cloneValue(field),
        alternatives: cloneValue(field.alternatives ?? []),
        currentValue: cloneValue(field.proposedValue),
        evidence: cloneValue(field.evidence ?? []),
        originalOrigin: field.origin,
      },
    ]),
  );
}

export function markAiFieldManual(
  fields: AiFieldStateMap,
  fieldKey: string,
  currentValue: unknown,
): AiFieldStateMap {
  const current = fields[fieldKey];
  if (!current) return fields;
  const matchesProposal = aiFieldValueEquals(
    current.proposedValue,
    currentValue,
  );
  return {
    ...fields,
    [fieldKey]: {
      ...current,
      currentValue: cloneValue(currentValue),
      origin: matchesProposal ? current.originalOrigin : 'HUMAN_EDIT',
    },
  };
}

export function restoreAiField(
  fields: AiFieldStateMap,
  fieldKey: string,
): undefined | { fields: AiFieldStateMap; value: unknown } {
  const current = fields[fieldKey];
  if (!current) return undefined;
  const value = cloneValue(current.proposedValue);
  return {
    fields: {
      ...fields,
      [fieldKey]: {
        ...current,
        currentValue: value,
        origin: current.originalOrigin,
      },
    },
    value,
  };
}

export function adoptAiAlternative(
  fields: AiFieldStateMap,
  fieldKey: string,
  alternativeId: string,
): undefined | { fields: AiFieldStateMap; value: unknown } {
  const current = fields[fieldKey];
  const alternative = current?.alternatives?.find(
    (item) => item.id === alternativeId,
  );
  if (!current || !alternative) return undefined;
  const value = cloneValue(alternative.value);
  return {
    fields: {
      ...fields,
      [fieldKey]: {
        ...current,
        currentValue: value,
        origin: 'HUMAN_EDIT',
      },
    },
    value,
  };
}

/**
 * Re-generation may refresh untouched fields, but it must never overwrite a
 * value that the user has already changed.
 */
export function mergeAiFieldStateMaps(
  current: AiFieldStateMap,
  incomingFields: readonly AiFieldMeta[],
): AiFieldStateMap {
  const incoming = createAiFieldStateMap(incomingFields);
  const result: AiFieldStateMap = { ...incoming };
  for (const [fieldKey, state] of Object.entries(current)) {
    if (state.origin !== 'HUMAN_EDIT') continue;
    const next = incoming[fieldKey];
    result[fieldKey] = {
      ...(next ?? state),
      currentValue: cloneValue(state.currentValue),
      origin: 'HUMAN_EDIT',
      originalOrigin: next?.originalOrigin ?? state.originalOrigin,
      proposedValue: cloneValue(next?.proposedValue ?? state.proposedValue),
    };
  }
  return result;
}

export function aiFieldStateSummary(fields: AiFieldStateMap) {
  const values = Object.values(fields);
  return {
    conflict: values.filter((item) => item.origin === 'CONFLICT').length,
    human: values.filter((item) => item.origin === 'HUMAN_EDIT').length,
    lowConfidence: values.filter(
      (item) => item.origin === 'AI_INFERRED' && item.confidence === 'LOW',
    ).length,
    missing: values.filter((item) => item.origin === 'MISSING').length,
    total: values.length,
  };
}
