import { createApp, h, KeepAlive, nextTick, ref } from 'vue';

import {
  initStores,
  useAccessStore,
  useTabbarStore,
  useUserStore,
} from '@vben/stores';

import { disposePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePerformanceManagementStore } from '#/store/performance-management';

import Batches from './index.vue';

const api = vi.hoisted(() => ({
  cancelInstance: vi.fn(),
  deleteInstance: vi.fn(),
  exportInstanceExcel: vi.fn(),
  getInstancePage: vi.fn(),
  getPerformanceAccess: vi.fn(),
  remindInstances: vi.fn(),
}));
const getSimpleDeptList = vi.hoisted(() => vi.fn());
const download = vi.hoisted(() => vi.fn());

vi.mock('#/api/fdmperformance', () => api);
vi.mock('#/api/system/dept', () => ({ getSimpleDeptList }));
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@vben/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vben/utils')>()),
  downloadFileFromBlobPart: download,
}));
vi.mock('./components/HrReviewQueue.vue', () => ({
  default: { render: () => null },
}));
vi.mock('../shared/PerformanceShell.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      setup(_props, { slots }) {
        return () => h('main', slots.default?.());
      },
    }),
  };
});
vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');
  const content = defineComponent({
    setup(_props, { slots }) {
      return () => h('div', slots.default?.());
    },
  });
  const input = defineComponent({
    props: ['value', 'placeholder'],
    emits: ['update:value'],
    setup(props, { emit }) {
      return () =>
        h('input', {
          'aria-label': props.placeholder,
          value: props.value ?? '',
          onInput: (event: Event) =>
            emit('update:value', (event.target as HTMLInputElement).value),
        });
    },
  });
  return {
    Alert: { render: () => null },
    Button: defineComponent({
      setup(_props, { attrs, slots }) {
        return () => h('button', attrs, slots.default?.());
      },
    }),
    DatePicker: input,
    Empty: { render: () => null },
    Input: input,
    Modal: { render: () => null },
    Popconfirm: content,
    Select: { render: () => null },
    Space: content,
    Table: defineComponent({
      props: ['pagination', 'rowSelection', 'dataSource'],
      emits: ['change'],
      setup(props, { emit, slots }) {
        return () =>
          h('section', { 'aria-label': '考核列表' }, [
            h('output', { 'aria-label': '当前页码' }, props.pagination.current),
            h(
              'output',
              { 'aria-label': '当前条数' },
              props.pagination.pageSize,
            ),
            h(
              'button',
              {
                onClick: () =>
                  emit('change', {
                    current: 3,
                    pageSize: props.pagination.pageSize,
                  }),
              },
              '翻到第三页',
            ),
            h(
              'button',
              { onClick: () => emit('change', { current: 3, pageSize: 20 }) },
              '每页20条',
            ),
            h(
              'button',
              { onClick: () => props.rowSelection.onChange([1]) },
              '勾选第一条',
            ),
            ...props.dataSource.flatMap((record: { id: number }) =>
              slots.bodyCell?.({ column: { dataIndex: 'action' }, record }),
            ),
          ]);
      },
    }),
    Tabs: Object.assign({}, content, { TabPane: content }),
    Tag: content,
    Textarea: { render: () => null },
    TreeSelect: defineComponent({
      props: ['value', 'treeData', 'fieldNames'],
      emits: ['update:value'],
      setup(props, { emit }) {
        return () =>
          h(
            'select',
            {
              'aria-label': '部门',
              value: props.value ?? '',
              onChange: (event: Event) => {
                const value = (event.target as HTMLSelectElement).value;
                emit('update:value', value === '' ? undefined : Number(value));
              },
            },
            [
              h('option', { value: '' }, '全部部门'),
              ...props.treeData.map(
                (dept: { id: number; name: string; children?: unknown[] }) =>
                  h(
                    'option',
                    {
                      value: dept.id,
                      'data-child-count': dept.children?.length || 0,
                    },
                    dept.name,
                  ),
              ),
            ],
          );
      },
    }),
    message: { warning: vi.fn(), success: vi.fn() },
  };
});

const cleanup: Array<() => void> = [];
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}
async function mount() {
  const container = document.createElement('div');
  document.body.append(container);
  const showList = ref(true);
  const app = createApp({
    setup() {
      return () =>
        h(KeepAlive, null, {
          default: () => (showList.value ? h(Batches) : h('div', '考核详情')),
        });
    },
  });
  const pinia = await initStores(app, {
    namespace: 'assessment-navigation-test',
  });
  const accessStore = useAccessStore(pinia);
  accessStore.setAccessToken('synthetic-assessment-test-token');
  accessStore.setTenantId(1);
  const userStore = useUserStore(pinia);
  userStore.setUserInfo({ id: 7, username: 'assessment-test' } as never);
  const tabbarStore = useTabbarStore(pinia);
  tabbarStore.tabs = [
    {
      fullPath: '/fdmperformance/batches',
      meta: { keepAlive: true },
      name: 'FdmPerformanceBatches',
      path: '/fdmperformance/batches',
    },
  ] as typeof tabbarStore.tabs;
  app.mount(container);
  let disposed = false;
  const unmount = () => {
    if (disposed) return;
    disposed = true;
    app.unmount();
    disposePinia(pinia);
    container.remove();
  };
  cleanup.push(unmount);
  await settle();
  return {
    accessStore,
    container,
    listState: usePerformanceManagementStore(pinia),
    tabbarStore,
    unmount,
    userStore,
    async navigateToDetail() {
      showList.value = false;
      await settle();
    },
    async returnToList() {
      showList.value = true;
      await settle();
    },
    async input(label: string, value: string) {
      const input = container.querySelector<HTMLInputElement>(
        `input[aria-label="${label}"]`,
      )!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await nextTick();
    },
    async selectDepartment(value: string) {
      const select = container.querySelector<HTMLSelectElement>(
        'select[aria-label="部门"]',
      )!;
      select.value = value;
      select.dispatchEvent(new Event('change'));
      await nextTick();
    },
    async click(text: string) {
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent?.trim() === text)!
        .click();
      await settle();
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  api.getPerformanceAccess.mockResolvedValue({
    role: 'ADMIN',
    canManage: true,
    canExport: true,
    availableScopes: ['SELF', 'INITIATED', 'ALL'],
  });
  getSimpleDeptList.mockResolvedValue([
    { id: 8, name: '生产部', parentId: 0 },
    { id: 9, name: '生产一组', parentId: 8 },
  ]);
  api.getInstancePage.mockResolvedValue({ list: [], total: 100 });
  api.exportInstanceExcel.mockResolvedValue(new Blob());
});
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));

describe('考核管理部门筛选', () => {
  it('复用部门树，查询重置页码，分页和导出始终携带部门及原数据范围', async () => {
    const { container, selectDepartment, click } = await mount();
    expect(getSimpleDeptList).toHaveBeenCalledOnce();
    expect(
      container
        .querySelector('option[value="8"]')
        ?.getAttribute('data-child-count'),
    ).toBe('1');
    await selectDepartment('8');
    await click('查询');
    expect(api.getInstancePage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        deptId: 8,
        pageNo: 1,
        scope: 'ALL',
      }),
    );
    await click('每页20条');
    expect(api.getInstancePage).toHaveBeenLastCalledWith(
      expect.objectContaining({ deptId: 8, pageNo: 1, pageSize: 20 }),
    );
    await click('翻到第三页');
    expect(api.getInstancePage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        deptId: 8,
        pageNo: 3,
        pageSize: 20,
        scope: 'ALL',
      }),
    );
    await click('导出当前范围');
    expect(api.exportInstanceExcel).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        deptId: 8,
        pageNo: 3,
        pageSize: 20,
        scope: 'ALL',
      }),
    );
    expect(download).toHaveBeenCalledOnce();
    await click('查询');
    expect(api.getInstancePage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        deptId: 8,
        pageNo: 1,
        pageSize: 20,
        scope: 'ALL',
      }),
    );
    await selectDepartment('');
    await click('查询');
    expect(api.getInstancePage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        deptId: undefined,
        pageNo: 1,
        scope: 'ALL',
      }),
    );
    await click('导出当前范围');
    expect(api.exportInstanceExcel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        deptId: undefined,
        scope: 'ALL',
      }),
    );
  });

  it('主管筛选仍保持原来授权的数据范围', async () => {
    api.getPerformanceAccess.mockResolvedValue({
      role: 'SUPERVISOR',
      canManage: true,
      availableScopes: ['SELF', 'INITIATED'],
    });
    const { selectDepartment, click } = await mount();
    await selectDepartment('8');
    await click('查询');
    expect(api.getInstancePage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        deptId: 8,
        scope: 'INITIATED',
      }),
    );
  });

  it('无管理权限时不请求考核和部门列表', async () => {
    api.getPerformanceAccess.mockResolvedValue({
      role: 'EMPLOYEE',
      canManage: false,
      availableScopes: ['SELF'],
    });
    const { container } = await mount();
    expect(container.querySelector('select')).toBeNull();
    expect(api.getInstancePage).not.toHaveBeenCalled();
    expect(getSimpleDeptList).not.toHaveBeenCalled();
  });
});

describe('考核管理查询记忆', () => {
  it('刷新等价的新页面和新 Pinia 恢复姓名、月份、部门及分页', async () => {
    const original = await mount();
    await original.input('搜索被考核人', '李晨');
    await original.input('考核月份', '2026-10');
    await original.selectDepartment('8');
    await original.click('查询');
    await original.click('每页20条');
    await original.click('翻到第三页');
    window.dispatchEvent(new Event('pagehide'));
    await settle();
    original.unmount();
    api.getInstancePage.mockClear();

    const restored = await mount();

    expect(api.getInstancePage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        deptId: 8,
        pageNo: 3,
        pageSize: 20,
        periodKey: '2026-10',
        scope: 'ALL',
        userName: '李晨',
      }),
    );
    expect(
      restored.container.querySelector<HTMLInputElement>(
        'input[aria-label="搜索被考核人"]',
      )?.value,
    ).toBe('李晨');
    expect(
      restored.container.querySelector('[aria-label="当前页码"]')?.textContent,
    ).toBe('3');
  });

  it('KeepAlive 返回保留未提交草稿，但列表、分页和导出仍使用上次查询条件', async () => {
    const page = await mount();
    await page.input('搜索被考核人', '李晨');
    await page.click('查询');
    await page.input('搜索被考核人', '蔡小倩');
    const previousRequests = api.getInstancePage.mock.calls.length;

    await page.navigateToDetail();
    await page.returnToList();

    expect(api.getInstancePage).toHaveBeenCalledTimes(previousRequests + 1);
    expect(api.getInstancePage).toHaveBeenLastCalledWith(
      expect.objectContaining({ userName: '李晨' }),
    );
    expect(
      page.container.querySelector<HTMLInputElement>(
        'input[aria-label="搜索被考核人"]',
      )?.value,
    ).toBe('蔡小倩');
    await page.click('翻到第三页');
    expect(api.getInstancePage).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageNo: 3, userName: '李晨' }),
    );
    await page.click('导出当前范围');
    expect(api.exportInstanceExcel).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageNo: 3, userName: '李晨' }),
    );
    await page.click('查询');
    expect(api.getInstancePage).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageNo: 1, userName: '蔡小倩' }),
    );
  });

  it('返回时数据减少会回退到最后有效页，继续保留姓名和每页条数', async () => {
    const page = await mount();
    await page.input('搜索被考核人', '李晨');
    await page.click('查询');
    await page.click('每页20条');
    await page.click('翻到第三页');
    await page.navigateToDetail();
    api.getInstancePage.mockClear();
    const requestedPages: number[] = [];
    api.getInstancePage.mockImplementation(
      async (params: { pageNo: number }) => {
        requestedPages.push(params.pageNo);
        return { list: [], total: 25 };
      },
    );

    await page.returnToList();

    expect(requestedPages).toEqual([3, 2]);
    expect(api.getInstancePage).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageNo: 2, pageSize: 20, userName: '李晨' }),
    );
    expect(
      page.container.querySelector('[aria-label="当前页码"]')?.textContent,
    ).toBe('2');
  });

  it('返回后清空批量勾选项，并重新获取当前考核记录', async () => {
    api.getInstancePage.mockResolvedValue({
      list: [
        { id: 1, batchId: 2, userName: '李晨', allowedActions: ['REMIND'] },
      ],
      total: 1,
    });
    const page = await mount();
    await page.click('勾选第一条');
    expect(page.container.textContent).toContain('批量催办（1）');
    await page.navigateToDetail();
    const previousRequests = api.getInstancePage.mock.calls.length;
    api.getInstancePage.mockResolvedValue({ list: [], total: 0 });

    await page.returnToList();

    expect(api.getInstancePage).toHaveBeenCalledTimes(previousRequests + 1);
    expect(page.container.textContent).not.toContain('批量催办');
    expect(page.container.textContent).toContain('共 0 条');
  });

  it('重置清除筛选和分页，重新打开时保持默认查询', async () => {
    const page = await mount();
    await page.input('搜索被考核人', '李晨');
    await page.input('考核月份', '2026-10');
    await page.selectDepartment('8');
    await page.click('查询');
    await page.click('每页20条');
    await page.click('翻到第三页');
    await page.click('重置');

    expect(api.getInstancePage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        deptId: undefined,
        pageNo: 1,
        pageSize: 10,
        periodKey: undefined,
        scope: 'ALL',
        userName: undefined,
      }),
    );
    expect(
      page.container.querySelector<HTMLInputElement>(
        'input[aria-label="搜索被考核人"]',
      )?.value,
    ).toBe('');
    page.unmount();
    await mount();
    expect(api.getInstancePage).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageNo: 1, pageSize: 10, userName: undefined }),
    );
  });

  it('关闭缓存中的考核管理标签后清除保存状态', async () => {
    const page = await mount();
    await page.input('搜索被考核人', '李晨');
    await page.click('查询');
    await page.navigateToDetail();
    expect(page.listState.saved?.appliedQuery.userName).toBe('李晨');
    const oldSnapshot = page.listState.saved!;
    const oldOwner = page.listState.identity;

    page.tabbarStore.tabs = [];
    expect(page.listState.saved).toBeNull();
    page.listState.save(oldSnapshot, oldOwner);
    expect(page.listState.saved).toBeNull();
    await settle();
    page.unmount();
    await mount();

    expect(api.getInstancePage).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageNo: 1, userName: undefined }),
    );
  });

  it('切换访问租户清除旧状态并重新按当前权限查询', async () => {
    const page = await mount();
    await page.input('搜索被考核人', '李晨');
    await page.click('查询');
    page.accessStore.setVisitTenantId(2);
    await settle();

    expect(api.getInstancePage).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageNo: 1, userName: undefined }),
    );
    expect(page.listState.saved?.appliedQuery.userName).toBeUndefined();
    expect(
      page.container.querySelector<HTMLInputElement>(
        'input[aria-label="搜索被考核人"]',
      )?.value,
    ).toBe('');
  });

  it('旧租户异步操作不能用旧身份回写保存状态', async () => {
    const page = await mount();
    await page.input('搜索被考核人', '李晨');
    await page.click('查询');
    const oldOwner = page.listState.identity;
    const oldSnapshot = page.listState.saved!;
    await page.navigateToDetail();

    page.accessStore.setVisitTenantId(2);
    page.listState.save(oldSnapshot, oldOwner);

    expect(page.listState.saved).toBeNull();
  });

  it('切换账号清除姓名，退出登录后阻止旧页面保存', async () => {
    const page = await mount();
    await page.input('搜索被考核人', '李晨');
    await page.click('查询');
    const oldOwner = page.listState.identity;
    const oldSnapshot = page.listState.saved!;

    page.userStore.setUserInfo({
      id: 8,
      username: 'another-test-user',
    } as never);
    await settle();
    expect(api.getInstancePage).toHaveBeenLastCalledWith(
      expect.objectContaining({ userName: undefined }),
    );
    expect(page.listState.saved?.appliedQuery.userName).toBeUndefined();

    page.accessStore.setAccessToken(null);
    page.listState.save(oldSnapshot, oldOwner);
    expect(page.listState.saved).toBeNull();
  });

  it('$reset 清除内存及会话中的保存状态', async () => {
    const page = await mount();
    await page.input('搜索被考核人', '李晨');
    await page.click('查询');
    expect(page.listState.saved?.appliedQuery.userName).toBe('李晨');

    page.listState.$reset();
    await settle();
    expect(page.listState.saved).toBeNull();
    page.unmount();
    await mount();

    expect(api.getInstancePage).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageNo: 1, userName: undefined }),
    );
  });
});
