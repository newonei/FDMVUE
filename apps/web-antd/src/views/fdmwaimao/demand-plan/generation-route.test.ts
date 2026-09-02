import { describe, expect, it } from 'vitest';

import {
  generationRunIdFromQuery,
  phaseAfterClosedGenerationRun,
  withGenerationRunIdQuery,
} from './generation-route';

describe('demand generation route recovery', () => {
  it('accepts a server run ID without storing business draft data', () => {
    expect(
      generationRunIdFromQuery({ generationRunId: '9223372036854775806' }),
    ).toBe('9223372036854775806');
    expect(
      generationRunIdFromQuery({ generationRunId: 'bad-id' }),
    ).toBeUndefined();
  });

  it('adds and clears only the recovery run identifier', () => {
    const source = { orderId: '9223372036854775807', tab: 'source' };
    expect(withGenerationRunIdQuery(source, '9223372036854775806')).toEqual({
      generationRunId: '9223372036854775806',
      orderId: '9223372036854775807',
      tab: 'source',
    });
    expect(
      withGenerationRunIdQuery(
        { ...source, generationRunId: '9223372036854775806' },
        undefined,
      ),
    ).toEqual(source);
  });

  it('keeps an editable draft visible after a MATERIALIZED or CANCELLED run closes', () => {
    expect(phaseAfterClosedGenerationRun(true, true)).toBe('READY');
    expect(phaseAfterClosedGenerationRun(true, false)).toBe('START');
    expect(phaseAfterClosedGenerationRun(false, true)).toBe('START');
  });
});
