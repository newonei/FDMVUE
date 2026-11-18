/* eslint-disable vue/one-component-per-file -- UI adapters exercise the real purchase editor. */
import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PurchaseOrderEditor from './components/PurchaseOrderEditor.vue';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  contract: vi.fn(),
  order: vi.fn(),
}));
vi.mock('#/api/fdmplatform', () => ({
  getDirectory: async () => ({
    companies: [{ companyId: 1, companyName: '公司' }],
  }),
  getContract: mocks.contract,
}));
vi.mock('#/api/fdmplatform/contract-board', () => ({
  getContractBoard: async () => ({ list: [] }),
}));
vi.mock('#/api/fdmplatform/masters', () => ({
  getMasterPage: async () => ({ list: [] }),
}));
vi.mock('#/api/fdmplatform/products', () => ({
  getProducts: async () => ({ list: [] }),
}));
vi.mock('#/api/fdmplatform/procurement', () => ({
  createProcurementOrder: mocks.create,
  updateProcurementOrder: mocks.update,
  getProcurementSettings: async () => [],
  getReceiveFactories: async () => [],
  getProcurementOrder: mocks.order,
}));
vi.mock('../../components/RemoteMasterSelect.vue', () => ({
  default: defineComponent({
    props: { value: { type: String, default: '' } },
    emits: ['update:value'],
    setup: (props, ctx) => () =>
      h('input', {
        'data-supplier': true,
        value: props.value,
        onInput: (event: Event) =>
          ctx.emit('update:value', (event.target as HTMLInputElement).value),
      }),
  }),
}));
vi.mock('../../products/components/ProductStructureDetails.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('ant-design-vue', () => {
  const Wrap = defineComponent({
    setup: (_, ctx) => () => h('div', ctx.slots.default?.()),
  });
  const Input = defineComponent({
    props: {
      value: { type: [String, Number], default: '' },
      disabled: Boolean,
    },
    emits: ['update:value'],
    setup: (props, ctx) => () =>
      h('input', {
        ...ctx.attrs,
        value: props.value ?? '',
        disabled: props.disabled,
        onInput: (event: Event) =>
          ctx.emit('update:value', (event.target as HTMLInputElement).value),
      }),
  });
  return {
    Alert: defineComponent({
      props: { message: { type: String, default: '' } },
      setup: (props) => () => h('p', props.message),
    }),
    Button: defineComponent({
      props: { disabled: Boolean, loading: Boolean },
      setup: (props, ctx) => () =>
        h(
          'button',
          { ...ctx.attrs, disabled: props.disabled || props.loading },
          ctx.slots.default?.(),
        ),
    }),
    Modal: defineComponent({
      props: { open: Boolean, closable: Boolean, keyboard: Boolean },
      emits: ['cancel'],
      setup: (props, ctx) => () =>
        props.open
          ? h(
              'section',
              {
                'data-closable': String(props.closable),
                'data-keyboard': String(props.keyboard),
              },
              [
                ctx.slots.default?.(),
                ctx.slots.footer?.(),
                h(
                  'button',
                  {
                    'data-modal-cancel': true,
                    onClick: () => ctx.emit('cancel'),
                  },
                  '模拟关闭',
                ),
              ],
            )
          : null,
    }),
    Checkbox: Wrap,
    Input,
    InputNumber: Input,
    Select: Input,
    Textarea: Input,
  };
});
const result = { contractId: '', orderId: 'new-order', code: 'CG001' };
const cleanup: (() => void)[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue(result);
  mocks.update.mockResolvedValue(result);
  mocks.order.mockResolvedValue({
    contractId: '',
    companyId: 1,
    details: { subject: '待完善采购', status: 'DRAFT' },
    order: {
      id: 'source-order',
      supplierId: 'supplier-1',
      lines: [
        {
          id: 'line-1',
          skuId: 'product-1',
          quantity: 10,
          unitPrice: 2,
          specificationSnapshot: { skuName: '瑜伽垫' },
        },
      ],
    },
  });
  mocks.contract.mockResolvedValue({
    id: 'contract-1',
    companyId: 1,
    code: 'HT001',
    items: [{ id: 'item-1', skuName: '瑜伽垫', quantity: 10 }],
    requests: [
      {
        id: 'request-1',
        items: [
          {
            id: 'request-line-1',
            contractItemId: 'item-1',
            quantity: 10,
            availableQuantity: '10',
          },
        ],
      },
    ],
  });
});
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));
async function settle() {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
    await nextTick();
  }
}
async function mount(props?: Record<string, unknown>) {
  const editorProps = props ?? {
    copyFrom: { contractId: '', orderId: 'source-order' },
  };
  const saved = vi.fn();
  const close = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(PurchaseOrderEditor, {
        open: true,
        ...editorProps,
        onSaved: saved,
        onClose: close,
      }),
  });
  app.mount(host);
  cleanup.push(() => {
    app.unmount();
    host.remove();
  });
  await settle();
  return { host, saved, close };
}
function button(host: HTMLElement, text: string) {
  const result = [...host.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === text,
  );
  expect(result).toBeDefined();
  return result!;
}
async function fill(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
}

describe('采购开单先保存草稿', () => {
  it('编辑同一申请明细的多个任务来源时，各任务只加回本单自己的占用', async () => {
    mocks.contract.mockResolvedValue({
      id: 'contract-1',
      companyId: 1,
      code: 'HT001',
      items: [{ id: 'item-1', skuName: '瑜伽垫', quantity: 60 }],
      requests: [
        {
          id: 'request-1',
          items: [
            {
              id: 'ri',
              contractItemId: 'item-1',
              quantity: 60,
              availableQuantity: 40,
            },
          ],
        },
      ],
      assignments: ['a', 'b'].map((id) => ({
        id,
        requestId: 'request-1',
        requestItemId: 'ri',
        method: 'BUY',
        availableQuantity: 20,
      })),
    });
    mocks.order.mockResolvedValue({
      contractId: 'contract-1',
      companyId: 1,
      details: { status: 'DRAFT' },
      order: {
        id: 'source-order',
        requestId: 'request-1',
        supplierId: 'supplier-1',
        lines: ['a', 'b'].map((assignmentId) => ({
          id: assignmentId,
          requestItemId: 'ri',
          assignmentId,
          contractItemId: 'item-1',
          quantity: 10,
          unitPrice: 2,
          specificationSnapshot: { skuName: '瑜伽垫' },
        })),
      },
    });
    const { host } = await mount({
      editOf: { contractId: 'contract-1', orderId: 'source-order' },
    });
    expect(host.textContent).toContain('本次最多可转 30');
    await fill(
      host.querySelector<HTMLInputElement>('[aria-label="第1行数量"]')!,
      '30',
    );
    await fill(
      host.querySelector<HTMLInputElement>('[aria-label="第2行数量"]')!,
      '30',
    );
    button(host, '保存草稿').click();
    await settle();
    expect(mocks.update).toHaveBeenCalledWith(
      'contract-1',
      'source-order',
      expect.objectContaining({
        lines: [
          expect.objectContaining({
            requestItemId: 'ri',
            assignmentId: 'a',
            quantity: '30',
          }),
          expect.objectContaining({
            requestItemId: 'ri',
            assignmentId: 'b',
            quantity: '30',
          }),
        ],
      }),
      false,
    );
  });
  it('复制采购单只保存为草稿，留到资料完善后下单', async () => {
    const { host, saved } = await mount();
    expect(
      [...host.querySelectorAll('button')].some(
        (item) => item.textContent?.trim() === '提交下单',
      ),
    ).toBe(false);
    button(host, '保存草稿并完善资料').click();
    await settle();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        submit: false,
        sourceOrderId: 'source-order',
        supplierId: 'supplier-1',
      }),
    );
    expect(saved).toHaveBeenCalledWith(result, 'draft');
  });
  it('申请转采购单保留申请来源并保存草稿', async () => {
    const { host, saved } = await mount({
      contractId: 'contract-1',
      requestId: 'request-1',
    });
    await fill(
      host.querySelector<HTMLInputElement>('[data-supplier]')!,
      'supplier-1',
    );
    await fill(
      host.querySelector<HTMLInputElement>('tbody tr td:nth-child(5) input')!,
      '2',
    );
    button(host, '保存草稿并完善资料').click();
    await settle();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        submit: false,
        requestId: 'request-1',
        contractId: 'contract-1',
        lines: [
          expect.objectContaining({
            contractItemId: 'item-1',
            requestItemId: 'request-line-1',
            quantity: '10',
          }),
        ],
      }),
    );
    expect(saved).toHaveBeenCalledWith(result, 'draft');
  });
  it('只带出可转明细，数量按草稿占用后的余额，超量时不能保存', async () => {
    mocks.contract.mockResolvedValue({
      id: 'contract-1',
      companyId: 1,
      code: 'HT001',
      items: [{ id: 'item-1', skuName: '瑜伽垫', quantity: 100 }],
      requests: [
        {
          id: 'request-1',
          items: [
            {
              id: 'done',
              contractItemId: 'item-1',
              quantity: 100,
              orderedQuantity: 100,
              availableQuantity: 0,
            },
            {
              id: 'partial',
              contractItemId: 'item-1',
              quantity: 100,
              draftReservedQuantity: 40,
              availableQuantity: 60,
            },
          ],
        },
      ],
    });
    const { host } = await mount({
      contractId: 'contract-1',
      requestId: 'request-1',
    });
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1);
    const quantity = host.querySelector<HTMLInputElement>(
      '[aria-label="第1行数量"]',
    )!;
    expect(quantity.value).toBe('60');
    expect(host.textContent).toContain('本次最多可转 60');
    await fill(
      host.querySelector<HTMLInputElement>('[data-supplier]')!,
      'supplier-1',
    );
    await fill(
      host.querySelector<HTMLInputElement>('[aria-label="第1行单价"]')!,
      '2',
    );
    await fill(quantity, '61');
    button(host, '保存草稿并完善资料').click();
    await settle();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(host.textContent).toContain('本次最多可转 60');
    await fill(quantity, '60');
    button(host, '保存草稿并完善资料').click();
    await settle();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'request-1',
        lines: [
          expect.objectContaining({ requestItemId: 'partial', quantity: '60' }),
        ],
      }),
    );
  });
  it('保存期间阻止重复操作和关闭，失败后保留输入及幂等键供重试', async () => {
    let reject!: (error: Error) => void;
    mocks.create.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    const { host, saved, close } = await mount();
    const save = button(host, '保存草稿并完善资料');
    save.click();
    save.click();
    await settle();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(button(host, '取消').disabled).toBe(true);
    expect(host.querySelector('section')?.dataset.closable).toBe('false');
    host.querySelector<HTMLButtonElement>('[data-modal-cancel]')!.click();
    await settle();
    expect(close).not.toHaveBeenCalled();
    reject(new Error('保存失败，请重试'));
    await settle();
    expect(saved).not.toHaveBeenCalled();
    expect(host.textContent).toContain('保存失败，请重试');
    expect(
      host.querySelector<HTMLInputElement>('input[maxlength="200"]')?.value,
    ).toBe('待完善采购');
    save.click();
    await settle();
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.create.mock.calls[1]![0]).toEqual(
      mocks.create.mock.calls[0]![0],
    );
    expect(saved).toHaveBeenCalledWith(result, 'draft');
  });
  it.each([
    [false, '保存草稿', 'draft'],
    [true, '提交下单', 'submitted'],
  ] as const)(
    '编辑草稿 submit=%s 使用明确操作',
    async (submit, label, mode) => {
      const { host, saved } = await mount({
        editOf: { contractId: '', orderId: 'source-order' },
      });
      if (submit) {
        // 第一项日期为采购日期，产品行到货日期是最后一项。
        const arrival = [
          ...host.querySelectorAll<HTMLInputElement>('input[type="date"]'),
        ].at(-1)!;
        arrival.value = '2026-11-20';
        arrival.dispatchEvent(new Event('input'));
        await settle();
      }
      button(host, label).click();
      await settle();
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.update).toHaveBeenCalledWith(
        '',
        'source-order',
        expect.any(Object),
        submit,
      );
      expect(saved).toHaveBeenCalledWith(result, mode);
    },
  );
  it('提交前拦住缺交期，仍可保存草稿', async () => {
    const { host } = await mount({
      editOf: { contractId: '', orderId: 'source-order' },
    });
    button(host, '提交下单').click();
    await settle();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(host.textContent).toContain('提交下单前请填写到货日期');
    button(host, '保存草稿').click();
    await settle();
    expect(mocks.update).toHaveBeenCalledWith(
      '',
      'source-order',
      expect.any(Object),
      false,
    );
  });
});
