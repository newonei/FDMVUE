import { createApp, nextTick } from 'vue';

import { describe, expect, it, vi } from 'vitest';

import WorkbenchTopbar from './WorkbenchTopbar.vue';

vi.mock('@vben/icons', () => ({
  IconifyIcon: { render: () => null },
}));

describe('workbench topbar', () => {
  it('exposes a labeled manual save action alongside the automatic save status', async () => {
    const onSave = vi.fn();
    const container = document.createElement('div');
    const app = createApp(WorkbenchTopbar, {
      canEdit: true,
      onSave,
      saveStatus: '保存失败，等待手动重试',
      zoomPercent: 100,
    });
    app.directive('access', {});
    app.mount(container);
    await nextTick();

    const saveButton =
      container.querySelector<HTMLButtonElement>('.save-draft-button');
    expect(saveButton?.getAttribute('aria-label')).toBe('保存草稿');
    expect(saveButton?.textContent).toContain('保存草稿');
    saveButton?.click();
    expect(onSave).toHaveBeenCalledOnce();
    expect(container.querySelector('.save-state')?.textContent).toContain(
      '保存失败，等待手动重试',
    );

    app.unmount();
  });

  it('does not expose or trigger a manual save while saving or readonly', async () => {
    const onSave = vi.fn();
    const savingContainer = document.createElement('div');
    const savingApp = createApp(WorkbenchTopbar, {
      canEdit: true,
      onSave,
      saveStatus: '正在保存…',
      saving: true,
      zoomPercent: 100,
    });
    savingApp.directive('access', {});
    savingApp.mount(savingContainer);
    await nextTick();

    const savingButton =
      savingContainer.querySelector<HTMLButtonElement>('.save-draft-button');
    expect(savingButton?.disabled).toBe(true);
    savingButton?.click();
    expect(onSave).not.toHaveBeenCalled();
    savingApp.unmount();

    const readonlyContainer = document.createElement('div');
    const readonlyApp = createApp(WorkbenchTopbar, {
      canEdit: false,
      onSave,
      saveStatus: '已保存',
      zoomPercent: 100,
    });
    readonlyApp.directive('access', {});
    readonlyApp.mount(readonlyContainer);
    await nextTick();

    expect(readonlyContainer.querySelector('.save-draft-button')).toBeNull();
    readonlyApp.unmount();
  });
});
