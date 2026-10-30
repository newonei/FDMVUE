import { createApp, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LaunchWizard from './LaunchWizard.vue';
import { defaultPeriodKey } from './model';

const api = vi.hoisted(() => ({
  getPerformanceAccess: vi.fn(),
  getLaunchPreview: vi.fn(),
  batchLaunchAssessments: vi.fn(),
}));
const push = vi.hoisted(() => vi.fn());
const warning = vi.hoisted(() => vi.fn());
const monthlyTemplate = {
  id: 1,
  name: '运营月度',
  periodType: 'MONTH',
  personCount: 5,
  indicatorCount: 1,
  deptIds: [],
  deptNames: [],
};
const quarterlyTemplate = {
  ...monthlyTemplate,
  id: 2,
  name: '财务季度',
  periodType: 'QUARTER',
};
const picked = vi.hoisted(() => ({ templates: [] as unknown[] }));
vi.mock('#/api/fdmperformance', () => api);
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));
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
vi.mock('./components/TemplatePickerModal.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      props: ['open'],
      emits: ['confirm', 'update:open'],
      setup(props, { emit }) {
        return () =>
          props.open
            ? h(
                'button',
                {
                  onClick: () => {
                    emit('confirm', picked.templates);
                    emit('update:open', false);
                  },
                },
                '确认模板',
              )
            : null;
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
    props: ['value'],
    emits: ['update:value'],
    setup(props, { attrs, emit }) {
      return () =>
        h('input', {
          ...attrs,
          value: props.value,
          onInput: (event: Event) =>
            emit('update:value', (event.target as HTMLInputElement).value),
        });
    },
  });
  return {
    Alert: defineComponent({
      props: ['message'],
      setup(props) {
        return () => h('div', props.message);
      },
    }),
    Button: defineComponent({
      setup(_props, { attrs, slots }) {
        return () => h('button', attrs, slots.default?.());
      },
    }),
    DatePicker: defineComponent({
      props: ['value'],
      emits: ['update:value'],
      setup(props, { emit }) {
        return () =>
          h('input', {
            type: 'date',
            value: props.value,
            onInput: (event: Event) =>
              emit('update:value', (event.target as HTMLInputElement).value),
          });
      },
    }),
    Descriptions: Object.assign({}, content, { Item: content }),
    Form: Object.assign({}, content, { Item: content }),
    Input: Object.assign({}, input, { TextArea: input }),
    Select: defineComponent({
      props: ['value', 'options'],
      emits: ['update:value'],
      setup(props, { emit }) {
        return () =>
          h(
            'select',
            {
              value: props.value,
              onChange: (event: Event) =>
                emit('update:value', (event.target as HTMLSelectElement).value),
            },
            props.options?.map((option: { label: string; value: string }) =>
              h('option', { value: option.value }, option.label),
            ),
          );
      },
    }),
    Spin: content,
    Steps: content,
    Tag: content,
    Table: defineComponent({
      props: ['dataSource', 'rowSelection'],
      setup(props) {
        return () =>
          h(
            'div',
            props.dataSource.map(
              (person: { userId: number; userName: string }) =>
                h('div', [
                  h('span', person.userName),
                  props.rowSelection
                    ? h('input', {
                        type: 'checkbox',
                        'data-person': person.userId,
                        disabled:
                          props.rowSelection.getCheckboxProps(person).disabled,
                        checked: props.rowSelection.selectedRowKeys.includes(
                          person.userId,
                        ),
                        onChange: () =>
                          props.rowSelection.onChange([person.userId]),
                      })
                    : null,
                ]),
            ),
          );
      },
    }),
    message: { success: vi.fn(), warning },
  };
});

const cleanups: Array<() => void> = [];
const preview = {
  templateId: 1,
  persons: [
    {
      userId: 3,
      userName: '员工甲',
      supervisorUserId: 9,
      supervisorUserName: '当前主管',
    },
    { userId: 4, userName: '员工乙', supervisorUserId: 4 },
  ],
  dimensions: [],
};
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}
async function mount() {
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp(LaunchWizard);
  app.mount(root);
  cleanups.push(() => {
    app.unmount();
    root.remove();
  });
  await settle();
  const click = async (text: string) => {
    const button = [...root.querySelectorAll('button')].find(
      (item) => item.textContent?.trim() === text,
    );
    expect(button, text).toBeDefined();
    button!.click();
    await settle();
  };
  const prepare = async () => {
    await click('选择考评表（可多选）');
    await click('确认模板');
    const startDate = root.querySelector<HTMLInputElement>(
      'input[type="date"]',
    )!;
    startDate.value = '2026-09-01';
    startDate.dispatchEvent(new Event('input'));
    await nextTick();
    await click('下一步');
  };
  const choose = async (templateIndex: number, userId: number) => {
    root
      .querySelectorAll('.launch-item')
      [templateIndex]!.querySelector(`[data-person="${userId}"]`)!
      .dispatchEvent(new Event('change'));
    await nextTick();
  };
  return { root, click, choose, prepare };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getPerformanceAccess.mockResolvedValue({
    role: 'SUPERVISOR',
    canLaunch: true,
  });
  picked.templates = [monthlyTemplate];
  api.getLaunchPreview.mockReset().mockResolvedValue(preview);
  api.batchLaunchAssessments.mockResolvedValue([71]);
});
afterEach(() => cleanups.splice(0).forEach((dispose) => dispose()));

describe('三步发起真实交互', () => {
  it('普通员工直达发起页也不会显示表单或请求模板人员', async () => {
    api.getPerformanceAccess.mockResolvedValue({
      role: 'EMPLOYEE',
      canLaunch: false,
    });
    const { root } = await mount();
    expect(root.textContent).toContain('没有发起考核权限');
    expect(root.querySelector('input')).toBeNull();
    expect(api.getLaunchPreview).not.toHaveBeenCalled();
  });
  it('不默认选中模板全部人员，选择授权子集后才生成请求并进入管理页', async () => {
    const { root, click, prepare } = await mount();
    expect(root.textContent).not.toContain('截止日期');
    expect(root.querySelectorAll('input[type="date"]')).toHaveLength(1);
    await prepare();
    await click('下一步');
    expect(warning).toHaveBeenCalledWith('请至少选择一名被考核人');
    expect(
      (root.querySelector('[data-person="4"]') as HTMLInputElement).disabled,
    ).toBe(true);
    const employee = root.querySelector(
      '[data-person="3"]',
    ) as HTMLInputElement;
    employee.checked = true;
    employee.dispatchEvent(new Event('change'));
    await nextTick();
    await click('下一步');
    await click('确认发起 1 人考核');
    expect(api.batchLaunchAssessments).toHaveBeenCalledExactlyOnceWith({
      remark: '',
      startDate: '2026-09-01',
      items: [
        {
          templateId: 1,
          name: `运营月度-${defaultPeriodKey('MONTH')}`,
          periodKey: defaultPeriodKey('MONTH'),
          userIds: [3],
          idempotencyKey: expect.any(String),
        },
      ],
    });
    expect(push).toHaveBeenCalledWith({
      name: 'FdmPerformanceBatches',
      query: { batchId: '71', scope: 'INITIATED' },
    });
  });
  it('预览后被收回的人员在提交前重新核验并阻断发起', async () => {
    const { click, choose, prepare } = await mount();
    await prepare();
    await choose(0, 3);
    await click('下一步');
    api.getLaunchPreview.mockResolvedValue({ ...preview, persons: [] });
    await click('确认发起 1 人考核');
    expect(api.batchLaunchAssessments).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      '所选人员已不在授权范围内，请返回重新选择',
    );
  });
  it('评分人发生变化时返回核对，不能静默使用新评分人发起', async () => {
    const { click, choose, prepare } = await mount();
    await prepare();
    await choose(0, 3);
    await click('下一步');
    api.getLaunchPreview.mockResolvedValue({
      ...preview,
      persons: [{ ...preview.persons[0], superiorSupervisorUserId: 12 }],
    });
    await click('确认发起 1 人考核');
    expect(api.batchLaunchAssessments).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      '评分人关系已变化，请重新核对后再发起',
    );
  });
  it('一键全选只勾选关系核验通过的人员', async () => {
    const { click, prepare } = await mount();
    await prepare();
    await click('全选可发起人员');
    await click('下一步');
    await click('确认发起 1 人考核');
    expect(api.batchLaunchAssessments).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ userIds: [3] })],
      }),
    );
  });
  it('多张考评表逐张选人后一次批量发起', async () => {
    picked.templates = [monthlyTemplate, quarterlyTemplate];
    api.getLaunchPreview.mockImplementation(async (templateId: number) =>
      templateId === 2
        ? {
            ...preview,
            templateId: 2,
            persons: [{ userId: 5, userName: '员工丙', supervisorUserId: 9 }],
          }
        : preview,
    );
    api.batchLaunchAssessments.mockResolvedValue([71, 72]);
    const { root, click, choose, prepare } = await mount();
    await prepare();
    expect(api.getLaunchPreview.mock.calls.map(([id]) => id)).toEqual([1, 2]);
    expect(root.querySelectorAll('.launch-item')).toHaveLength(2);
    await choose(0, 3);
    await click('下一步');
    expect(warning).toHaveBeenCalledWith(
      '「财务季度」请至少选择一名被考核人',
    );
    await choose(1, 5);
    await click('下一步');
    await click('确认发起 2 人考核');
    expect(api.batchLaunchAssessments).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            templateId: 1,
            periodKey: defaultPeriodKey('MONTH'),
            userIds: [3],
          }),
          expect.objectContaining({
            templateId: 2,
            name: `财务季度-${defaultPeriodKey('QUARTER')}`,
            periodKey: defaultPeriodKey('QUARTER'),
            userIds: [5],
          }),
        ],
      }),
    );
    const [keyA, keyB] = api.batchLaunchAssessments.mock.calls[0]![0].items.map(
      (item: { idempotencyKey: string }) => item.idempotencyKey,
    );
    expect(keyA).not.toBe(keyB);
    expect(push).toHaveBeenCalledWith({
      name: 'FdmPerformanceBatches',
      query: { scope: 'INITIATED' },
    });
  });
});
