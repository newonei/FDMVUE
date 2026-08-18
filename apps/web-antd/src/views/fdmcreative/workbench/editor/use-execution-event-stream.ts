import type { MaybeRefOrGetter, Ref, ShallowRef } from 'vue';

import type { CreativeLongId } from './creative-long-id';
import type {
  CreativeExecutionEvent,
  ExecutionEventStreamHandle,
  ExecutionEventStreamOptions,
  ExecutionEventStreamState,
  RawSseMessage,
} from './execution-event-stream';

import { onScopeDispose, ref, shallowRef, toValue, watch } from 'vue';

import { isTenantEnable, useAppConfig } from '@vben/hooks';
import { useAccessStore } from '@vben/stores';

import { createExecutionEventStream } from './execution-event-stream';
import { mergeSseAuthenticationHeaders } from './sse-auth-headers';

const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);

export interface AuthenticatedExecutionEventStreamOptions extends Omit<
  ExecutionEventStreamOptions,
  'baseUrl' | 'headers'
> {
  baseUrl?: string;
  headers?: (() => HeadersInit | Promise<HeadersInit>) | HeadersInit;
}

export interface UseExecutionEventStreamOptions extends Omit<
  AuthenticatedExecutionEventStreamOptions,
  'executionId' | 'onError' | 'onEvent' | 'onStateChange'
> {
  executionId: MaybeRefOrGetter<
    CreativeLongId | null | number | undefined
  >;
  immediate?: boolean;
  onError?: ExecutionEventStreamOptions['onError'];
  onEvent?: ExecutionEventStreamOptions['onEvent'];
  onStateChange?: ExecutionEventStreamOptions['onStateChange'];
}

export interface UseExecutionEventStreamReturn {
  cursor: Ref<number>;
  error: ShallowRef<Error | undefined>;
  lastEvent: ShallowRef<CreativeExecutionEvent | undefined>;
  start: (executionId?: CreativeLongId | number) => void;
  state: Ref<'idle' | ExecutionEventStreamState>;
  stop: () => void;
}

/**
 * Creates the application-aware transport. Header values are read again on
 * every reconnect so a refreshed access token or changed tenant is respected.
 */
export function createAuthenticatedExecutionEventStream(
  options: AuthenticatedExecutionEventStreamOptions,
): ExecutionEventStreamHandle {
  const accessStore = useAccessStore();
  const configuredHeaders = options.headers;
  return createExecutionEventStream({
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

/**
 * Vue lifecycle wrapper for a single execution subscription. Changing the
 * execution id closes the old request before opening the next one.
 */
export function useExecutionEventStream(
  options: UseExecutionEventStreamOptions,
): UseExecutionEventStreamReturn {
  const state = ref<'idle' | ExecutionEventStreamState>('idle');
  const cursor = ref(options.afterSequence ?? 0);
  const error = shallowRef<Error>();
  const lastEvent = shallowRef<CreativeExecutionEvent>();
  let handle: ExecutionEventStreamHandle | undefined;
  let generation = 0;

  const stop = () => {
    generation += 1;
    handle?.close();
    handle = undefined;
    state.value = 'closed';
  };

  const start = (explicitExecutionId?: CreativeLongId | number) => {
    const executionId = explicitExecutionId ?? toValue(options.executionId);
    stop();
    if (executionId === null || executionId === undefined) {
      state.value = 'idle';
      return;
    }

    const currentGeneration = generation;
    error.value = undefined;
    cursor.value = options.afterSequence ?? 0;
    handle = createAuthenticatedExecutionEventStream({
      ...options,
      afterSequence: cursor.value,
      executionId,
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
      async onEvent(event: CreativeExecutionEvent, message: RawSseMessage) {
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
    () => toValue(options.executionId),
    (executionId) => {
      start(executionId ?? undefined);
    },
    { immediate: options.immediate !== false },
  );

  onScopeDispose(() => {
    stopWatching();
    stop();
  });

  return { cursor, error, lastEvent, start, state, stop };
}
