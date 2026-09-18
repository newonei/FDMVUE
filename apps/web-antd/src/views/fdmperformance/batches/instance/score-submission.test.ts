import { createApp, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import InstanceDetail from './index.vue';

const api = vi.hoisted(() => ({
  completeIndicatorAction: vi.fn(),
  confirmEmployeeResult: vi.fn(),
  confirmIndicatorTask: vi.fn(),
  getInstance: vi.fn(),
  getReturnableTaskNodes: vi.fn(),
  returnTask: vi.fn(),
  submitHrReview: vi.fn(),
  submitManagerScore: vi.fn(),
  submitSelfScore: vi.fn(),
  submitSupervisorScore: vi.fn(),
  transferTask: vi.fn(),
}));
const warning = vi.hoisted(() => vi.fn());

vi.mock('#/api/fdmperformance', () => api);
vi.mock('#/api/system/user', () => ({ getSimpleUserList: vi.fn() }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: {} }) }));
vi.mock('@vben/access', () => ({ useAccess: () => ({ hasAccessByCodes: () => false }) }));
vi.mock('@vben/stores', () => ({ useUserStore: () => ({ userInfo: { id: 7 } }) }));
vi.mock('@vben/icons', () => ({ Undo2: { render: () => null } }));
vi.mock('./SelfScoreAttachmentPanel.vue', () => ({ default: { render: () => null } }));
vi.mock('../../shared/PerformanceShell.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      setup(_props, { slots }) { return () => h('main', slots.default?.()); },
    }),
  };
});
vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');
  const content = defineComponent({
    setup(_props, { slots }) { return () => h('div', slots.default?.()); },
  });
  return {
    Alert: { render: () => null },
    Button: defineComponent({
      setup(_props, { attrs, slots }) { return () => h('button', attrs, slots.default?.()); },
    }),
    Descriptions: Object.assign({}, content, { Item: content }),
    InputNumber: defineComponent({
      props: ['value'],
      emits: ['update:value'],
      setup(props, { attrs, emit }) {
        return () => h('input', {
          ...attrs,
          type: 'number',
          value: props.value ?? '',
          onInput: (event: Event) => {
            const value = (event.target as HTMLInputElement).value;
            emit('update:value', value === '' ? null : Number(value));
          },
        });
      },
    }),
    Modal: { render: () => null },
    Select: { render: () => null },
    Space: content,
    Steps: Object.assign({}, content, { Step: content }),
    Table: defineComponent({
      props: ['columns', 'dataSource'],
      setup(props, { slots }) {
        return () => h('div', props.dataSource.flatMap((record: unknown) =>
          props.columns.map((column: unknown) => slots.bodyCell?.({ column, record })),
        ));
      },
    }),
    Tag: content,
    Textarea: { render: () => null },
    message: { error: vi.fn(), success: vi.fn(), warning },
  };
});

const cleanup: Array<() => void> = [];
const stages = [
  { name: '自评', key: 'JIXIAO_SELF_SCORE', submit: api.submitSelfScore },
  { name: '主管评分', key: 'JIXIAO_SUPERVISOR_SCORE', submit: api.submitSupervisorScore },
  { name: '上级评分', key: 'JIXIAO_MANAGER_SCORE', submit: api.submitManagerScore },
];

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

async function mount(taskKey: string) {
  api.getInstance.mockResolvedValue({
    id: 7,
    currentTaskId: 'task-7',
    currentTaskKey: taskKey,
    managerScoreEnabled: true,
    status: 1,
    indicators: [
      { id: 11, name: '质量', weight: 30 },
      { id: 12, name: '交付', weight: 40 },
      { id: 13, name: '协作', weight: 30 },
    ],
    scores: [],
  });
  const container = document.createElement('div');
  document.body.append(container);
  const app = createApp(InstanceDetail, { id: 7 });
  app.mount(container);
  cleanup.push(() => { app.unmount(); container.remove(); });
  await settle();
  const fields = [...container.querySelectorAll<HTMLInputElement>('input[type="number"]')];
  expect(fields).toHaveLength(3);
  const fill = async (index: number, value: string) => {
    fields[index]!.value = value;
    fields[index]!.dispatchEvent(new Event('input'));
    await nextTick();
  };
  const submit = async () => {
    [...container.querySelectorAll('button')].find((button) => button.textContent?.trim() === '提交评分')!.click();
    await settle();
  };
  return { fields, fill, submit };
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));

describe.each(stages)('$name 分数提交', ({ key, submit: submitApi }) => {
  it('漏填时阻断请求、指出指标并聚焦首个漏填输入框', async () => {
    const { fields, fill, submit } = await mount(key);
    await fill(0, '0');
    await fill(2, '100');
    await submit();
    expect(submitApi).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith('请填写「交付」评分，0 分需明确输入');
    expect(document.activeElement).toBe(fields[1]);
  });

  it('清空已填写的分数后不能把空白作为零分提交', async () => {
    const { fields, fill, submit } = await mount(key);
    await fill(0, '0');
    await fill(1, '20');
    await fill(2, '100');
    await fill(1, '');
    await submit();
    expect(submitApi).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(fields[1]);
  });

  it('显式零分、小数和满分保留原值并提交正确评分阶段', async () => {
    const { fill, submit } = await mount(key);
    await fill(0, '0');
    await fill(1, '37.5');
    await fill(2, '100');
    await submit();
    expect(submitApi).toHaveBeenCalledExactlyOnceWith({
      instanceId: 7,
      taskId: 'task-7',
      items: [
        { comment: undefined, instanceIndicatorId: 11, score: 0 },
        { comment: undefined, instanceIndicatorId: 12, score: 37.5 },
        { comment: undefined, instanceIndicatorId: 13, score: 100 },
      ],
    });
    for (const stage of stages) {
      if (stage.key !== key) expect(stage.submit).not.toHaveBeenCalled();
    }
    expect(warning).not.toHaveBeenCalled();
  });
});
