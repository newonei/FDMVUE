import { describe, expect, it } from 'vitest';

import {
  sourcingGenerationContextFromQuery,
  sourcingGenerationRouteQuery,
  sourcingGenerationRunIdFromQuery,
  withSourcingGenerationRunIdQuery,
} from './generation-route';

describe('sourcing AI generation hidden route', () => {
  it('keeps requisition and generation Long IDs as strings', () => {
    expect(
      sourcingGenerationContextFromQuery({
        expectedRequisitionVersion: '7',
        requisitionId: '9223372036854775806',
      }),
    ).toEqual({
      expectedRequisitionVersion: 7,
      requisitionId: '9223372036854775806',
    });
    expect(
      sourcingGenerationRunIdFromQuery({
        generationRunId: '9223372036854775805',
      }),
    ).toBe('9223372036854775805');
  });

  it('rejects malformed IDs and versions rather than guessing', () => {
    expect(
      sourcingGenerationContextFromQuery({
        expectedRequisitionVersion: '-1',
        requisitionId: '1',
      }),
    ).toBeUndefined();
    expect(
      sourcingGenerationContextFromQuery({
        expectedRequisitionVersion: '2',
        requisitionId: 'unsafe-id',
      }),
    ).toBeUndefined();
    expect(
      sourcingGenerationRunIdFromQuery({ generationRunId: '0' }),
    ).toBeUndefined();
  });

  it('adds and clears only the server run ID', () => {
    const source = sourcingGenerationRouteQuery('101', 7);
    expect(withSourcingGenerationRunIdQuery(source, '701')).toEqual({
      ...source,
      generationRunId: '701',
    });
    expect(
      withSourcingGenerationRunIdQuery(
        { ...source, generationRunId: '701' },
        undefined,
      ),
    ).toEqual(source);
  });
});
