import { createApp, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import InstanceDetail from './index.vue';

const api = vi.hoisted(() => ({
  completeIndicatorAction: vi.fn(),
  confirmEmployeeResult: vi.fn(),
  confirmIndicatorTask: vi.fn(),
  getInstance: vi.fn(),
  getReturnableTaskNodes: vi.fn(),
  getScoreDraft: vi.fn(),
  saveScoreDraft: vi.fn(),
  skipTask: vi.fn(),
  returnTask: vi.fn(),
  submitHrReview: vi.fn(),
  submitManagerScore: vi.fn(),
  submitSelfScore: vi.fn(),
  submitSupervisorScore: vi.fn(),
  transferTask: vi.fn(),
}));
const warning = vi.hoisted(() => vi.fn());
const confirm = vi.hoisted(() => vi.fn());
const guards = vi.hoisted(() => ({
  leave: undefined as undefined | (() => boolean | Promise<boolean>),
}));

vi.mock('#/api/fdmperformance', () => api);
vi.mock('#/api/system/user', () => ({ getSimpleUserList: vi.fn() }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {} }),
  onBeforeRouteLeave: (guard: () => boolean | Promise<boolean>) => {
    guards.leave = guard;
  },
  onBeforeRouteUpdate: vi.fn(),
}));
vi.mock('@vben/access', () => ({
  useAccess: () => ({ hasAccessByCodes: () => false }),
}));
vi.mock('@vben/stores', () => ({
  useUserStore: () => ({ userInfo: { id: 7 } }),
}));
vi.mock('@vben/icons', () => ({ Undo2: { render: () => null } }));
vi.mock('./SelfScoreAttachmentPanel.vue', () => ({
  default: { render: () => null },
}));
vi.mock('../../shared/PerformanceShell.vue', async () => {
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
    Descriptions: Object.assign({}, content, { Item: content }),
    InputNumber: defineComponent({
      props: ['value'],
      emits: ['update:value'],
      setup(props, { attrs, emit }) {
        return () =>
          h('input', {
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
    Modal: { render: () => null, confirm },
    Select: { render: () => null },
    Space: content,
    Steps: Object.assign({}, content, { Step: content }),
    Table: defineComponent({
      props: ['columns', 'dataSource'],
      setup(props, { slots }) {
        return () =>
          h(
            'div',
            props.dataSource.flatMap((record: unknown) =>
              props.columns.map((column: unknown) =>
                slots.bodyCell?.({ column, record }),
              ),
            ),
          );
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
  {
    name: '主管评分',
    key: 'JIXIAO_SUPERVISOR_SCORE',
    submit: api.submitSupervisorScore,
  },
  {
    name: '上级评分',
    key: 'JIXIAO_MANAGER_SCORE',
    submit: api.submitManagerScore,
  },
];

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

async function mount(
  taskKey: string,
  overrides: Record<string, unknown> = {},
  expectedFields = 3,
) {
  api.getInstance.mockResolvedValue({
    id: 7,
    currentTaskId: 'task-7',
    currentTaskKey: taskKey,
    allowedActions: [taskKey.replace('JIXIAO_', ''), 'SAVE_SCORE_DRAFT'],
    managerScoreEnabled: true,
    status: 1,
    indicators: [
      { id: 11, name: '质量', weight: 30 },
      { id: 12, name: '交付', weight: 40 },
      { id: 13, name: '协作', weight: 30 },
    ],
    scores: [],
    ...overrides,
  });
  const container = document.createElement('div');
  document.body.append(container);
  const app = createApp(InstanceDetail, { id: 7 });
  app.mount(container);
  cleanup.push(() => {
    app.unmount();
    container.remove();
  });
  await settle();
  const fields = [
    ...container.querySelectorAll<HTMLInputElement>('input[type="number"]'),
  ];
  expect(fields).toHaveLength(expectedFields);
  const fill = async (index: number, value: string) => {
    fields[index]!.value = value;
    fields[index]!.dispatchEvent(new Event('input'));
    await nextTick();
  };
  const submit = async () => {
    [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === '提交评分')!
      .click();
    await settle();
  };
  return { container, fields, fill, submit };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.skipTask.mockReset().mockResolvedValue(true);
  api.getScoreDraft.mockReset().mockResolvedValue(null);
  api.saveScoreDraft
    .mockReset()
    .mockImplementation(async (payload) => ({
      ...payload,
      updateTime: '2026-09-18T10:00:00',
    }));
});

describe('HR 跳过当前节点', () => {
  function skipButton(container: HTMLElement) {
    return [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '跳过',
    );
  }

  it.each([
    { allowedActions: ['TRANSFER'] },
    { status: 2 },
    { status: 3 },
    { currentTaskId: undefined },
  ])('缺少权限、运行状态或当前任务时不展示跳过：%j', async (override) => {
    const { container } = await mount(
      'JIXIAO_INDICATOR_CONFIRM',
      {
        allowedActions: ['SKIP_TASK'],
        ...override,
      },
      0,
    );
    expect(skipButton(container)).toBeUndefined();
    expect(api.skipTask).not.toHaveBeenCalled();
  });

  it('每次只提交当前任务，刷新后才能继续下一节点，完成后隐藏', async () => {
    const { container } = await mount(
      'JIXIAO_INDICATOR_CONFIRM',
      {
        allowedActions: ['SKIP_TASK'],
      },
      0,
    );
    api.getInstance.mockResolvedValueOnce({
      id: 7,
      status: 1,
      currentTaskId: 'task-next',
      currentTaskKey: 'JIXIAO_SELF_SCORE',
      allowedActions: ['SKIP_TASK'],
    });
    skipButton(container)!.click();
    await settle();
    expect(confirm).not.toHaveBeenCalled();
    expect(api.skipTask).toHaveBeenNthCalledWith(1, {
      instanceId: 7,
      taskId: 'task-7',
    });
    expect(api.getInstance).toHaveBeenCalledTimes(2);
    api.getInstance.mockResolvedValueOnce({
      id: 7,
      status: 2,
      allowedActions: [],
    });
    skipButton(container)!.click();
    await settle();
    expect(api.skipTask).toHaveBeenNthCalledWith(2, {
      instanceId: 7,
      taskId: 'task-next',
    });
    expect(skipButton(container)).toBeUndefined();
  });

  it('请求及刷新期间禁用操作并阻止重复点击', async () => {
    let finishSkip!: () => void;
    api.skipTask.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSkip = resolve;
        }),
    );
    const { container } = await mount(
      'JIXIAO_INDICATOR_CONFIRM',
      {
        allowedActions: ['SKIP_TASK', 'INDICATOR_CONFIRM', 'TRANSFER'],
      },
      0,
    );
    const button = skipButton(container)!;
    button.click();
    button.click();
    await settle();
    expect(api.skipTask).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(true);
    expect(
      [...container.querySelectorAll('button')].find(
        (item) => item.textContent?.trim() === '确认指标',
      )!.disabled,
    ).toBe(true);
    let finishLoad!: (value: unknown) => void;
    api.getInstance.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishLoad = resolve;
        }),
    );
    finishSkip();
    await settle();
    expect(button.disabled).toBe(true);
    button.click();
    expect(api.skipTask).toHaveBeenCalledOnce();
    finishLoad({ id: 7, status: 2, allowedActions: [] });
    await settle();
  });

  it('未保存评分先确认，取消保留输入，确认后不提交评分或草稿', async () => {
    const { container, fill, fields } = await mount('JIXIAO_SELF_SCORE', {
      allowedActions: ['SELF_SCORE', 'SAVE_SCORE_DRAFT', 'SKIP_TASK'],
    });
    await fill(0, '88');
    const button = skipButton(container)!;
    button.click();
    button.click();
    await settle();
    expect(confirm).toHaveBeenCalledOnce();
    expect(api.skipTask).not.toHaveBeenCalled();
    confirm.mock.calls.at(-1)![0].onCancel();
    await settle();
    expect(fields[0]!.value).toBe('88');
    expect(button.disabled).toBe(false);
    button.click();
    await settle();
    confirm.mock.calls.at(-1)![0].onOk();
    await settle();
    expect(api.skipTask).toHaveBeenCalledExactlyOnceWith({
      instanceId: 7,
      taskId: 'task-7',
    });
    expect(api.submitSelfScore).not.toHaveBeenCalled();
    expect(api.saveScoreDraft).not.toHaveBeenCalled();
    expect(
      container.querySelector<HTMLInputElement>('#performance-score-11')!.value,
    ).toBe('');
    expect(guards.leave?.()).toBe(true);
  });

  it('请求失败也刷新实际任务，避免再次提交陈旧节点', async () => {
    const { container } = await mount(
      'JIXIAO_INDICATOR_CONFIRM',
      {
        allowedActions: ['SKIP_TASK'],
      },
      0,
    );
    api.skipTask.mockRejectedValueOnce(new Error('任务已被处理'));
    api.getInstance.mockResolvedValueOnce({
      id: 7,
      status: 2,
      allowedActions: [],
    });
    skipButton(container)!.click();
    await settle();
    expect(api.getInstance).toHaveBeenCalledTimes(2);
    expect(skipButton(container)).toBeUndefined();
  });

  it('请求失败且任务仍未完成时，解除锁定并允许重试', async () => {
    const { container } = await mount(
      'JIXIAO_INDICATOR_CONFIRM',
      {
        allowedActions: ['SKIP_TASK'],
      },
      0,
    );
    api.skipTask.mockRejectedValueOnce(new Error('网络错误'));
    skipButton(container)!.click();
    await settle();
    expect(skipButton(container)!.disabled).toBe(false);
    skipButton(container)!.click();
    await settle();
    expect(api.skipTask).toHaveBeenCalledTimes(2);
    expect(api.skipTask).toHaveBeenLastCalledWith({
      instanceId: 7,
      taskId: 'task-7',
    });
  });

  it('放弃本地评分后跳过成功但刷新失败时，移除旧任务操作', async () => {
    const { container, fill } = await mount('JIXIAO_SELF_SCORE', {
      allowedActions: ['SELF_SCORE', 'SAVE_SCORE_DRAFT', 'SKIP_TASK'],
    });
    await fill(0, '88');
    api.getInstance.mockRejectedValueOnce(new Error('详情加载失败'));
    skipButton(container)!.click();
    await settle();
    confirm.mock.calls.at(-1)![0].onOk();
    await settle();
    expect(api.skipTask).toHaveBeenCalledOnce();
    expect(skipButton(container)).toBeUndefined();
    expect(container.textContent).not.toContain('提交评分');
    expect(guards.leave?.()).toBe(true);
  });
});

describe('评分权限、草稿和离开保护', () => {
  it('当前节点匹配但没有服务端动作时仍为只读，不能读取草稿', async () => {
    const { container } = await mount(
      'JIXIAO_SUPERVISOR_SCORE',
      { allowedActions: [] },
      0,
    );
    expect(container.textContent).not.toContain('提交评分');
    expect(container.textContent).not.toContain('暂存草稿');
    expect(api.getScoreDraft).not.toHaveBeenCalled();
  });

  it('动作与当前节点不匹配时不给出编辑和提交操作', async () => {
    const { container } = await mount(
      'JIXIAO_SELF_SCORE',
      { allowedActions: ['MANAGER_SCORE', 'SAVE_SCORE_DRAFT'] },
      0,
    );
    expect(container.textContent).not.toContain('提交评分');
  });

  it('只恢复当前任务草稿，显式零分保持为零', async () => {
    api.getScoreDraft.mockResolvedValue({
      instanceId: 7,
      taskId: 'task-7',
      items: [{ instanceIndicatorId: 11, score: 0, comment: '已核验' }],
      reason: '暂存说明',
    });
    const { fields } = await mount('JIXIAO_SELF_SCORE');
    expect(fields[0]!.value).toBe('0');
    expect(fields[1]!.value).toBe('');
    expect(guards.leave?.()).toBe(true);
  });

  it('不完整评分允许暂存，保存成功后离开无需确认', async () => {
    const { container, fill } = await mount('JIXIAO_SELF_SCORE');
    await fill(0, '0');
    [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === '暂存草稿')!
      .click();
    await settle();
    expect(api.saveScoreDraft).toHaveBeenCalledExactlyOnceWith({
      instanceId: 7,
      taskId: 'task-7',
      reason: undefined,
      items: [
        { instanceIndicatorId: 11, score: 0, comment: undefined },
        { instanceIndicatorId: 12, score: undefined, comment: undefined },
        { instanceIndicatorId: 13, score: undefined, comment: undefined },
      ],
    });
    expect(api.submitSelfScore).not.toHaveBeenCalled();
    expect(guards.leave?.()).toBe(true);
  });

  it('未保存离开可以取消，暂存失败也保留离开保护', async () => {
    api.saveScoreDraft.mockRejectedValueOnce(new Error('保存失败'));
    const { container, fill } = await mount('JIXIAO_SELF_SCORE');
    await fill(0, '88');
    [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === '暂存草稿')!
      .click();
    await settle();
    expect(api.saveScoreDraft).toHaveBeenCalledOnce();
    const leaving = guards.leave?.();
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: '评分尚未保存' }),
    );
    confirm.mock.calls.at(-1)![0].onCancel();
    await expect(leaving).resolves.toBe(false);
  });

  it('完成并行行动项刷新详情时，不覆盖正在编辑的评分', async () => {
    const indicators = [
      {
        id: 11,
        name: '质量',
        weight: 30,
        actionPlanEnabled: true,
        actionPlanStatus: 0,
      },
      { id: 12, name: '交付', weight: 40 },
      { id: 13, name: '协作', weight: 30 },
    ];
    const { container, fill } = await mount('JIXIAO_SELF_SCORE', {
      indicators,
      allowedActions: [
        'SELF_SCORE',
        'SAVE_SCORE_DRAFT',
        'COMPLETE_ACTION_PLAN',
      ],
    });
    await fill(0, '83');
    [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === '完成')!
      .click();
    const options = confirm.mock.calls.at(-1)![0];
    await options.onOk();
    await settle();
    expect(
      container.querySelector<HTMLInputElement>('#performance-score-11')!.value,
    ).toBe('83');
    expect(api.getScoreDraft).toHaveBeenCalledOnce();
    const leaving = guards.leave?.();
    confirm.mock.calls.at(-1)![0].onCancel();
    await expect(leaving).resolves.toBe(false);
  });
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
