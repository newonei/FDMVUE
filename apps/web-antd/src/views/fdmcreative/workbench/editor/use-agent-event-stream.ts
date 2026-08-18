import type { MaybeRefOrGetter, Ref, ShallowRef } from 'vue';

import type {
  AgentEventStreamHandle,
  AgentEventStreamOptions,
  AgentEventStreamState,
  CreativeAgentEvent,
  RawSseMessage,
} from './agent-event-stream';
import type { CreativeLongId } from './creative-long-id';

import { onScopeDispose, ref, shallowRef, toValue, watch } from 'vue';

import { isTenantEnable, useAppConfig } from '@vben/hooks';
import { useAccessStore } from '@vben/stores';

import { createAgentEventStream } from './agent-event-stream';
import { mergeSseAuthenticationHeaders } from './sse-auth-headers';

const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);

export interface AuthenticatedAgentEventStreamOptions extends Omit<
  AgentEventStreamOptions,
  'baseUrl' | 'headers'
> {
  baseUrl?: string;
  headers?: (() => HeadersInit | Promise<HeadersInit>) | HeadersInit;
}

export interface UseAgentEventStreamOptions extends Omit<
  AuthenticatedAgentEventStreamOptions,
  'agentRunId' | 'onError' | 'onEvent' | 'onStateChange'
> {
  agentRunId: MaybeRefOrGetter<CreativeLongId | null | number | undefined>;
  immediate?: boolean;
  onError?: AgentEventStreamOptions['onError'];
  onEvent?: AgentEventStreamOptions['onEvent'];
  onStateChange?: AgentEventStreamOptions['onStateChange'];
}

export interface UseAgentEventStreamReturn {
  cursor: Ref<number>;
  error: ShallowRef<Error | undefined>;
  lastEvent: ShallowRef<CreativeAgentEvent | undefined>;
  start: (agentRunId?: CreativeLongId | number) => void;
  state: Ref<'idle' | AgentEventStreamState>;
  stop: () => void;
}

/**
 * Authenticated, cursor-aware lifecycle wrapper for a persisted Agent Run. Header values are
 * resolved again on reconnect so a refreshed token or tenant switch cannot leak stale context.
 */
export function createAuthenticatedAgentEventStream(
  options: AuthenticatedAgentEventStreamOptions,
): AgentEventStreamHandle {
  const accessStore = useAccessStore();
  const configuredHeaders = options.headers;
  return createAgentEventStream({
    ...options,
    baseUrl: options.baseUrl ?? apiURL,
    headers: async () => {
      const additional =
        typeof configuredHeaders === 'function'
          ? await configuredHeaders()
          : configuredHeaders;
      return mergeSseAuthenticationHeaders(additional, {
        accessToken: accessStore.accessToken,
        tenantEnabled: isTenantEnable(),
        tenantId: accessStore.tenantId,
        visitTenantId: accessStore.visitTenantId,
      });
    },
  });
}

export function useAgentEventStream(
  options: UseAgentEventStreamOptions,
): UseAgentEventStreamReturn {
  const state = ref<'idle' | AgentEventStreamState>('idle');
  const cursor = ref(options.afterSequence ?? 0);
  const error = shallowRef<Error>();
  const lastEvent = shallowRef<CreativeAgentEvent>();
  let handle: AgentEventStreamHandle | undefined;
  let generation = 0;

  const stop = () => {
    generation += 1;
    handle?.close();
    handle = undefined;
    state.value = 'closed';
  };

  const start = (explicitAgentRunId?: CreativeLongId | number) => {
    const agentRunId = explicitAgentRunId ?? toValue(options.agentRunId);
    stop();
    if (agentRunId === null || agentRunId === undefined) {
      state.value = 'idle';
      return;
    }

    const currentGeneration = generation;
    error.value = undefined;
    cursor.value = options.afterSequence ?? 0;
    handle = createAuthenticatedAgentEventStream({
      ...options,
      afterSequence: cursor.value,
      agentRunId,
      onCursorChange(sequenceNo) {
        if (generation !== currentGeneration) return;
        cursor.value = sequenceNo;
        options.onCursorChange?.(sequenceNo);
      },
      onError(streamError, context) {
        if (generation !== currentGeneration) return;
        error.value = streamError;
        options.onError?.(streamError, context);
      },
      async onEvent(event: CreativeAgentEvent, message: RawSseMessage) {
        if (generation !== currentGeneration) return;
        lastEvent.value = event;
        await options.onEvent?.(event, message);
      },
      onStateChange(nextState) {
        if (generation !== currentGeneration) return;
        state.value = nextState;
        options.onStateChange?.(nextState);
      },
    });
    void handle.done.catch((streamError: unknown) => {
      if (generation !== currentGeneration) return;
      error.value =
        streamError instanceof Error
          ? streamError
          : new Error(String(streamError));
    });
  };

  const stopWatching = watch(
    () => toValue(options.agentRunId),
    (agentRunId) => start(agentRunId ?? undefined),
    { immediate: options.immediate !== false },
  );

  onScopeDispose(() => {
    stopWatching();
    stop();
  });

  return { cursor, error, lastEvent, start, state, stop };
}
