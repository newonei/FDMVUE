import { effectScope, nextTick, ref } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { getAiReviewStatuses } from '#/api/fdmaicheck';

import {
  notifyAiReviewStatusChanged,
  useAiReviewStatuses,
} from './useAiReviewStatuses';

vi.mock('#/api/fdmaicheck', () => ({ getAiReviewStatuses: vi.fn() }));

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe('useAiReviewStatuses', () => {
  it('refreshes a payment after recheck and polls it until the verdicts arrive', async () => {
    vi.useFakeTimers();
    const request = vi.mocked(getAiReviewStatuses);
    request.mockResolvedValueOnce({ id: { state: 'NOT_REVIEWED' } });
    request.mockResolvedValueOnce({ id: { state: 'RUNNING' } });
    request.mockResolvedValueOnce({
      id: { state: 'COMPLETED', counts: { PASS: 2, UNKNOWN: 2 } },
    });
    const scope = effectScope();
    const list = scope.run(() =>
      useAiReviewStatuses(() => [{ docId: 'id', docType: 'PAYMENT' }]),
    )!;
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(list.statusFor('PAYMENT', 'id')?.state).toBe('NOT_REVIEWED');

      notifyAiReviewStatusChanged('PAYMENT', 'id');
      await vi.advanceTimersByTimeAsync(0);
      expect(list.statusFor('PAYMENT', 'id')?.state).toBe('RUNNING');

      await vi.advanceTimersByTimeAsync(5000);
      expect(list.statusFor('PAYMENT', 'id')).toEqual({
        state: 'COMPLETED',
        counts: { PASS: 2, UNKNOWN: 2 },
      });
      expect(request.mock.calls).toEqual([
        ['PAYMENT', ['id']],
        ['PAYMENT', ['id']],
        ['PAYMENT', ['id']],
      ]);
    } finally {
      scope.stop();
    }
  });

  it('distinguishes inaccessible rows from a failed batch after changing pages', async () => {
    vi.useFakeTimers();
    const request = vi.mocked(getAiReviewStatuses);
    request.mockResolvedValueOnce({});
    request.mockRejectedValueOnce(new Error('network'));
    const id = ref('first');
    const scope = effectScope();
    const list = scope.run(() =>
      useAiReviewStatuses(() => [{ docId: id.value, docType: 'PAYMENT' }]),
    )!;
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(list.statusFor('PAYMENT', 'first')?.state).toBe('UNAVAILABLE');

      id.value = 'second';
      await nextTick();
      await vi.advanceTimersByTimeAsync(0);
      expect(list.statusFor('PAYMENT', 'first')).toBeUndefined();
      expect(list.statusFor('PAYMENT', 'second')?.state).toBe('LOAD_ERROR');
    } finally {
      scope.stop();
    }
  });
});
