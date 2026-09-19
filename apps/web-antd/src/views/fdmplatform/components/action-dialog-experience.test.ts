/* eslint-disable vue/one-component-per-file -- Small adapters preserve the real form and close lifecycle without portal rendering. */
import type { Component, PropType } from 'vue';

import type { ActionDefinition } from '../data';

import { createApp, defineComponent, h, nextTick, reactive } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DocumentAction from '../documents/DocumentAction.vue';
import { formDraftSignature } from '../documents/formDefaults';
import ActionDialog from './ActionDialog.vue';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  contract: vi.fn(),
  submit: vi.fn(),
  definition: vi.fn(),
  scroll: vi.fn(),
}));
vi.mock('#/api/fdmplatform', () => ({
  newIdempotencyKey: () => 'experience-operation',
  getContract: mocks.contract,
  getDirectory: vi
    .fn()
    .mockResolvedValue({ users: [], departments: [], companies: [] }),
  getAttachments: vi.fn().mockResolvedValue({ items: [] }),
  getMasterData: vi.fn().mockResolvedValue([]),
  requestAiReview: vi.fn(),
}));
vi.mock('#/api/fdmplatform/stock', () => ({
  getContractStockPools: vi.fn().mockResolvedValue({ pools: [] }),
}));
vi.mock('#/api/fdmplatform/submissions', () => ({
  contractActionWithAttachments: mocks.submit,
}));
vi.mock('../documents/model', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  documentActionDefinition: mocks.definition,
}));
vi.mock('../documents/ContractPicker.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../finance/exchange-rates/ReceiptFxPreview.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./RemoteMasterSelect.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./RemoteStockSelect.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./AttachmentPanel.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./CreationAttachments.vue', () => ({
  default: defineComponent({
    emits: ['update:files'],
    setup: (_, ctx) => () =>
      h(
        'button',
        {
          'data-attach': true,
          onClick: () =>
            ctx.emit('update:files', [new File(['proof'], '附件.pdf')]),
        },
        '选择附件',
      ),
  }),
}));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup: (_, ctx) => () => h('div', ctx.attrs, ctx.slots.default?.()),
  });
  const item = defineComponent({
    props: {
      label: { type: String, default: undefined },
      help: { type: String, default: undefined },
      validateStatus: { type: String, default: undefined },
    },
    setup: (props, ctx) => () =>
      h(
        'div',
        {
          ...ctx.attrs,
          'data-label': props.label,
          'data-status': props.validateStatus,
        },
        [ctx.slots.default?.(), h('span', { 'data-help': true }, props.help)],
      ),
  });
  const input = defineComponent({
    props: {
      value: { type: [String, Number, Boolean, Array], default: undefined },
      disabled: Boolean,
    },
    emits: ['update:value'],
    setup: (props, ctx) => () =>
      h('input', {
        ...ctx.attrs,
        value: props.value,
        disabled: props.disabled,
        onInput: (event: Event) =>
          ctx.emit('update:value', (event.target as HTMLInputElement).value),
      }),
  });
  const modal = Object.assign(
    defineComponent({
      props: {
        open: Boolean,
        bodyStyle: {
          type: Object as PropType<{ maxHeight?: string }>,
          default: undefined,
        },
        confirmLoading: Boolean,
        footer: { type: Object, default: undefined },
      },
      emits: ['ok', 'cancel'],
      setup: (props, ctx) => () =>
        props.open
          ? h('section', { 'data-scroll-height': props.bodyStyle?.maxHeight }, [
              ctx.slots.default?.(),
              props.footer === null
                ? null
                : h(
                    'button',
                    {
                      'data-submit': true,
                      disabled: props.confirmLoading,
                      onClick: () => ctx.emit('ok'),
                    },
                    '提交',
                  ),
              h(
                'button',
                {
                  'data-cancel': true,
                  disabled: props.confirmLoading,
                  onClick: (event: MouseEvent) => ctx.emit('cancel', event),
                },
                '取消',
              ),
            ])
          : null,
    }),
    { confirm: mocks.confirm },
  );
  return {
    Alert: defineComponent({
      props: { message: { type: String, default: undefined } },
      setup: (props) => () => h('div', props.message),
    }),
    AutoComplete: input,
    Button: block,
    Collapse: Object.assign(block, { Panel: block }),
    Descriptions: Object.assign(block, { Item: block }),
    Form: Object.assign(block, { Item: item }),
    Input: input,
    InputNumber: input,
    Modal: modal,
    Select: input,
    Space: block,
    Spin: block,
    Switch: input,
    Textarea: input,
    message: { success: vi.fn() },
  };
});

const cleanups: (() => void)[] = [];
const originalScroll = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView',
);
function mount(component: Component, initial: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.append(host);
  const props = reactive(initial);
  const app = createApp({ render: () => h(component, props) });
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  return { host, props };
}
async function fill(host: HTMLElement, label: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(
    `[data-label="${label}"] input`,
  )!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}
function click(host: HTMLElement, selector: string) {
  host.querySelector<HTMLButtonElement>(selector)!.click();
}
function definition(): ActionDefinition {
  return {
    action: 'CREATE_COST',
    title: '登记费用',
    description: '填写本次费用',
    fields: [
      {
        key: 'amount',
        label: '金额',
        type: 'decimal',
        required: true,
        min: 0.01,
      },
      { key: 'remark', label: '用途', required: true },
    ],
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: mocks.scroll,
  });
  mocks.definition.mockImplementation(definition);
  mocks.contract.mockResolvedValue({
    id: 'contract',
    version: 1,
    code: 'HT-1',
    name: '测试订单',
    customerName: '测试客户',
    allowedActions: ['CREATE_COST'],
  });
});
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  if (originalScroll)
    Object.defineProperty(
      HTMLElement.prototype,
      'scrollIntoView',
      originalScroll,
    );
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});

describe('办理表单纠错与内容保护', () => {
  it('shows every missing header and line field together, focuses the first and clears corrected fields in place', async () => {
    const submit = vi.fn();
    const view = mount(ActionDialog, {
      open: true,
      saving: false,
      onSubmit: submit,
      definition: {
        ...definition(),
        lineKey: 'items',
        lineFields: [
          {
            key: 'quantity',
            label: '数量',
            type: 'number',
            required: true,
            min: 1,
          },
        ],
      },
    });
    click(view.host, '[data-submit]');
    await nextTick();
    await nextTick();
    expect(submit).not.toHaveBeenCalled();
    expect(view.host.querySelectorAll('.action-field-error')).toHaveLength(2);
    expect(view.host.querySelectorAll('.line-cell-error')).toHaveLength(1);
    expect(view.host.textContent).toContain('还有 3 项需要检查');
    expect(mocks.scroll).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(
      view.host.querySelector<HTMLElement>('[data-label="金额"] input'),
    );
    await fill(view.host, '金额', '10.5');
    expect(
      view.host.querySelector<HTMLElement>('[data-label="金额"]')?.dataset
        .status,
    ).toBeUndefined();
    expect(
      view.host.querySelector<HTMLElement>('[data-label="用途"]')?.dataset
        .status,
    ).toBe('error');
    expect(view.host.textContent).toContain('还有 2 项需要检查');
    expect(view.host.querySelector('section')?.dataset.scrollHeight).toBe(
      'calc(100dvh - 200px)',
    );
  });

  it('distinguishes untouched, changed, restored and reopened form state without storing it externally', async () => {
    const close = vi.fn();
    const view = mount(ActionDialog, {
      open: true,
      saving: false,
      definition: definition(),
      onClose: close,
    });
    click(view.host, '[data-cancel]');
    expect(close).toHaveBeenLastCalledWith(false);
    await fill(view.host, '用途', '运输费用');
    click(view.host, '[data-cancel]');
    expect(close).toHaveBeenLastCalledWith(true);
    await fill(view.host, '用途', '');
    click(view.host, '[data-cancel]');
    expect(close).toHaveBeenLastCalledWith(false);
    await fill(view.host, '用途', '下次不要沿用');
    view.props.open = false;
    await nextTick();
    view.props.open = true;
    await nextTick();
    expect(
      view.host.querySelector<HTMLInputElement>('[data-label="用途"] input')
        ?.value,
    ).toBe('');
    click(view.host, '[data-cancel]');
    expect(close).toHaveBeenLastCalledWith(false);
    expect(formDraftSignature({ amount: 1, remark: undefined }, [])).toBe(
      formDraftSignature({ remark: '', amount: '1' }, []),
    );
  });

  it('keeps changed text and attachments after cancelling a single combined discard confirmation', async () => {
    const close = vi.fn();
    const view = mount(DocumentAction, {
      open: true,
      kind: 'costs',
      action: 'CREATE_COST',
      contractId: 'contract',
      lockContract: true,
      onClose: close,
    });
    await vi.waitFor(() =>
      expect(
        view.host.querySelector<HTMLElement>('[data-label="金额"]'),
      ).toBeTruthy(),
    );
    await fill(view.host, '用途', '保留这段说明');
    click(view.host, '[data-attach]');
    await nextTick();
    click(view.host, '[data-cancel]');
    expect(mocks.confirm).toHaveBeenCalledOnce();
    const confirmation = mocks.confirm.mock.calls[0]![0];
    expect(confirmation).toMatchObject({
      cancelText: '继续填写',
      okText: '放弃并关闭',
      autoFocusButton: 'cancel',
    });
    expect(confirmation.content).toContain('1 个待上传附件');
    confirmation.onCancel?.();
    expect(close).not.toHaveBeenCalled();
    expect(
      view.host.querySelector<HTMLInputElement>('[data-label="用途"] input')
        ?.value,
    ).toBe('保留这段说明');
    click(view.host, '[data-cancel]');
    mocks.confirm.mock.calls[1]![0].onOk();
    expect(close).toHaveBeenCalledOnce();
  });

  it('preserves failed input and operation key for retry, then closes a successful save without discard confirmation', async () => {
    mocks.submit
      .mockRejectedValueOnce(new Error('网络暂不可用'))
      .mockResolvedValueOnce({ id: 'contract', version: 2 });
    const close = vi.fn();
    const view = mount(DocumentAction, {
      open: true,
      kind: 'costs',
      action: 'CREATE_COST',
      contractId: 'contract',
      lockContract: true,
      onClose: close,
    });
    await vi.waitFor(() =>
      expect(
        view.host.querySelector<HTMLElement>('[data-label="金额"]'),
      ).toBeTruthy(),
    );
    await fill(view.host, '金额', '23.5');
    await fill(view.host, '用途', '运费');
    click(view.host, '[data-submit]');
    await vi.waitFor(() =>
      expect(view.host.textContent).toContain('网络暂不可用'),
    );
    expect(
      view.host.querySelector<HTMLInputElement>('[data-label="金额"] input')
        ?.value,
    ).toBe('23.5');
    click(view.host, '[data-submit]');
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(mocks.submit.mock.calls[0]![3]).toBe(mocks.submit.mock.calls[1]![3]);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it('closes an unsuccessful preparation directly without interpreting the cancel mouse event as unsaved edits', async () => {
    mocks.contract.mockRejectedValueOnce(new Error('暂时无法读取合同'));
    const close = vi.fn();
    const view = mount(DocumentAction, {
      open: true,
      kind: 'costs',
      action: 'CREATE_COST',
      contractId: 'contract',
      lockContract: true,
      onClose: close,
    });
    await vi.waitFor(() =>
      expect(view.host.textContent).toContain('暂时无法读取合同'),
    );
    click(view.host, '[data-cancel]');
    expect(close).toHaveBeenCalledOnce();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});
