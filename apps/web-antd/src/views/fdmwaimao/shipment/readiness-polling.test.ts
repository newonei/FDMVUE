import type { ReadinessPollState } from './readiness-polling';

import { describe, expect, it } from 'vitest';

import {
  canApplyReadinessPollResponse,
  isExpectedReadinessJob,
  isReadinessPollContextCurrent,
  READINESS_POLL_MAX_FAILURES,
  READINESS_POLL_SUCCESS_DELAY_MS,
  transitionReadinessPoll,
} from './readiness-polling';

describe('shipment readiness polling state machine', () => {
  it('uses bounded exponential backoff and pauses on the fifth failure', () => {
    let state: ReadinessPollState = {
      failureCount: 0,
      nextDelayMs: READINESS_POLL_SUCCESS_DELAY_MS,
      paused: false,
    };
    const retryDelays: Array<null | number> = [];

    for (
      let attempt = 1;
      attempt <= READINESS_POLL_MAX_FAILURES;
      attempt += 1
    ) {
      state = transitionReadinessPoll(state, 'FAILURE');
      retryDelays.push(state.nextDelayMs);
      expect(state.failureCount).toBe(attempt);
    }

    expect(retryDelays).toEqual([2000, 4000, 8000, 16_000, null]);
    expect(state).toEqual({
      failureCount: READINESS_POLL_MAX_FAILURES,
      nextDelayMs: null,
      paused: true,
    });
  });

  it('resets after success and makes manual continuation immediate', () => {
    const failed = transitionReadinessPoll(
      { failureCount: 3, nextDelayMs: 8000, paused: false },
      'FAILURE',
    );

    expect(transitionReadinessPoll(failed, 'SUCCESS')).toEqual({
      failureCount: 0,
      nextDelayMs: READINESS_POLL_SUCCESS_DELAY_MS,
      paused: false,
    });
    expect(transitionReadinessPoll(failed, 'CONTINUE')).toEqual({
      failureCount: 0,
      nextDelayMs: 0,
      paused: false,
    });
  });

  it('requires the live session, run and source to remain exact', () => {
    const identity = { runId: '900', session: 7, sourceId: '500' };
    const current = {
      open: true,
      runId: '900',
      session: 7,
      sourceId: '500',
    };

    expect(isReadinessPollContextCurrent(identity, current)).toBe(true);
    expect(
      isReadinessPollContextCurrent(identity, { ...current, open: false }),
    ).toBe(false);
    expect(
      isReadinessPollContextCurrent(identity, { ...current, session: 8 }),
    ).toBe(false);
    expect(
      isReadinessPollContextCurrent(identity, { ...current, runId: '901' }),
    ).toBe(false);
    expect(
      isReadinessPollContextCurrent(identity, { ...current, sourceId: '501' }),
    ).toBe(false);
  });

  it('rejects stale or cross-source responses before they can replace page state', () => {
    const identity = { runId: '900', session: 7, sourceId: '500' };
    const current = {
      open: true,
      runId: '900',
      session: 7,
      sourceId: '500',
    };

    expect(
      canApplyReadinessPollResponse(identity, current, {
        id: '900',
        sourceId: '500',
      }),
    ).toBe(true);
    expect(
      canApplyReadinessPollResponse(identity, current, {
        id: '901',
        sourceId: '500',
      }),
    ).toBe(false);
    expect(
      canApplyReadinessPollResponse(identity, current, {
        id: '900',
        sourceId: '501',
      }),
    ).toBe(false);
    expect(
      canApplyReadinessPollResponse(
        identity,
        { ...current, session: 8 },
        { id: '900', sourceId: '500' },
      ),
    ).toBe(false);
    expect(isExpectedReadinessJob({ id: '900', sourceId: '500' }, '500')).toBe(
      true,
    );
    expect(
      isExpectedReadinessJob({ id: '900', sourceId: '500' }, '500', '901'),
    ).toBe(false);
  });
});
