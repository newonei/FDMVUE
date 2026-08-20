import type { MaybeRefOrGetter, Ref, ShallowRef } from 'vue';

import type { CreativeLongId } from '../workbench/editor/creative-long-id';
import type {
  RawSseMessage,
  SseEventStreamState,
} from '../workbench/editor/sse-event-stream';
import type {
  DramaScriptEvent,
  DramaScriptEventStreamOptions,
} from './drama-script-event-stream';

import { onScopeDispose, ref, shallowRef, toValue, watch } from 'vue';

import { isTenantEnable, useAppConfig } from '@vben/hooks';
import { useAccessStore } from '@vben/stores';

import { mergeSseAuthenticationHeaders } from '../workbench/editor/sse-auth-headers';
import { createDramaScriptEventStream } from './drama-script-event-stream';

const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);

export interface AuthenticatedDramaScriptEventStreamOptions extends Omit<
  DramaScriptEventStreamOptions,
  'baseUrl' | 'headers'
> {
  baseUrl?: string;
  headers?: (() => HeadersInit | Promise<HeadersInit>) | HeadersInit;
}

export interface UseDramaScriptEventStreamOptions extends Omit<
  AuthenticatedDramaScriptEventStreamOptions,
  'onError' | 'onEvent' | 'onStateChange' | 'projectId' | 'scriptRevisionId'
> {
  immediate?: boolean;
  onError?: DramaScriptEventStreamOptions['onError'];
  onEvent?: DramaScriptEventStreamOptions['onEvent'];
  onStateChange?: DramaScriptEventStreamOptions['onStateChange'];
  projectId: MaybeRefOrGetter<CreativeLongId | null | number | undefined>;
  scriptRevisionId: MaybeRefOrGetter<
    CreativeLongId | null | number | undefined
  >;
}

export interface UseDramaScriptEventStreamReturn {
  cursor: Ref<number>;
  error: ShallowRef<Error | undefined>;
  lastEvent: ShallowRef<DramaScriptEvent | undefined>;
  start: (scriptRevisionId?: CreativeLongId | number) => void;
  state: Ref<'idle' | SseEventStreamState>;
  stop: () => void;
}

export function createAuthenticatedDramaScriptEventStream(
  options: AuthenticatedDramaScriptEventStreamOptions,
) {
  const accessStore = useAccessStore();
  const configuredHeaders = options.headers;
  return createDramaScriptEventStream({
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

export function useDramaScriptEventStream(
  options: UseDramaScriptEventStreamOptions,
): UseDramaScriptEventStreamReturn {
  const state = ref<'idle' | SseEventStreamState>('idle');
  const cursor = ref(options.afterSequence ?? 0);
  const error = shallowRef<Error>();
  const lastEvent = shallowRef<DramaScriptEvent>();
  let handle:
    | ReturnType<typeof createAuthenticatedDramaScriptEventStream>
    | undefined;
  let generation = 0;

  const stop = () => {
    generation += 1;
    handle?.close();
    handle = undefined;
    state.value = 'closed';
  };

  const start = (explicitScriptRevisionId?: CreativeLongId | number) => {
    const projectId = toValue(options.projectId);
    const scriptRevisionId =
      explicitScriptRevisionId ?? toValue(options.scriptRevisionId);
    stop();
    if (
      projectId === null ||
      projectId === undefined ||
      scriptRevisionId === null ||
      scriptRevisionId === undefined
    ) {
      state.value = 'idle';
      return;
    }
    const currentGeneration = generation;
    error.value = undefined;
    cursor.value = options.afterSequence ?? 0;
    handle = createAuthenticatedDramaScriptEventStream({
      ...options,
      afterSequence: cursor.value,
      projectId,
      scriptRevisionId,
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
      async onEvent(event: DramaScriptEvent, message: RawSseMessage) {
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
    () => [toValue(options.projectId), toValue(options.scriptRevisionId)],
    () => start(),
    { immediate: options.immediate !== false },
  );

  onScopeDispose(() => {
    stopWatching();
    stop();
  });

  return { cursor, error, lastEvent, start, state, stop };
}
