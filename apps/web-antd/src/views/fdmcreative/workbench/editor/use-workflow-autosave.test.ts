import type { FdmCreativeApi } from '#/api/fdmcreative';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { useWorkflowAutosave } from './use-workflow-autosave';
import { hashWorkflowDefinition } from './workflow-definition-hash';

function definition(label = 'first'): FdmCreativeApi.WorkflowDefinition {
  return {
    edges: [],
    nodes: [
      {
        config: { label },
        height: 100,
        id: 'image-input',
        name: '输入图片',
        ports: [],
        type: 'image-input',
        width: 160,
        x: 40,
        y: 20,
      },
    ],
    schemaVersion: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function draft(
  value: FdmCreativeApi.WorkflowDefinition,
  draftVersion: number,
): FdmCreativeApi.WorkflowDraft {
  return {
    definition: value,
    draftVersion,
    savedTime: Date.now(),
  };
}

function deferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('workflow autosave', () => {
  it('submits the normalized definition with its matching hash', async () => {
    const save = vi.fn((request) =>
      Promise.resolve(draft(request.definition, 2)),
    );
    const autosave = useWorkflowAutosave({
      enabled: () => false,
      getExpectedDraftVersion: () => 1,
      projectId: () => 7,
      save,
    });
    const source = definition('output-port');
    source.nodes[0]!.ports = [
      {
        direction: 'OUTPUT',
        id: 'asset',
        type: 'image-asset',
      },
    ];

    await autosave.markChanged(source);
    await expect(autosave.flush()).resolves.toBe(true);

    expect(save).toHaveBeenCalledTimes(1);
    const request = save.mock.calls[0]![0];
    expect(request.definition.nodes[0]?.ports).toEqual([
      {
        direction: 'OUTPUT',
        id: 'asset',
        required: false,
        type: 'image-asset',
      },
    ]);
    await expect(hashWorkflowDefinition(request.definition)).resolves.toBe(
      request.definitionHash,
    );
    autosave.destroy();
  });

  it('waits for an older capture when a newer hash finishes first', async () => {
    const firstDigest = deferred<ArrayBuffer>();
    vi.spyOn(globalThis.crypto.subtle, 'digest')
      .mockReturnValueOnce(firstDigest.promise)
      .mockResolvedValueOnce(new Uint8Array(32).buffer);
    const save = vi.fn((request) =>
      Promise.resolve(draft(request.definition, 2)),
    );
    const autosave = useWorkflowAutosave({
      enabled: () => false,
      getExpectedDraftVersion: () => 1,
      projectId: () => 7,
      save,
    });

    const firstCapture = autosave.markChanged(definition('first'));
    const secondCapture = autosave.markChanged(definition('second'));
    await secondCapture;
    const flushing = autosave.flush();

    await settlePromiseQueue();
    expect(save).not.toHaveBeenCalled();

    firstDigest.resolve(new Uint8Array(32).buffer);
    await firstCapture;
    await expect(flushing).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0].definition.nodes[0]?.config.label).toBe(
      'second',
    );
    expect(autosave.status.value).toBe('SAVED');
    autosave.destroy();
  });

  it('continues a flush when a new capture begins during an active save', async () => {
    const secondDigest = deferred<ArrayBuffer>();
    vi.spyOn(globalThis.crypto.subtle, 'digest')
      .mockResolvedValueOnce(new Uint8Array(32).buffer)
      .mockReturnValueOnce(secondDigest.promise);
    let version = 1;
    const firstSave = deferred<FdmCreativeApi.WorkflowDraft>();
    const firstSaveStarted = deferred<void>();
    const save = vi
      .fn()
      .mockImplementationOnce(() => {
        firstSaveStarted.resolve(undefined);
        return firstSave.promise;
      })
      .mockImplementationOnce((request) =>
        Promise.resolve(draft(request.definition, (version = 3))),
      );
    const autosave = useWorkflowAutosave({
      enabled: () => false,
      getExpectedDraftVersion: () => version,
      projectId: () => 7,
      save,
    });

    await autosave.markChanged(definition('first'));
    const flushing = autosave.flush();
    await firstSaveStarted.promise;
    const secondCapture = autosave.markChanged(definition('second'));
    let flushSettled = false;
    void flushing.then(() => {
      flushSettled = true;
    });

    firstSave.resolve(draft(definition('first'), (version = 2)));
    await vi.waitFor(() => expect(autosave.status.value).toBe('SAVED'));
    expect(flushSettled).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);

    secondDigest.resolve(new Uint8Array(32).buffer);
    await secondCapture;
    await expect(flushing).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]![0].definition.nodes[0]?.config.label).toBe(
      'second',
    );
    expect(autosave.status.value).toBe('SAVED');
    autosave.destroy();
  });

  it('debounces edits and serializes a newer snapshot after the first request completes', async () => {
    vi.useFakeTimers();
    let version = 1;
    const first = deferred<FdmCreativeApi.WorkflowDraft>();
    const save = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce((request) =>
        Promise.resolve(draft(request.definition, (version = 3))),
      );
    const autosave = useWorkflowAutosave({
      enabled: () => true,
      getExpectedDraftVersion: () => version,
      projectId: () => 7,
      save,
    });

    await autosave.markChanged(definition('first'));
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(1);

    await autosave.markChanged(definition('second'));
    first.resolve(draft(definition('first'), (version = 2)));
    await vi.advanceTimersByTimeAsync(800);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[0]![0].definition.nodes[0].config.label).toBe(
      'first',
    );
    expect(save.mock.calls[1]![0].definition.nodes[0].config.label).toBe(
      'second',
    );
    expect(save.mock.calls[1]![0].expectedDraftVersion).toBe(2);
    expect(save.mock.calls[0]![0].mutationId).not.toBe(
      save.mock.calls[1]![0].mutationId,
    );
    expect(autosave.status.value).toBe('SAVED');
    autosave.destroy();
  });

  it('retries a response-loss network error with the same mutation identifier', async () => {
    vi.useFakeTimers();
    let version = 1;
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('network interrupted'))
      .mockImplementationOnce((request) =>
        Promise.resolve(draft(request.definition, (version = 2))),
      );
    const autosave = useWorkflowAutosave({
      enabled: () => true,
      getExpectedDraftVersion: () => version,
      projectId: () => 7,
      save,
    });

    await autosave.markChanged(definition());
    await vi.advanceTimersByTimeAsync(800);
    expect(autosave.status.value).toBe('RETRYING');
    await vi.advanceTimersByTimeAsync(1000);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]![0].mutationId).toBe(
      save.mock.calls[0]![0].mutationId,
    );
    expect(autosave.status.value).toBe('SAVED');
    autosave.destroy();
  });

  it('does not retry a rejected workflow definition and retains its reason', async () => {
    vi.useFakeTimers();
    const rejection = {
      code: 'ERR_BAD_REQUEST',
      message: 'Request failed',
      response: {
        data: {
          code: 1_013_000_010,
          msg: '画布定义无效：definitionHash 与规范化后的画布定义不一致',
        },
      },
    };
    const save = vi.fn().mockRejectedValue(rejection);
    const autosave = useWorkflowAutosave({
      enabled: () => false,
      getExpectedDraftVersion: () => 1,
      projectId: () => 7,
      save,
    });

    await autosave.markChanged(definition());
    await expect(autosave.flush()).resolves.toBe(false);

    expect(save).toHaveBeenCalledTimes(1);
    expect(autosave.status.value).toBe('ERROR');
    expect(autosave.conflictError.value).toStrictEqual(rejection);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).toHaveBeenCalledTimes(1);
    autosave.destroy();
  });

  it('keeps the complete draft only in memory while offline and resumes after online', async () => {
    vi.useFakeTimers();
    const save = vi.fn((request) =>
      Promise.resolve(draft(request.definition, 2)),
    );
    const autosave = useWorkflowAutosave({
      enabled: () => true,
      getExpectedDraftVersion: () => 1,
      projectId: () => 7,
      save,
    });

    autosave.setOnlineForTesting(false);
    await autosave.markChanged(definition());
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
    expect(autosave.status.value).toBe('OFFLINE');

    autosave.setOnlineForTesting(true);
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(1);
    expect(autosave.status.value).toBe('SAVED');
    autosave.destroy();
  });

  it('guards an in-progress snapshot immediately and discards it after an authoritative baseline reset', async () => {
    vi.useFakeTimers();
    const inFlight = deferred<FdmCreativeApi.WorkflowDraft>();
    const save = vi.fn().mockReturnValue(inFlight.promise);
    const autosave = useWorkflowAutosave({
      enabled: () => true,
      getExpectedDraftVersion: () => 1,
      projectId: () => 7,
      save,
    });

    const capture = autosave.markChanged(definition('local-change'));
    expect(autosave.needsUnloadGuard.value).toBe(true);
    await capture;
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(1);

    const authoritative = draft(definition('server-agent-apply'), 2);
    autosave.resetBaseline(authoritative);
    expect(autosave.status.value).toBe('SAVED');
    expect(autosave.needsUnloadGuard.value).toBe(false);

    inFlight.resolve(authoritative);
    await Promise.resolve();
    expect(autosave.status.value).toBe('SAVED');
    expect(autosave.localSnapshot.value).toBeUndefined();
    autosave.destroy();
  });

  it('stops the queue on a CAS conflict instead of retrying or silently overwriting', async () => {
    vi.useFakeTimers();
    const onConflict = vi.fn();
    const save = vi.fn().mockRejectedValue({ code: 1_013_000_011 });
    const autosave = useWorkflowAutosave({
      enabled: () => true,
      getExpectedDraftVersion: () => 1,
      onConflict,
      projectId: () => 7,
      save,
    });

    await autosave.markChanged(definition('first'));
    await vi.advanceTimersByTimeAsync(800);
    await autosave.markChanged(definition('newer-local-copy'));
    await vi.advanceTimersByTimeAsync(10_000);

    expect(autosave.status.value).toBe('CONFLICT');
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(
      autosave.localSnapshot.value?.definition.nodes[0]?.config.label,
    ).toBe('newer-local-copy');
    autosave.destroy();
  });

  it('flushes before a workflow action and blocks it for a failed or conflicting save', async () => {
    vi.useFakeTimers();
    const successfulSave = vi.fn((request) =>
      Promise.resolve(draft(request.definition, 2)),
    );
    const autosave = useWorkflowAutosave({
      enabled: () => false,
      getExpectedDraftVersion: () => 1,
      projectId: () => 7,
      save: successfulSave,
    });
    await autosave.markChanged(definition());

    // The three mutation entry points (publish, run and Agent apply) share the
    // same explicit flush contract in the workbench.
    await expect(autosave.flush()).resolves.toBe(true);
    expect(successfulSave).toHaveBeenCalledTimes(1);
    autosave.destroy();

    const failedAutosave = useWorkflowAutosave({
      enabled: () => false,
      getExpectedDraftVersion: () => 1,
      projectId: () => 7,
      save: vi.fn().mockRejectedValue({ code: 1_013_000_011 }),
    });
    await failedAutosave.markChanged(definition());
    await expect(failedAutosave.flush()).resolves.toBe(false);
    expect(failedAutosave.status.value).toBe('CONFLICT');
    failedAutosave.destroy();
  });
});

async function settlePromiseQueue() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
