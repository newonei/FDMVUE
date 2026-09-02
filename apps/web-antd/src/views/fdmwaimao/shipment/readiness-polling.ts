const READINESS_POLL_SUCCESS_DELAY_MS = 1500;
const READINESS_POLL_RETRY_BASE_DELAY_MS = 2000;
const READINESS_POLL_RETRY_MAX_DELAY_MS = 30_000;
const READINESS_POLL_MAX_FAILURES = 5;

interface ReadinessJobIdentity {
  id: string;
  sourceId: string;
}

interface ReadinessPollIdentity {
  runId: string;
  session: number;
  sourceId: string;
}

interface ReadinessPollLiveContext {
  open: boolean;
  runId?: string;
  session: number;
  sourceId?: string;
}

interface ReadinessPollState {
  failureCount: number;
  nextDelayMs: null | number;
  paused: boolean;
}

type ReadinessPollEvent = 'CONTINUE' | 'FAILURE' | 'SUCCESS';

function transitionReadinessPoll(
  state: ReadinessPollState,
  event: ReadinessPollEvent,
): ReadinessPollState {
  if (event === 'SUCCESS') {
    return {
      failureCount: 0,
      nextDelayMs: READINESS_POLL_SUCCESS_DELAY_MS,
      paused: false,
    };
  }
  if (event === 'CONTINUE') {
    return { failureCount: 0, nextDelayMs: 0, paused: false };
  }

  const failureCount = Math.min(
    state.failureCount + 1,
    READINESS_POLL_MAX_FAILURES,
  );
  if (failureCount >= READINESS_POLL_MAX_FAILURES) {
    return { failureCount, nextDelayMs: null, paused: true };
  }
  return {
    failureCount,
    nextDelayMs: Math.min(
      READINESS_POLL_RETRY_BASE_DELAY_MS * 2 ** (failureCount - 1),
      READINESS_POLL_RETRY_MAX_DELAY_MS,
    ),
    paused: false,
  };
}

function isReadinessPollContextCurrent(
  identity: ReadinessPollIdentity,
  context: ReadinessPollLiveContext,
) {
  return (
    context.open &&
    context.session === identity.session &&
    context.runId === identity.runId &&
    context.sourceId === identity.sourceId
  );
}

function isExpectedReadinessJob(
  response: ReadinessJobIdentity,
  sourceId: string,
  runId?: string,
) {
  return response.sourceId === sourceId && (!runId || response.id === runId);
}

function canApplyReadinessPollResponse(
  identity: ReadinessPollIdentity,
  context: ReadinessPollLiveContext,
  response: ReadinessJobIdentity,
) {
  return (
    isReadinessPollContextCurrent(identity, context) &&
    isExpectedReadinessJob(response, identity.sourceId, identity.runId)
  );
}

export {
  canApplyReadinessPollResponse,
  isExpectedReadinessJob,
  isReadinessPollContextCurrent,
  READINESS_POLL_MAX_FAILURES,
  READINESS_POLL_SUCCESS_DELAY_MS,
  transitionReadinessPoll,
};
export type {
  ReadinessJobIdentity,
  ReadinessPollEvent,
  ReadinessPollIdentity,
  ReadinessPollLiveContext,
  ReadinessPollState,
};
