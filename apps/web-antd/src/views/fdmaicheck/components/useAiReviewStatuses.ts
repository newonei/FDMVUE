import type { FdmAiCheckApi } from '#/api/fdmaicheck';

import { computed, onScopeDispose, shallowRef, watch } from 'vue';

import { getAiReviewStatuses } from '#/api/fdmaicheck';

interface ReviewTarget {
  docId?: null | string;
  docType?: FdmAiCheckApi.DocType | null;
}

type DocumentType = FdmAiCheckApi.DocType;
type ReviewGroup = [DocumentType, string[]];
export type DisplayReviewStatus =
  | FdmAiCheckApi.ReviewStatus
  | { state: 'LOAD_ERROR' | 'UNAVAILABLE' };

const POLL_INTERVAL = 5000;
const MAX_POLLS = 60;
const BATCH_SIZE = 500;
const listeners = new Set<(docType: DocumentType, docId: string) => void>();

export function notifyAiReviewStatusChanged(
  docType: DocumentType,
  docId: string,
) {
  for (const listener of listeners) listener(docType, docId);
}

function key(docType: DocumentType, docId: string) {
  return `${docType}:${docId}`;
}

function groupTargets(targets: readonly ReviewTarget[]): ReviewGroup[] {
  const grouped = new Map<DocumentType, Set<string>>();
  for (const { docId, docType } of targets) {
    if (!docType || !docId) continue;
    const ids = grouped.get(docType) ?? new Set<string>();
    ids.add(docId);
    grouped.set(docType, ids);
  }
  return [...grouped.entries()].map(([docType, ids]) => [
    docType,
    [...ids].toSorted(),
  ]);
}

export function useAiReviewStatuses(targets: () => readonly ReviewTarget[]) {
  const groups = computed(() => groupTargets(targets()));
  const statuses = shallowRef(new Map<string, DisplayReviewStatus>());
  let sequence = 0;
  let polls = 0;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;

  async function load(selected: ReviewGroup[]) {
    const current = ++sequence;
    const next = new Map(statuses.value);
    const batches = selected.flatMap(([type, ids]) =>
      Array.from(
        { length: Math.ceil(ids.length / BATCH_SIZE) },
        (_, index) => ({
          type,
          ids: ids.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE),
        }),
      ),
    );
    await Promise.all(
      batches.map(async ({ ids, type }) => {
        try {
          const result = await getAiReviewStatuses(type, ids);
          for (const id of ids) {
            const status = Object.hasOwn(result, id) ? result[id] : undefined;
            next.set(key(type, id), status ?? { state: 'UNAVAILABLE' });
          }
        } catch {
          for (const id of ids)
            next.set(key(type, id), { state: 'LOAD_ERROR' });
        }
      }),
    );
    if (current !== sequence) return;
    statuses.value = next;
    const active: ReviewGroup[] = selected.map(([type, ids]) => [
      type,
      ids.filter((id) => {
        const state = next.get(key(type, id))?.state;
        return state === 'QUEUED' || state === 'RUNNING';
      }),
    ]);
    if (polls < MAX_POLLS && active.some(([, ids]) => ids.length)) {
      polls += 1;
      pollTimer = setTimeout(() => void load(active), POLL_INTERVAL);
    }
  }

  function refresh() {
    polls = 0;
    clearTimeout(pollTimer);
    if (refreshTimer !== undefined) return;
    // 请求成功后的显式刷新与同一轮列表数据变化合并。
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      void load(groups.value);
    }, 0);
  }

  function refreshDocument(docType: DocumentType, docId: string) {
    if (
      groups.value.some(
        ([type, ids]) => type === docType && ids.includes(docId),
      )
    )
      refresh();
  }

  watch(
    () => JSON.stringify(groups.value),
    () => {
      sequence += 1;
      statuses.value = new Map();
      refresh();
    },
    { immediate: true },
  );
  listeners.add(refreshDocument);
  onScopeDispose(() => {
    sequence += 1;
    clearTimeout(pollTimer);
    clearTimeout(refreshTimer);
    listeners.delete(refreshDocument);
  });

  return {
    refresh,
    statusFor: (docType?: DocumentType | null, docId?: null | string) =>
      docType && docId ? statuses.value.get(key(docType, docId)) : undefined,
  };
}
