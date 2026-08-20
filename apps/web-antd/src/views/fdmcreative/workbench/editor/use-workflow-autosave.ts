import type { ComputedRef } from 'vue';

import type { FdmCreativeApi } from '#/api/fdmcreative';

import { computed, ref } from 'vue';

import {
  hashWorkflowDefinition,
  normalizeWorkflowDefinitionForTransport,
} from './workflow-definition-hash';

export type WorkflowAutosaveStatus =
  | 'CONFLICT'
  | 'DIRTY'
  | 'ERROR'
  | 'IDLE'
  | 'OFFLINE'
  | 'RETRYING'
  | 'SAVED'
  | 'SAVING';

export interface WorkflowAutosaveSaveRequest {
  definition: FdmCreativeApi.WorkflowDefinition;
  definitionHash: string;
  expectedDraftVersion: number;
  mutationId: string;
}

export interface WorkflowAutosaveSnapshot extends WorkflowAutosaveSaveRequest {
  sequence: number;
}

export interface WorkflowAutosaveOptions {
  /** The staged P2 capability is off until its SQL release gate has passed. */
  enabled: () => boolean;
  getExpectedDraftVersion: () => number;
  onConflict?: (
    snapshot: WorkflowAutosaveSnapshot,
    error: unknown,
  ) => Promise<void> | void;
  onSaved?: (draft: FdmCreativeApi.WorkflowDraft) => void;
  projectId: () => number;
  save: (
    request: WorkflowAutosaveSaveRequest,
  ) => Promise<FdmCreativeApi.WorkflowDraft>;
}

const DEBOUNCE_MILLIS = 800;
const RETRY_DELAYS = [1000, 2500, 5000];
const WORKFLOW_VERSION_CONFLICT = 1_013_000_011;

/**
 * A memory-only autosave queue. It serializes writes, keeps a stable mutation
 * identifier while retrying a snapshot, and never uses localStorage for a
 * private workflow. The latest complete definition replaces an unsent pending
 * snapshot, while an already submitted request is allowed to finish so the
 * backend can safely deduplicate a response-loss retry.
 */
export function useWorkflowAutosave(options: WorkflowAutosaveOptions) {
  const status = ref<WorkflowAutosaveStatus>('IDLE');
  const lastSavedAt = ref<Date>();
  const online = ref(readOnlineState());
  const localSnapshot = ref<WorkflowAutosaveSnapshot>();
  const conflictError = ref<unknown>();
  const pendingCaptures = ref(0);

  let active: undefined | WorkflowAutosaveSnapshot;
  let pending: undefined | WorkflowAutosaveSnapshot;
  let failed: undefined | WorkflowAutosaveSnapshot;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let activeRequest: Promise<void> | undefined;
  let sequence = 0;
  let lifecycle = 0;
  let latestCapture: Promise<void> = Promise.resolve();

  // RETRYING deliberately stays clickable in the top bar: a user can choose
  // “save now” to cancel the backoff and force the same stable snapshot once.
  const isSaving = computed(() => status.value === 'SAVING');
  const hasUnpersistedSnapshot = computed(
    () =>
      pendingCaptures.value > 0 ||
      Boolean(active || pending || failed) ||
      status.value === 'CONFLICT' ||
      status.value === 'ERROR' ||
      status.value === 'OFFLINE',
  );
  const needsUnloadGuard: ComputedRef<boolean> = computed(
    () => hasUnpersistedSnapshot.value,
  );
  const statusLabel = computed(() => {
    switch (status.value) {
      case 'CONFLICT': {
        return '保存冲突，需要处理';
      }
      case 'DIRTY': {
        return options.enabled() ? '等待自动保存' : '有未保存修改';
      }
      case 'ERROR': {
        return '保存失败，等待手动重试';
      }
      case 'IDLE': {
        return '尚未保存';
      }
      case 'OFFLINE': {
        return '离线，恢复网络后保存';
      }
      case 'RETRYING': {
        return '正在重试保存…';
      }
      case 'SAVED': {
        return lastSavedAt.value
          ? `已保存 ${lastSavedAt.value.toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
            })}`
          : '已保存';
      }
      case 'SAVING': {
        return '正在保存…';
      }
      default: {
        return '保存状态未知';
      }
    }
  });

  function markChanged(definition: FdmCreativeApi.WorkflowDefinition) {
    const captureSequence = ++sequence;
    const captureLifecycle = lifecycle;
    // Hashing uses Web Crypto and is asynchronous. Mark the page dirty before
    // awaiting it so an immediate route change/close cannot slip through the
    // unload guard in the tiny interval before a complete snapshot exists.
    if (status.value !== 'CONFLICT') {
      status.value = online.value ? 'DIRTY' : 'OFFLINE';
    }
    pendingCaptures.value += 1;
    const capture = captureSnapshot(
      definition,
      captureSequence,
      captureLifecycle,
    ).finally(() => {
      // resetBaseline/destroy advances lifecycle and explicitly invalidates
      // older captures, so their late completion must not revive a leave guard.
      if (captureLifecycle === lifecycle) {
        pendingCaptures.value = Math.max(0, pendingCaptures.value - 1);
      }
    });
    latestCapture = capture;
    return capture;
  }

  async function captureSnapshot(
    definition: FdmCreativeApi.WorkflowDefinition,
    captureSequence: number,
    captureLifecycle: number,
  ) {
    let normalized: FdmCreativeApi.WorkflowDefinition;
    let definitionHash: string;
    try {
      normalized = normalizeWorkflowDefinitionForTransport(definition);
      definitionHash = await hashWorkflowDefinition(normalized);
    } catch (error) {
      if (captureLifecycle !== lifecycle || captureSequence !== sequence)
        return;
      failed = undefined;
      localSnapshot.value = undefined;
      status.value = 'ERROR';
      conflictError.value = error;
      return;
    }
    if (captureLifecycle !== lifecycle || captureSequence !== sequence) return;

    const snapshot: WorkflowAutosaveSnapshot = {
      definition: normalized,
      definitionHash,
      expectedDraftVersion: options.getExpectedDraftVersion(),
      mutationId: createMutationId(options.projectId()),
      sequence: captureSequence,
    };
    localSnapshot.value = snapshot;
    failed = undefined;
    if (status.value === 'CONFLICT') {
      // A conflict is explicit user work: retain the newest local state, but do
      // not silently overwrite the server after a later drag or text edit.
      pending = snapshot;
      return;
    }
    pending = snapshot;
    if (!online.value) {
      status.value = 'OFFLINE';
      return;
    }
    status.value = 'DIRTY';
    if (options.enabled()) scheduleDebouncedSave();
  }

  async function flush() {
    await latestCapture;
    if (status.value === 'CONFLICT' || status.value === 'OFFLINE') return false;
    if (status.value === 'ERROR' && !retryFailedSnapshot()) return false;
    clearTimer('debounce');
    clearTimer('retry');
    while (active || pending) {
      await submitNext(false);
      if (flushCannotContinue(status.value)) {
        return false;
      }
      clearTimer('debounce');
    }
    return !hasUnpersistedSnapshot.value;
  }

  function retryFailedSnapshot() {
    if (!failed) return false;
    if (!online.value) {
      status.value = 'OFFLINE';
      return false;
    }
    active = failed;
    failed = undefined;
    conflictError.value = undefined;
    return true;
  }

  function resetBaseline(draft?: FdmCreativeApi.WorkflowDraft) {
    lifecycle += 1;
    clearTimer('debounce');
    clearTimer('retry');
    active = undefined;
    pending = undefined;
    failed = undefined;
    pendingCaptures.value = 0;
    localSnapshot.value = undefined;
    conflictError.value = undefined;
    lastSavedAt.value = parseSavedTime(draft?.savedTime);
    status.value = draft ? 'SAVED' : 'IDLE';
    latestCapture = Promise.resolve();
  }

  function keepLocalForLater() {
    clearTimer('debounce');
    clearTimer('retry');
    status.value = 'CONFLICT';
  }

  async function enterExternalConflict(
    snapshot: WorkflowAutosaveSnapshot,
    error: unknown,
  ) {
    clearTimer('debounce');
    clearTimer('retry');
    active = undefined;
    pending = snapshot;
    failed = undefined;
    localSnapshot.value = snapshot;
    conflictError.value = error;
    status.value = 'CONFLICT';
    try {
      await options.onConflict?.(snapshot, error);
    } catch {
      // The save queue must remain stopped even if refreshing display metadata
      // fails (for example, the user temporarily lost read access).
    }
  }

  function discardLocalAndLoadServer(draft: FdmCreativeApi.WorkflowDraft) {
    resetBaseline(draft);
  }

  function setOnlineForTesting(nextOnline: boolean) {
    setOnline(nextOnline);
  }

  function destroy() {
    lifecycle += 1;
    clearTimer('debounce');
    clearTimer('retry');
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    }
  }

  function scheduleDebouncedSave() {
    if (
      !pending ||
      active ||
      !online.value ||
      !options.enabled() ||
      status.value === 'CONFLICT'
    ) {
      return;
    }
    clearTimer('debounce');
    debounceTimer = setTimeout(() => void submitNext(false), DEBOUNCE_MILLIS);
  }

  function submitNext(isRetry: boolean): Promise<void> {
    if (activeRequest) return activeRequest;
    const request = performSubmitNext(isRetry);
    activeRequest = request;
    void request.finally(() => {
      if (activeRequest === request) activeRequest = undefined;
    });
    return request;
  }

  async function performSubmitNext(isRetry: boolean): Promise<void> {
    clearTimer('debounce');
    if (status.value === 'CONFLICT') return;
    if (!online.value) {
      if (active || pending || failed) status.value = 'OFFLINE';
      return;
    }
    if (!active) {
      active = pending;
      pending = undefined;
    }
    const snapshot = active;
    if (!snapshot) return;
    const requestLifecycle = lifecycle;
    // A queued snapshot may wait behind an earlier write, so it captures the
    // current baseline only when first submitted. A retry must keep both that
    // version and its mutation ID unchanged for response-loss idempotency.
    if (!hasBeenSubmitted(snapshot)) {
      snapshot.expectedDraftVersion = options.getExpectedDraftVersion();
      markSubmitted(snapshot);
    }
    status.value = isRetry ? 'RETRYING' : 'SAVING';

    try {
      const draft = await options.save({
        definition: snapshot.definition,
        definitionHash: snapshot.definitionHash,
        expectedDraftVersion: snapshot.expectedDraftVersion,
        mutationId: snapshot.mutationId,
      });
      if (requestLifecycle !== lifecycle || active !== snapshot) return;
      active = undefined;
      failed = undefined;
      lastSavedAt.value = parseSavedTime(draft.savedTime) ?? new Date();
      options.onSaved?.(draft);
      if (pending) {
        status.value = 'DIRTY';
        if (options.enabled()) scheduleDebouncedSave();
      } else {
        localSnapshot.value = undefined;
        status.value = 'SAVED';
      }
    } catch (error) {
      if (requestLifecycle !== lifecycle || active !== snapshot) return;
      if (isWorkflowVersionConflict(error)) {
        const newestLocalSnapshot = pending ?? snapshot;
        localSnapshot.value = newestLocalSnapshot;
        active = undefined;
        status.value = 'CONFLICT';
        conflictError.value = error;
        clearTimer('retry');
        await options.onConflict?.(newestLocalSnapshot, error);
        return;
      }
      if (
        isRetryableNetworkError(error) &&
        retryCount(snapshot) < RETRY_DELAYS.length
      ) {
        if (!online.value) {
          status.value = 'OFFLINE';
          return;
        }
        const delay = RETRY_DELAYS[retryCount(snapshot)];
        setRetryCount(snapshot, retryCount(snapshot) + 1);
        status.value = 'RETRYING';
        clearTimer('retry');
        retryTimer = setTimeout(() => void submitNext(true), delay);
        return;
      }
      // Keep the complete snapshot in memory. A manual click is deliberate and
      // may retry it; normal editing will create a new full pending snapshot.
      active = undefined;
      failed = snapshot;
      localSnapshot.value = pending ?? snapshot;
      conflictError.value = error;
      status.value = 'ERROR';
    }
  }

  function setOnline(nextOnline: boolean) {
    online.value = nextOnline;
    if (!nextOnline) {
      clearTimer('debounce');
      clearTimer('retry');
      if (active || pending || failed) status.value = 'OFFLINE';
      return;
    }
    if (status.value !== 'OFFLINE') return;
    if (failed) {
      status.value = 'ERROR';
      return;
    }
    status.value = pending || active ? 'DIRTY' : 'SAVED';
    if (active) {
      // A request cannot be trusted while offline. The same mutation ID is
      // retried so a server-side commit with a lost response remains idempotent.
      void submitNext(true);
    } else if (pending && options.enabled()) {
      scheduleDebouncedSave();
    }
  }

  function clearTimer(kind: 'debounce' | 'retry') {
    if (kind === 'debounce' && debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = undefined;
    }
    if (kind === 'retry' && retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = undefined;
    }
  }

  function handleOnline() {
    setOnline(true);
  }

  function handleOffline() {
    setOnline(false);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  return {
    conflictError,
    destroy,
    discardLocalAndLoadServer,
    enterExternalConflict,
    flush,
    hasUnpersistedSnapshot,
    isSaving,
    keepLocalForLater,
    lastSavedAt,
    localSnapshot,
    markChanged,
    needsUnloadGuard,
    online,
    resetBaseline,
    setOnlineForTesting,
    status,
    statusLabel,
  };
}

function createMutationId(projectId: number) {
  const random =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `autosave:${projectId}:${random}`;
}

function parseSavedTime(value: unknown) {
  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? undefined : parsed;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? undefined : parsed;
  }
  return undefined;
}

function readOnlineState() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function retryCount(snapshot: WorkflowAutosaveSnapshot) {
  return (
    (snapshot as WorkflowAutosaveSnapshot & { retryCount?: number })
      .retryCount ?? 0
  );
}

function setRetryCount(snapshot: WorkflowAutosaveSnapshot, value: number) {
  (snapshot as WorkflowAutosaveSnapshot & { retryCount?: number }).retryCount =
    value;
}

function hasBeenSubmitted(snapshot: WorkflowAutosaveSnapshot) {
  return (
    (snapshot as WorkflowAutosaveSnapshot & { submitted?: boolean })
      .submitted === true
  );
}

function markSubmitted(snapshot: WorkflowAutosaveSnapshot) {
  (snapshot as WorkflowAutosaveSnapshot & { submitted?: boolean }).submitted =
    true;
}

export function isWorkflowVersionConflict(error: unknown) {
  return readErrorCode(error) === WORKFLOW_VERSION_CONFLICT;
}

function isRetryableNetworkError(error: unknown) {
  // RequestClient surfaces business failures as { code, msg } without an HTTP
  // status. They must fail immediately rather than masquerading as a transient
  // network loss and delaying the actionable save feedback.
  if (readErrorCode(error) !== undefined) return false;
  const status = readHttpStatus(error);
  if (status === undefined || status === 0) return true;
  return status === 408 || status === 502 || status === 503 || status === 504;
}

function readErrorCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as {
    code?: unknown;
    data?: { code?: unknown };
    response?: { data?: { code?: unknown } };
  };
  for (const raw of [
    candidate.code,
    candidate.data?.code,
    candidate.response?.data?.code,
  ]) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return numeric;
  }
  return undefined;
}

function readHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as {
    response?: { status?: unknown };
    status?: unknown;
  };
  const raw = candidate.response?.status ?? candidate.status;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function flushCannotContinue(status: WorkflowAutosaveStatus) {
  return (
    status === 'CONFLICT' ||
    status === 'ERROR' ||
    status === 'OFFLINE' ||
    status === 'RETRYING'
  );
}
