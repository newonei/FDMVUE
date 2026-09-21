import { createApp, h, nextTick, reactive, ref } from 'vue';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import WorkbenchTopbar from './WorkbenchTopbar.vue';

vi.mock('@vben/icons', () => ({
  IconifyIcon: { render: () => null },
}));
const access = vi.hoisted(() => ({ hasAccessByCodes: vi.fn() }));
vi.mock('@vben/access', () => ({ useAccess: () => access }));

const allMenuPermissions = [
  'fdmcreative:workflow:query',
  'fdmcreative:workflow:update',
  'fdmcreative:workflow:publish',
];
const grantedPermissions = ref<string[]>([]);
beforeEach(() => {
  grantedPermissions.value = [...allMenuPermissions];
  access.hasAccessByCodes.mockImplementation((codes: string[]) =>
    codes.some((code) => grantedPermissions.value.includes(code)),
  );
});

function mountTopbar(overrides: Record<string, unknown> = {}) {
  const props = reactive({
    busy: false,
    canEdit: true,
    canRedo: false,
    canRun: true,
    canRunSelected: false,
    canUndo: false,
    running: false,
    saveStatus: '已保存',
    selectedNodeName: '',
    selectedNodeType: '',
    zoomPercent: 100,
    ...overrides,
  });
  const container = document.createElement('div');
  document.body.append(container);
  const app = createApp({ render: () => h(WorkbenchTopbar, props) });
  app.directive('access', {});
  app.mount(container);
  return {
    container,
    props,
    unmount: () => {
      app.unmount();
      container.remove();
    },
  };
}

async function changeScope(container: HTMLElement, value: string) {
  const select = container.querySelector<HTMLSelectElement>('.run-scope')!;
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await nextTick();
}

async function openMoreMenu(container: HTMLElement) {
  container.querySelector<HTMLButtonElement>('.more-button')?.click();
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  return [
    ...document.body.querySelectorAll<HTMLElement>('.ant-dropdown-menu-item'),
  ];
}

describe('workbench topbar', () => {
  it.each([
    ['fdmcreative:workflow:query', '导出工作流', 'onExport'],
    ['fdmcreative:workflow:update', '导入工作流', 'onImport'],
    ['fdmcreative:workflow:publish', '发布版本', 'onPublish'],
  ])(
    'only exposes and invokes the menu action allowed by %s',
    async (permission, label, eventName) => {
      grantedPermissions.value = [permission];
      const events = {
        onExport: vi.fn(),
        onImport: vi.fn(),
        onPublish: vi.fn(),
      };
      const mounted = mountTopbar(events);
      await nextTick();
      const items = await openMoreMenu(mounted.container);
      expect(items.map((item) => item.textContent?.trim())).toEqual([label]);
      items[0]?.click();
      for (const [name, listener] of Object.entries(events)) {
        expect(listener).toHaveBeenCalledTimes(name === eventName ? 1 : 0);
      }
      mounted.unmount();
    },
  );

  it('hides the menu when permissions are absent and reacts to permission revocation', async () => {
    grantedPermissions.value = [];
    const mounted = mountTopbar();
    await nextTick();
    expect(mounted.container.querySelector('.more-button')).toBeNull();
    grantedPermissions.value = [...allMenuPermissions];
    await nextTick();
    expect(await openMoreMenu(mounted.container)).toHaveLength(3);
    grantedPermissions.value = ['fdmcreative:workflow:query'];
    await nextTick();
    const remaining = [
      ...document.body.querySelectorAll<HTMLElement>('.ant-dropdown-menu-item'),
    ];
    expect(remaining.map((item) => item.textContent?.trim())).toEqual([
      '导出工作流',
    ]);
    grantedPermissions.value = [];
    await nextTick();
    expect(mounted.container.querySelector('.more-button')).toBeNull();
    expect(document.body.querySelector('.ant-dropdown-menu-item')).toBeNull();
    mounted.unmount();
  });

  it('keeps project role and busy guards after a menu permission is granted', async () => {
    const onExport = vi.fn();
    const onImport = vi.fn();
    const onPublish = vi.fn();
    const mounted = mountTopbar({
      canEdit: false,
      exporting: true,
      onExport,
      onImport,
      onPublish,
    });
    await nextTick();
    const items = await openMoreMenu(mounted.container);
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.classList.contains('ant-dropdown-menu-item-disabled')).toBe(
        true,
      );
      item.click();
    }
    expect(onExport).not.toHaveBeenCalled();
    expect(onImport).not.toHaveBeenCalled();
    expect(onPublish).not.toHaveBeenCalled();
    mounted.unmount();
  });

  it('runs the chosen scope and keeps execution available to a readonly runner', async () => {
    const onRun = vi.fn();
    const mounted = mountTopbar({
      canEdit: false,
      canRunSelected: true,
      onRun,
      selectedNodeName: '商品主图',
    });
    await nextTick();
    const run =
      mounted.container.querySelector<HTMLButtonElement>('.run-button')!;
    expect(run.textContent).toContain('从头运行画布');
    expect(run.classList.contains('ant-btn-primary')).toBe(true);
    run.click();
    await changeScope(mounted.container, 'NODE');
    expect(run.disabled).toBe(false);
    expect(run.textContent).toContain('仅运行此节点');
    run.click();
    await changeScope(mounted.container, 'DOWNSTREAM');
    expect(run.textContent).toContain('运行所选及下游');
    run.click();
    expect(onRun.mock.calls).toEqual([['FULL'], ['NODE'], ['DOWNSTREAM']]);
    mounted.unmount();
  });

  it('blocks single-node scopes without a unique runnable selection and does not fall back to full', async () => {
    const onRun = vi.fn();
    const mounted = mountTopbar({
      canRunSelected: true,
      onRun,
      selectedNodeName: '商品主图',
    });
    await changeScope(mounted.container, 'NODE');
    mounted.props.selectedNodeName = '';
    await nextTick();
    const run = () =>
      mounted.container.querySelector<HTMLButtonElement>('.run-button')!;
    const scope =
      mounted.container.querySelector<HTMLSelectElement>('.run-scope')!;
    expect(scope.value).toBe('NODE');
    expect(
      scope.querySelector<HTMLOptionElement>('[value="NODE"]')?.disabled,
    ).toBe(true);
    expect(
      scope.querySelector<HTMLOptionElement>('[value="DOWNSTREAM"]')?.disabled,
    ).toBe(true);
    expect(run().disabled).toBe(true);
    run().click();
    expect(onRun).not.toHaveBeenCalled();
    await changeScope(mounted.container, 'FULL');
    expect(run().disabled).toBe(false);
    mounted.props.canRun = false;
    await nextTick();
    expect(run().disabled).toBe(true);
    mounted.props.selectedNodeName = '商品主图';
    mounted.props.canRunSelected = false;
    await changeScope(mounted.container, 'NODE');
    expect(run().disabled).toBe(true);
    mounted.unmount();
  });

  it('labels only a single content planner as a plan preview before applying it to the canvas', async () => {
    const onRun = vi.fn();
    const mounted = mountTopbar({
      canRunSelected: true,
      onRun,
      selectedNodeName: '新品内容规划',
      selectedNodeType: 'content-planner',
    });
    await changeScope(mounted.container, 'NODE');
    const run =
      mounted.container.querySelector<HTMLButtonElement>('.run-button')!;
    expect(run.textContent).toContain('预览方案');
    run.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 200));
    await nextTick();
    const tooltip = () =>
      document.body.querySelector('.ant-tooltip-inner')?.textContent;
    expect(tooltip()).toBe(
      '为「新品内容规划」生成方案预览，确认后再应用到画布',
    );
    run.click();
    expect(onRun.mock.calls).toEqual([['NODE']]);

    await changeScope(mounted.container, 'DOWNSTREAM');
    expect(run.textContent).toContain('运行所选及下游');
    expect(tooltip()).toContain('会实际执行生成任务');
    await changeScope(mounted.container, 'FULL');
    expect(run.textContent).toContain('从头运行画布');
    expect(tooltip()).toBe('从头执行整张画布，会重新执行全部节点的生成任务');

    mounted.props.selectedNodeType = 'image-generate';
    await changeScope(mounted.container, 'NODE');
    expect(run.textContent).toContain('仅运行此节点');
    expect(tooltip()).toContain('使用已连接上游的现有结果，不重新执行其他节点');
    mounted.unmount();
  });

  it.each(['FULL', 'NODE', 'DOWNSTREAM'])(
    'allows a second %s run after submission and execution complete without remounting',
    async (scope) => {
      const onRun = vi.fn();
      const mounted = mountTopbar({
        canRunSelected: true,
        onRun,
        selectedNodeName: '商品主图',
      });
      await changeScope(mounted.container, scope);
      const run = () =>
        mounted.container.querySelector<HTMLButtonElement>('.run-button')!;
      const scopeSelect = () =>
        mounted.container.querySelector<HTMLSelectElement>('.run-scope')!;
      run().click();
      mounted.props.busy = true;
      await nextTick();
      expect(run().textContent).toContain('提交中');
      expect(run().disabled).toBe(true);
      expect(scopeSelect().disabled).toBe(true);
      run().click();
      mounted.props.busy = false;
      mounted.props.running = true;
      await nextTick();
      expect(run().textContent).toContain('运行中');
      expect(run().disabled).toBe(true);
      run().click();
      mounted.props.running = false;
      await nextTick();
      expect(run().disabled).toBe(false);
      expect(scopeSelect().disabled).toBe(false);
      expect(scopeSelect().value).toBe(scope);
      run().click();
      expect(onRun.mock.calls).toEqual([[scope], [scope]]);
      mounted.unmount();
    },
  );

  it('disables execution during a run and only enables available undo/redo actions', async () => {
    const onRun = vi.fn();
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const mounted = mountTopbar({ onRedo, onRun, onUndo, running: true });
    await nextTick();
    const query = (label: string) =>
      mounted.container.querySelector<HTMLButtonElement>(
        `[aria-label="${label}"]`,
      )!;
    expect(
      mounted.container.querySelector<HTMLButtonElement>('.run-button')
        ?.disabled,
    ).toBe(true);
    expect(
      mounted.container.querySelector<HTMLSelectElement>('.run-scope')
        ?.disabled,
    ).toBe(true);
    expect(query('撤销').disabled).toBe(true);
    expect(query('重做').disabled).toBe(true);
    query('撤销').click();
    query('重做').click();
    expect(onUndo).not.toHaveBeenCalled();
    expect(onRedo).not.toHaveBeenCalled();
    mounted.props.canUndo = true;
    mounted.props.canRedo = true;
    await nextTick();
    query('撤销').click();
    query('重做').click();
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onRedo).toHaveBeenCalledOnce();
    mounted.props.canEdit = false;
    await nextTick();
    expect(query('撤销').disabled).toBe(true);
    expect(query('重做').disabled).toBe(true);
    expect(onRun).not.toHaveBeenCalled();
    mounted.unmount();
  });

  it('provides help and a secondary publish-version action in the more menu', async () => {
    const onHelp = vi.fn();
    const onPublish = vi.fn();
    const mounted = mountTopbar({ onHelp, onPublish });
    await nextTick();
    mounted.container.querySelector<HTMLButtonElement>('.help-button')?.click();
    expect(onHelp).toHaveBeenCalledOnce();
    mounted.container.querySelector<HTMLButtonElement>('.more-button')?.click();
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const publish = [
      ...document.body.querySelectorAll<HTMLElement>('.ant-dropdown-menu-item'),
    ].find((item) => item.textContent?.includes('发布版本'));
    expect(publish).toBeDefined();
    expect(document.body.textContent).not.toContain('发布任务');
    publish?.click();
    expect(onPublish).toHaveBeenCalledOnce();
    mounted.unmount();
  });

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
