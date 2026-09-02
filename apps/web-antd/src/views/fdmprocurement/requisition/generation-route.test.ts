import { describe, expect, it } from 'vitest';

import {
  fulfillmentPlanContextFromQuery,
  generationRunIdFromQuery,
  requisitionGenerationRouteQuery,
  withGenerationRunIdQuery,
} from './generation-route';

describe('requisition AI generation route recovery', () => {
  it('keeps Long source and run IDs as strings', () => {
    expect(
      fulfillmentPlanContextFromQuery({
        expectedPlanVersion: '7',
        fulfillmentPlanId: '9223372036854775806',
      }),
    ).toEqual({
      expectedPlanVersion: 7,
      fulfillmentPlanId: '9223372036854775806',
    });
    expect(
      generationRunIdFromQuery({ generationRunId: '9223372036854775805' }),
    ).toBe('9223372036854775805');
  });

  it('rejects malformed source context instead of guessing versions', () => {
    expect(
      fulfillmentPlanContextFromQuery({
        expectedPlanVersion: '-1',
        fulfillmentPlanId: '1',
      }),
    ).toBeUndefined();
    expect(
      generationRunIdFromQuery({ generationRunId: 'bad-id' }),
    ).toBeUndefined();
  });

  it('adds and clears only the server generation run ID', () => {
    const source = requisitionGenerationRouteQuery('9223372036854775806', 7);
    expect(withGenerationRunIdQuery(source, '9223372036854775805')).toEqual({
      ...source,
      generationRunId: '9223372036854775805',
    });
    expect(
      withGenerationRunIdQuery(
        { ...source, generationRunId: '9223372036854775805' },
        undefined,
      ),
    ).toEqual(source);
  });
});
