import { createApp, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
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
  return {
    Alert: { render: () => null },
    Button: defineComponent({
      setup(_props, { attrs, slots }) {
        return () => h('button', attrs, slots.default?.());
      },
    }),
    DatePicker: { render: () => null },
    Empty: { render: () => null },
    Input: { render: () => null },
    Modal: { render: () => null },
    Popconfirm: content,
    Select: { render: () => null },
    Space: content,
    Table: defineComponent({
      emits: ['change'],
      setup(_props, { emit }) {
        return () =>
          h(
            'button',
            {
              onClick: () => emit('change', { current: 3, pageSize: 20 }),
            },
            '翻到第三页',
          );
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
  const app = createApp(Batches);
  app.mount(container);
  cleanup.push(() => {
    app.unmount();
    container.remove();
  });
  await settle();
  return {
    container,
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
  api.getInstancePage.mockResolvedValue({ list: [], total: 0 });
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
