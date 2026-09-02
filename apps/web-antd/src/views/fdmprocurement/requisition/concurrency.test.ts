import { describe, expect, it } from 'vitest';

import {
  isProcurementVersionConflict,
  PROCUREMENT_CONCURRENT_MODIFICATION,
  shouldClearProductBindingCommandKey,
} from './concurrency';

describe('requisition optimistic concurrency guard', () => {
  it('reads numeric and serialized business codes from request errors', () => {
    expect(
      isProcurementVersionConflict({
        code: PROCUREMENT_CONCURRENT_MODIFICATION,
      }),
    ).toBe(true);
    expect(
      isProcurementVersionConflict({
        response: {
          data: { code: String(PROCUREMENT_CONCURRENT_MODIFICATION) },
        },
      }),
    ).toBe(true);
    expect(isProcurementVersionConflict({ code: 500 })).toBe(false);
  });

  it('clears stale binding keys only for permanent CAS conflicts', () => {
    expect(
      shouldClearProductBindingCommandKey({
        response: {
          data: { code: String(PROCUREMENT_CONCURRENT_MODIFICATION) },
        },
      }),
    ).toBe(true);
    expect(
      shouldClearProductBindingCommandKey(new Error('network timeout')),
    ).toBe(false);
  });
});
