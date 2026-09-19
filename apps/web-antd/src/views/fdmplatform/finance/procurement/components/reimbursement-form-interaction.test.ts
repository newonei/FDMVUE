/* eslint-disable vue/one-component-per-file -- Minimal control adapters exercise the real reimbursement editor. */
import type { PropType } from 'vue';

import type { ProcurementFinanceRecord } from '#/api/fdmplatform/procurement-finance';

import { createApp, defineComponent, h, nextTick, reactive, ref } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import ReimbursementForm from './ReimbursementForm.vue';

const mocks = vi.hoisted(() => ({ counter: 0 }));
vi.mock('#/api/fdmplatform', () => ({
  newIdempotencyKey: () => `line-${++mocks.counter}`,
  getAccess: vi.fn().mockResolvedValue({ userId: 1 }),
  getDirectory: vi
    .fn()
    .mockResolvedValue({ users: [{ id: 1, nickname: '申请人' }] }),
  getContract: vi.fn().mockResolvedValue({ code: 'HT-1', items: [] }),
}));
vi.mock('#/api/fdmplatform/procurement', () => ({
  getProcurementSettings: vi.fn().mockResolvedValue([
    { id: 'cost', name: '费用公司', active: true, usages: ['COST'] },
    { id: 'pay', name: '付款公司', active: true, usages: ['PAY'] },
  ]),
  getProcurementOrder: vi.fn(),
}));
vi.mock('#/api/fdmplatform/procurement-finance', () => ({
  downloadProcurementFinanceFile: vi.fn(),
}));
vi.mock('../../../data', () => ({
  costCategories: [{ value: 'TRANSPORT', label: '运输' }],
  errorText: (error: Error) => error.message,
  rows: (value: unknown) => (Array.isArray(value) ? value : []),
}));
vi.mock('../../../products/model', () => ({
  currencyOptions: [{ value: 'CNY', label: '人民币' }],
}));
vi.mock('../../../purchase/manage/model', () => ({ downloadBlob: vi.fn() }));
vi.mock('../../../documents/ContractPicker.vue', () => ({
  default: defineComponent({ setup: () => () => null }),
}));
vi.mock('../../../purchase/manage/components/OrderPicker.vue', () => ({
  default: defineComponent({ setup: () => () => null }),
}));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    props: { message: { type: String, default: '' } },
    setup: (props, context) => () =>
      h('div', context.attrs, [props.message, context.slots.default?.()]),
  });
  const button = defineComponent({
    props: { disabled: Boolean },
    setup: (props, context) => () =>
      h(
        'button',
        { ...context.attrs, disabled: props.disabled },
        context.slots.default?.(),
      ),
  });
  const input = defineComponent({
    props: {
      value: { type: [String, Number], default: '' },
      disabled: Boolean,
    },
    emits: ['update:value'],
    setup: (props, context) => () =>
      h('input', {
        ...context.attrs,
        value: props.value,
        disabled: props.disabled,
        onInput: (event: Event) =>
          context.emit(
            'update:value',
            (event.target as HTMLInputElement).value,
          ),
      }),
  });
  const select = defineComponent({
    props: {
      value: { type: [String, Number], default: '' },
      disabled: Boolean,
      options: {
        type: Array as PropType<{ label: string; value: number | string }[]>,
        default: () => [],
      },
    },
    emits: ['update:value', 'change'],
    setup: (props, context) => () =>
      h(
        'select',
        {
          ...context.attrs,
          value: props.value,
          disabled: props.disabled,
          onChange: (event: Event) => {
            const raw = (event.target as HTMLSelectElement).value;
            const value = props.options.find(
              (entry) => String(entry.value) === raw,
            )?.value;
            context.emit('update:value', value);
            context.emit('change', value);
          },
        },
        [
          h('option', { value: '' }, '请选择'),
          ...props.options.map((entry) =>
            h('option', { value: entry.value }, entry.label),
          ),
        ],
      ),
  });
  return {
    Alert: block,
    Button: button,
    Form: Object.assign(block, { Item: block }),
    Input: input,
    InputNumber: input,
    Select: select,
    Tag: block,
    Textarea: input,
  };
});
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});
async function mountEditor(context: Record<string, unknown> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const props = reactive({
    context,
    files: [] as { id: string; name: string; size: number }[],
    saving: false,
    record: undefined as ProcurementFinanceRecord | undefined,
  });
  const saved = vi.fn();
  const submitted = vi.fn();
  const editor = ref<InstanceType<typeof ReimbursementForm>>();
  const app = createApp({
    setup: () => () =>
      h(ReimbursementForm, {
        ...props,
        ref: editor,
        onSave: saved,
        onSubmit: submitted,
      }),
  });
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  await vi.waitFor(() => expect(host.textContent).toContain('申请人'));
  return { host, props, saved, submitted, editor };
}
function button(host: HTMLElement, text: string) {
  return [...host.querySelectorAll('button')].find(
    (entry) => entry.textContent?.trim() === text,
  )!;
}
async function input(host: HTMLElement, field: string, value: string) {
  const element = host.querySelector<HTMLInputElement>(
    `[data-field="${field}"] input`,
  )!;
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}
describe('专用报销编辑器实际交互', () => {
  it('首次选择凭证直接随草稿输出行索引，保存失败保留输入和File及dirty状态', async () => {
    const { host, saved, editor, props } = await mountEditor();
    expect(editor.value!.isDirty()).toBe(false);
    await input(host, 'name', '运输报销');
    const fileInput =
      host.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['receipt'], 'receipt.pdf');
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [file],
    });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await nextTick();
    button(host, '保存草稿').click();
    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '运输报销',
        expenses: [
          expect.objectContaining({ evidenceFileIndex: 0, evidenceRef: '' }),
        ],
      }),
    );
    expect(editor.value!.pendingAttachments()).toEqual([file]);
    props.saving = true;
    await nextTick();
    props.saving = false;
    await nextTick();
    expect(editor.value!.isDirty()).toBe(true);
    expect(host.textContent).toContain('receipt.pdf');
    expect(editor.value!.pendingAttachments()).toEqual([file]);
  });
  it('无需选择处理人即可携带已有凭据提交生效', async () => {
    const { host, submitted } = await mountEditor({
      name: '费用',
      currency: 'CNY',
      expenseEntityId: 'cost',
      payerEntityId: 'pay',
      advanceUserName: '垫付人',
      payeeName: '收款人',
      payeeAccount: 'account',
      expenses: [
        {
          amount: '10.20',
          category: 'TRANSPORT',
          expenseDate: '2026-09-18',
          evidenceRef: 'saved-file',
        },
      ],
    });
    expect(host.querySelector('[data-field="handlerUserId"]')).toBeNull();
    button(host, '提交生效').click();
    expect(submitted).toHaveBeenCalledWith(
      expect.objectContaining({
        expenseEntityId: 'cost',
        payerEntityId: 'pay',
        expenses: [
          expect.objectContaining({
            evidenceRef: 'saved-file',
            amount: '10.20',
          }),
        ],
      }),
    );
  });
  it('复制费用立即清空凭证且保留金额，移除后总额恢复', async () => {
    const { host, editor } = await mountEditor({
      expenses: [{ amount: '0.10', evidenceRef: 'saved-file' }],
    });
    button(host, '复制').click();
    await nextTick();
    const expenses = editor.value!.payload().expenses as Record<
      string,
      unknown
    >[];
    expect(expenses).toHaveLength(2);
    expect(expenses[1]).toMatchObject({ amount: '0.10', evidenceRef: '' });
    expect(host.textContent).toContain('0.20');
    button(host, '删除').click();
    await nextTick();
    expect(host.textContent).toContain('0.10');
    expect(editor.value!.isDirty()).toBe(true);
  });
  it('首次保存成功后以服务端凭据替换File，提交失败重试不再上传', async () => {
    const context = {
      name: '费用',
      currency: 'CNY',
      expenseEntityId: 'cost',
      payerEntityId: 'pay',
      advanceUserName: '垫付人',
      payeeName: '收款人',
      payeeAccount: 'account',
      expenses: [
        {
          amount: '10.20',
          category: 'TRANSPORT',
          expenseDate: '2026-09-18',
          evidenceRef: '',
        },
      ],
    };
    const { host, props, submitted, editor } = await mountEditor(context);
    const fileInput =
      host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [new File(['receipt'], 'receipt.pdf')],
    });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await nextTick();
    button(host, '提交生效').click();
    expect(submitted).toHaveBeenCalledTimes(1);
    props.record = {
      ...context,
      id: 'saved',
      version: 1,
      code: 'BX-1',
      type: 'REIMBURSEMENT',
      status: 'DRAFT',
      allowedActions: ['UPDATE', 'SUBMIT'],
      contractId: '',
      orderId: '',
      amount: '10.20',
      expenses: [
        {
          ...context.expenses[0],
          id: 'line-on-server',
          sourceKey: 'source-on-server',
          evidenceRef: 'uploaded',
        },
      ],
    };
    props.files = [{ id: 'uploaded', name: 'receipt.pdf', size: 7 }];
    await nextTick();
    editor.value!.markSaved();
    expect(editor.value!.pendingAttachments()).toEqual([]);
    expect(editor.value!.isDirty()).toBe(false);
    const line = (
      editor.value!.payload().expenses as Record<string, unknown>[]
    )[0]!;
    expect(line).toMatchObject({
      id: 'line-on-server',
      evidenceRef: 'uploaded',
    });
    expect(line).not.toHaveProperty('evidenceFileIndex');
    button(host, '提交生效').click();
    expect(submitted).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expenses: [expect.objectContaining({ evidenceRef: 'uploaded' })],
      }),
    );
  });
});
