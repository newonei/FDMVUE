/* eslint-disable vue/one-component-per-file -- Minimal adapters exercise the real review panel state and network behavior. */
import type { PropType } from 'vue';

import type { Contract } from '#/api/fdmplatform';

import { createApp, defineComponent, h, nextTick, reactive } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ContractReviewPanel from './ContractReviewPanel.vue';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  submit: vi.fn(),
  decide: vi.fn(),
  refresh: vi.fn(),
  navigate: vi.fn(),
  sequence: 0,
}));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.navigate }) }));
vi.mock('#/api/fdmplatform', () => ({
  getDirectory: vi
    .fn()
    .mockResolvedValue({ users: [{ id: 7, nickname: '负责人' }] }),
  newIdempotencyKey: () => `review-key-${++mocks.sequence}`,
}));
vi.mock('#/api/fdmplatform/contract-review', () => ({
  getContractReviews: mocks.list,
  submitContractReview: mocks.submit,
  decideContractReview: mocks.decide,
  refreshContractReview: mocks.refresh,
}));
vi.mock('../data', () => ({
  errorText: (failure: Error) => failure.message,
}));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup(_, context) {
      return () => h('div', context.attrs, context.slots.default?.());
    },
  });
  const button = defineComponent({
    props: { disabled: Boolean },
    setup(props, context) {
      return () =>
        h(
          'button',
          { ...context.attrs, disabled: props.disabled },
          context.slots.default?.(),
        );
    },
  });
  const input = defineComponent({
    props: { value: { type: String, default: '' }, disabled: Boolean },
    emits: ['update:value'],
    setup(props, context) {
      return () =>
        h('textarea', {
          ...context.attrs,
          value: props.value,
          disabled: props.disabled,
          onInput: (event: Event) =>
            context.emit(
              'update:value',
              (event.target as HTMLTextAreaElement).value,
            ),
        });
    },
  });
  const select = defineComponent({
    props: {
      value: { type: Number, default: undefined },
      options: {
        type: Array as PropType<{ label: string; value: number }[]>,
        default: () => [],
      },
      disabled: Boolean,
    },
    emits: ['update:value'],
    setup(props, context) {
      return () =>
        h(
          'select',
          {
            ...context.attrs,
            value: props.value,
            disabled: props.disabled,
            onChange: (event: Event) =>
              context.emit(
                'update:value',
                Number((event.target as HTMLSelectElement).value),
              ),
          },
          props.options?.map((option: { label: string; value: number }) =>
            h('option', { value: option.value }, option.label),
          ),
        );
    },
  });
  return {
    Card: block,
    Space: block,
    Tag: block,
    Button: button,
    Input: { TextArea: input },
    Select: select,
    Alert: defineComponent({
      props: {
        message: { type: String, default: '' },
        description: { type: String, default: '' },
      },
      setup(props) {
        return () =>
          h('div', `${props.message ?? ''} ${props.description ?? ''}`);
      },
    }),
  };
});

const cleanups: (() => void)[] = [];
const contract = {
  id: 'contract-1',
  version: 0,
  status: 'DRAFT',
  ownerUserId: 7,
} as Contract;
const manual = {
  id: 'review-1',
  contractId: 'contract-1',
  contractVersion: 0,
  current: true,
  status: 'MANUAL_REQUIRED',
  summary: '模型未启用，已转人工',
  ruleIssues: [],
  businessVersion: 1,
  createdAt: '2026-09-18',
  reviewerUserId: 7,
  requestedBy: 7,
};
function mount() {
  const props = reactive({ contract: { ...contract }, open: true });
  const updated = vi.fn();
  const app = createApp({
    setup: () => () => h(ContractReviewPanel, { ...props, onUpdated: updated }),
  });
  const host = document.createElement('div');
  document.body.append(host);
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  return { host, props, updated };
}
function button(host: HTMLElement, text: string) {
  const value = [...host.querySelectorAll('button')].find((element) =>
    element.textContent?.includes(text),
  );
  if (!value) throw new Error(`button ${text} not found`);
  return value;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockReset();
  mocks.submit.mockReset();
  mocks.decide.mockReset();
  mocks.refresh.mockReset();
  mocks.sequence = 0;
  mocks.list.mockResolvedValue([]);
});
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.useRealTimers();
});

describe('contract review panel', () => {
  it('waits for existing review state before allowing a new submission', async () => {
    let finish: (value: unknown[]) => void = () => {};
    mocks.list.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const view = mount();
    expect(button(view.host, '提交审核').disabled).toBe(true);
    finish([manual]);
    await vi.waitFor(() =>
      expect(view.host.textContent).toContain('待人工审核'),
    );
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(view.host.textContent).toContain('待人工审核');
    expect(view.host.textContent).not.toContain('尚未提交审核');
    expect(
      [...view.host.querySelectorAll('button')].some((entry) =>
        entry.textContent?.includes('提交审核'),
      ),
    ).toBe(false);
  });
  it('continues polling an AI review after a temporary list failure', async () => {
    vi.useFakeTimers();
    mocks.list
      .mockResolvedValueOnce([{ ...manual, status: 'AI_PENDING' }])
      .mockRejectedValueOnce(new Error('临时网络故障'))
      .mockResolvedValueOnce([{ ...manual, status: 'AUTO_APPROVED' }]);
    const view = mount();
    await vi.advanceTimersByTimeAsync(0);
    expect(view.host.textContent).toContain('AI审核中');
    await vi.advanceTimersByTimeAsync(5000);
    expect(view.host.textContent).toContain('临时网络故障');
    await vi.advanceTimersByTimeAsync(5000);
    expect(view.host.textContent).toContain('自动审核通过');
    expect(view.host.textContent).not.toContain('临时网络故障');
    expect(view.updated).toHaveBeenCalledOnce();
  });
  it('keeps the same submission key after an uncertain network failure', async () => {
    mocks.submit
      .mockRejectedValueOnce(new Error('连接中断'))
      .mockResolvedValueOnce(manual);
    const view = mount();
    await vi.waitFor(() =>
      expect(button(view.host, '提交审核').disabled).toBe(false),
    );
    button(view.host, '提交审核').click();
    await vi.waitFor(() => expect(view.host.textContent).toContain('连接中断'));
    button(view.host, '提交审核').click();
    await vi.waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(2));
    expect(mocks.submit.mock.calls[0]?.[2]).toBe(
      mocks.submit.mock.calls[1]?.[2],
    );
    expect(mocks.submit.mock.calls[0]).toEqual([
      'contract-1',
      0,
      expect.any(String),
      7,
    ]);
    await vi.waitFor(() =>
      expect(view.host.textContent).toContain('待人工审核'),
    );
  });
  it('requires a reason and prevents human override of hard-rule failures', async () => {
    mocks.list.mockResolvedValue([{ ...manual, ruleIssues: ['缺少成交价'] }]);
    const view = mount();
    await vi.waitFor(() =>
      expect(view.host.textContent).toContain('缺少成交价'),
    );
    const reason = view.host.querySelector('textarea')!;
    reason.value = '请补齐成交价';
    reason.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(button(view.host, '人工通过').disabled).toBe(true);
    expect(button(view.host, '退回补充').disabled).toBe(false);
    mocks.decide.mockResolvedValue({ ...manual, status: 'RETURNED' });
    button(view.host, '退回补充').click();
    await vi.waitFor(() => expect(mocks.decide).toHaveBeenCalledOnce());
    expect(mocks.decide.mock.calls[0]?.[2]).toMatchObject({
      decision: 'RETURN',
      expectedVersion: 0,
      reason: '请补齐成交价',
    });
  });
  it('ignores late results belonging to the previously displayed contract', async () => {
    let finish: (value: unknown[]) => void = () => {};
    mocks.list
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      )
      .mockResolvedValueOnce([]);
    const view = mount();
    await vi.waitFor(() =>
      expect(mocks.list).toHaveBeenCalledWith('contract-1'),
    );
    view.props.contract = { ...contract, id: 'contract-2' };
    await vi.waitFor(() =>
      expect(mocks.list).toHaveBeenCalledWith('contract-2'),
    );
    finish([manual]);
    await nextTick();
    await nextTick();
    expect(view.host.textContent).not.toContain('模型未启用');
    expect(view.host.textContent).toContain('尚未提交审核');
  });

  it('explains successful manual submission and shows its actual handler without a resubmit button', async () => {
    mocks.submit.mockResolvedValue(manual);
    const view = mount();
    await vi.waitFor(() =>
      expect(button(view.host, '提交审核').disabled).toBe(false),
    );
    button(view.host, '提交审核').click();
    await vi.waitFor(() =>
      expect(view.host.textContent).toContain('提交成功，已进入人工审核'),
    );
    expect(view.host.textContent).toContain('待办处理人：负责人');
    expect(view.host.textContent).toContain('我发起的审批');
    expect(view.host.querySelector('select')).toBeNull();
    expect(
      [...view.host.querySelectorAll('button')].some((entry) =>
        entry.textContent?.includes('提交审核'),
      ),
    ).toBe(false);
    button(view.host, '打开业务待办与提醒').click();
    expect(mocks.navigate).toHaveBeenCalledWith(
      '/fdmprocurement/platform-approvals',
    );
  });

  it('gives an actionable validation message on empty review opinions instead of a silently disabled button', async () => {
    mocks.list.mockResolvedValue([manual]);
    const view = mount();
    await vi.waitFor(() =>
      expect(view.host.querySelector('textarea')).not.toBeNull(),
    );
    expect(button(view.host, '人工通过').disabled).toBe(false);
    button(view.host, '人工通过').click();
    await vi.waitFor(() =>
      expect(view.host.textContent).toContain('请先填写审核意见'),
    );
    expect(mocks.decide).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(view.host.querySelector('textarea'));
    const reason = view.host.querySelector('textarea')!;
    reason.value = '已核对产品、金额及商业条款';
    reason.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    mocks.decide.mockResolvedValue({ ...manual, status: 'HUMAN_APPROVED' });
    button(view.host, '人工通过').click();
    await vi.waitFor(() =>
      expect(view.host.textContent).toContain('审核通过，合同已确认'),
    );
    expect(mocks.decide).toHaveBeenCalledOnce();
  });

  it('keeps an unreadable review state from silently creating another submission', async () => {
    mocks.list.mockRejectedValue(new Error('审核状态读取失败'));
    const view = mount();
    await vi.waitFor(() =>
      expect(view.host.textContent).toContain('审核状态读取失败'),
    );
    expect(button(view.host, '提交审核').disabled).toBe(true);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('replaces the submission hint when the AI finishes instead of still saying it is running', async () => {
    vi.useFakeTimers();
    const view = mount();
    await vi.advanceTimersByTimeAsync(0);
    mocks.submit.mockResolvedValue({ ...manual, status: 'AI_PENDING' });
    button(view.host, '提交审核').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(view.host.textContent).toContain('提交成功，AI正在审核');
    mocks.list.mockResolvedValue([
      { ...manual, status: 'AUTO_APPROVED', summary: '资料检查通过' },
    ]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(view.host.textContent).toContain('自动审核通过');
    expect(view.host.textContent).not.toContain('AI正在审核');
    expect(
      [...view.host.querySelectorAll('button')].some((entry) =>
        entry.textContent?.includes('提交审核'),
      ),
    ).toBe(false);
  });
});
