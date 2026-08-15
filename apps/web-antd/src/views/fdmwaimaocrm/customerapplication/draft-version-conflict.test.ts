import type { DraftVersionConflictConfirmConfig } from './draft-version-conflict';

import { describe, expect, it, vi } from 'vitest';

import { confirmDraftVersionConflict } from './draft-version-conflict';

describe('customer application draft version conflict', () => {
  it('keeps local input by default and does not load on cancel', async () => {
    let config: DraftVersionConflictConfirmConfig | undefined;
    const loadLatest = vi.fn();
    const pending = confirmDraftVersionConflict({
      confirm: (value) => {
        config = value;
      },
      loadLatest,
      onLoadError: vi.fn(),
      onLoaded: vi.fn(),
    });

    expect(config?.autoFocusButton).toBe('cancel');
    expect(config?.okType).toBe('danger');
    expect(loadLatest).not.toHaveBeenCalled();

    config?.onCancel();
    await pending;
    expect(loadLatest).not.toHaveBeenCalled();
  });

  it('loads and reports the latest draft only after explicit confirmation', async () => {
    let config: DraftVersionConflictConfirmConfig | undefined;
    const onLoaded = vi.fn();
    const pending = confirmDraftVersionConflict({
      confirm: (value) => {
        config = value;
      },
      loadLatest: vi.fn().mockResolvedValue(true),
      onLoadError: vi.fn(),
      onLoaded,
    });

    await config?.onOk();
    await pending;
    expect(onLoaded).toHaveBeenCalledOnce();
  });

  it('keeps the conflict flow recoverable when loading the latest draft fails', async () => {
    let config: DraftVersionConflictConfirmConfig | undefined;
    const onLoadError = vi.fn();
    const pending = confirmDraftVersionConflict({
      confirm: (value) => {
        config = value;
      },
      loadLatest: vi.fn().mockRejectedValue(new Error('network failure')),
      onLoadError,
      onLoaded: vi.fn(),
    });

    await config?.onOk();
    await pending;
    expect(onLoadError).toHaveBeenCalledOnce();
  });
});
