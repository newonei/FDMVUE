/* eslint-disable vue/one-component-per-file -- Minimal controls exercise the live document action flow. */
import { createApp, defineComponent, h, nextTick, ref } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FinanceDocument from './FinanceDocument.vue';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  action: vi.fn(),
  create: vi.fn(),
  directory: vi.fn(),
  files: vi.fn(),
  counter: 0,
  pending: [] as File[],
  dirty: false,
  markSaved: vi.fn(),
  confirm: vi.fn(),
  success: vi.fn(),
}));
vi.mock('#/api/fdmplatform', () => ({
  newIdempotencyKey: () => `finance-action-${++mocks.counter}`,
  getDirectory: mocks.directory,
}));
vi.mock('#/api/fdmplatform/procurement-finance', () => ({
  getProcurementFinance: mocks.read,
  getProcurementFinanceFiles: mocks.files,
  downloadProcurementFinanceFile: vi.fn(),
  uploadProcurementFinanceFile: vi.fn(),
}));
vi.mock('#/api/fdmplatform/submissions', () => ({
  procurementFinanceActionWithAttachments: mocks.action,
  createProcurementFinanceWithAttachments: mocks.create,
}));
vi.mock('#/api/fdmplatform/procurement', () => ({
  getProcurementSettings: vi.fn(),
}));
vi.mock('#/api/fdmplatform/business-documents', () => ({
  downloadBusinessDocumentFile: vi.fn(),
}));
vi.mock('@vben/utils', () => ({ formatDate: (value: string) => value }));
vi.mock('./FinanceForm.vue', () => ({
  default: defineComponent({
    props: {
      type: { type: String, default: '' },
      context: { type: Object, default: () => ({}) },
    },
    emits: ['save', 'submit'],
    setup(props, { expose, emit }) {
      expose({ payload: () => ({ name: '申请' }) });
      return () =>
        h(
          'div',
          {
            'data-form-type': props.type,
            'data-form-context': JSON.stringify(props.context),
          },
          [
            h(
              'button',
              {
                'data-save-draft': true,
                onClick: () => emit('save', props.context),
              },
              '保存测试草稿',
            ),
            props.type === 'REQUEST'
              ? h(
                  'button',
                  {
                    'data-submit-request': true,
                    onClick: () => emit('submit', { name: '申请' }),
                  },
                  '表单提交生效',
                )
              : null,
          ],
        );
    },
  }),
}));
vi.mock('./ReimbursementForm.vue', () => ({
  default: defineComponent({
    props: { saving: Boolean },
    emits: ['save', 'submit'],
    setup(props, { expose, emit }) {
      const payload = () => ({
        name: '报销申请',
        expenses: [
          {
            sourceKey: 'line-1',
            amount: '100',
            ...(mocks.pending.length > 0
              ? { evidenceRef: '', evidenceFileIndex: 0 }
              : { evidenceRef: 'saved-voucher' }),
          },
        ],
      });
      expose({
        payload,
        pendingAttachments: () => mocks.pending,
        isDirty: () => mocks.dirty,
        markSaved: () => {
          mocks.markSaved();
          mocks.pending = [];
          mocks.dirty = false;
        },
      });
      return () =>
        h('div', { 'data-reimbursement-form': true }, [
          h('span', '报销申请表单'),
          h(
            'button',
            {
              'data-submit-reimbursement': true,
              disabled: props.saving,
              onClick: () => emit('submit', payload()),
            },
            '提交生效',
          ),
          h(
            'button',
            {
              'data-save-reimbursement': true,
              disabled: props.saving,
              onClick: () => emit('save', payload()),
            },
            '保存报销草稿',
          ),
        ]);
    },
  }),
}));
vi.mock('../../../documents/MigrationSource.vue', () => ({
  default: defineComponent({ render: () => h('div') }),
}));
vi.mock('../../../components/RecordTable.vue', () => ({
  default: defineComponent({
    props: { data: { type: Array, default: () => [] } },
    setup(props, { slots }) {
      return () =>
        h(
          'div',
          props.data.map((record) => slots.action?.({ record })),
        );
    },
  }),
}));
vi.mock('../../../documents/RelatedLink.vue', () => ({
  default: defineComponent({ render: () => h('span') }),
}));
vi.mock('../../../components/CreationAttachments.vue', () => ({
  default: defineComponent({
    props: { files: { type: Array, default: () => [] } },
    emits: ['update:files'],
    setup(props, { emit }) {
      return () =>
        h('div', [
          h(
            'button',
            {
              'data-add-evidence': true,
              onClick: () =>
                emit('update:files', [
                  new File(['evidence'], 'payment-evidence.pdf', {
                    type: 'application/pdf',
                  }),
                ]),
            },
            '补充办理凭据',
          ),
          h(
            'span',
            { 'data-files': true },
            ((props.files ?? []) as File[]).map((file) => file.name).join(','),
          ),
        ]);
    },
  }),
}));
vi.mock('../../../components/ActionDialog.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      definition: { type: Object, default: () => ({ fields: [] }) },
      saving: Boolean,
      error: { type: String, default: '' },
    },
    emits: ['submit', 'close'],
    setup(props, { emit, slots }) {
      return () =>
        props.open
          ? h('section', { 'data-action-dialog': true }, [
              h(
                'div',
                { 'data-fields': true },
                JSON.stringify(props.definition.fields),
              ),
              slots.attachments?.(),
              h('div', props.error),
              h(
                'button',
                {
                  'data-confirm-action': true,
                  onClick: () =>
                    emit(
                      'submit',
                      { reason: '已核验' },
                      'stable-finance-operation',
                    ),
                },
                '确认办理',
              ),
            ])
          : null;
    },
  }),
}));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup(_, { slots, attrs }) {
      return () => h('div', attrs, slots.default?.());
    },
  });
  const descriptions = Object.assign(block, { Item: block });
  return {
    Alert: defineComponent({
      props: { message: { type: String, default: '' } },
      setup(props) {
        return () => h('div', props.message);
      },
    }),
    Button: defineComponent({
      setup(_, { attrs, slots }) {
        return () => h('button', attrs, slots.default?.());
      },
    }),
    Drawer: defineComponent({
      props: { open: Boolean, title: { type: String, default: '' } },
      emits: ['close'],
      setup(props, { slots, emit }) {
        return () =>
          props.open
            ? h('section', { 'data-drawer': true, 'data-title': props.title }, [
                h(
                  'button',
                  { 'data-close-drawer': true, onClick: () => emit('close') },
                  '关闭单据',
                ),
                slots.default?.(),
              ])
            : null;
      },
    }),
    Card: block,
    Descriptions: descriptions,
    Space: block,
    Table: block,
    Tag: block,
    message: { success: mocks.success, warning: vi.fn() },
    Modal: { confirm: mocks.confirm },
  };
});
let unmount: (() => void) | undefined;
function document(status = 'SUBMITTED') {
  let allowedActions: string[] = [];
  if (status === 'DRAFT') allowedActions = ['UPDATE', 'SUBMIT'];
  else if (status === 'SUBMITTED') allowedActions = ['SUBMIT', 'WITHDRAW'];
  return {
    id: 'request',
    version: 4,
    code: 'QK-1',
    name: '申请',
    type: 'REQUEST',
    status,
    allowedActions,
    currency: 'CNY',
    amount: 100,
    summary: {},
    history: [],
    periods: [],
    expenses: [],
    groups: [],
  };
}
async function mount(props: Record<string, unknown> = {}) {
  const host = documentElement();
  const app = createApp(FinanceDocument, {
    open: true,
    type: 'REQUEST',
    recordId: 'request',
    ...props,
  });
  app.mount(host);
  unmount = () => {
    app.unmount();
    host.remove();
  };
  await vi.waitFor(() => expect(host.textContent).toContain('申请'));
  await nextTick();
  return host;
}
function documentElement() {
  const element = globalThis.document.createElement('div');
  globalThis.document.body.append(element);
  return element;
}
function click(host: Element, text: string) {
  const button = [...host.querySelectorAll('button')].find(
    (node) => node.textContent?.trim() === text,
  );
  expect(button).toBeTruthy();
  button!.click();
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.counter = 0;
  mocks.pending = [];
  mocks.dirty = false;
  mocks.read.mockResolvedValue(document());
  mocks.files.mockResolvedValue({ enabled: true, canUpload: false, items: [] });
  mocks.directory.mockResolvedValue({
    users: [{ id: 8, nickname: '申请人' }],
    departments: [],
    companies: [],
  });
  mocks.action.mockResolvedValue({
    ...document(),
    version: 6,
    status: 'APPROVED',
    allowedActions: [],
  });
  mocks.create.mockResolvedValue({
    ...document('DRAFT'),
    id: 'payment',
    type: 'PAYMENT',
    code: 'FK-1',
    allowedActions: ['UPDATE', 'CONFIRM'],
  });
});
describe('专用报销表单保存和提交', () => {
  it('一次点击保存报销与行凭证后提交，使用保存后的版本并展示生效状态，成功不误报关闭未保存', async () => {
    mocks.pending = [new File(['line voucher'], 'taxi.pdf')];
    mocks.dirty = true;
    const saved = {
      ...document('DRAFT'),
      type: 'REIMBURSEMENT',
      id: 'reimbursement-1',
      name: '报销申请',
      version: 7,
    };
    mocks.create.mockResolvedValue(saved);
    mocks.action.mockResolvedValue({
      ...saved,
      version: 8,
      status: 'APPROVED',
      allowedActions: [],
      summary: {
        complete: true,
        paidAmount: '0',
        availablePaymentAmount: '100',
      },
    });
    const closed = vi.fn();
    const host = await mount({
      type: 'REIMBURSEMENT',
      recordId: undefined,
      onClose: closed,
    });
    click(host, '提交生效');
    await vi.waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(1));
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'REIMBURSEMENT',
        payload: expect.objectContaining({
          expenses: [
            expect.objectContaining({
              evidenceFileIndex: 0,
              sourceKey: 'line-1',
            }),
          ],
        }),
      }),
      [expect.objectContaining({ name: 'taxi.pdf' })],
    );
    expect(mocks.action).toHaveBeenCalledWith(
      'reimbursement-1',
      expect.objectContaining({
        action: 'SUBMIT',
        expectedVersion: 7,
        payload: {},
      }),
      [],
    );
    await vi.waitFor(() => expect(host.textContent).toContain('单据已生效'));
    expect(
      host.querySelector<HTMLElement>('[data-submit-reimbursement]'),
    ).toBeNull();
    await vi.waitFor(() =>
      expect(mocks.success).toHaveBeenCalledWith(
        expect.stringContaining('单据已生效'),
      ),
    );
    (
      host.querySelector<HTMLElement>(
        '[data-close-drawer]',
      ) as HTMLButtonElement
    ).click();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it('保存失败保留行附件与幂等键，重复点击只提交一次，重试不会跳过保存直接生效', async () => {
    const attachment = new File(['voucher'], 'invoice.pdf');
    mocks.pending = [attachment];
    mocks.dirty = true;
    let rejectSave!: (reason: Error) => void;
    mocks.create.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectSave = reject;
        }),
    );
    const host = await mount({ type: 'REIMBURSEMENT', recordId: undefined });
    click(host, '提交生效');
    await nextTick();
    click(host, '提交生效');
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.action).not.toHaveBeenCalled();
    rejectSave(new Error('附件存储暂时不可用'));
    await vi.waitFor(() =>
      expect(host.textContent).toContain('附件存储暂时不可用'),
    );
    expect(mocks.pending).toEqual([attachment]);
    expect(mocks.markSaved).not.toHaveBeenCalled();
    mocks.create.mockRejectedValueOnce(new Error('仍不可用'));
    click(host, '提交生效');
    await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
    expect(mocks.action).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(host.textContent).toContain('仍不可用'));
    (
      host.querySelector<HTMLElement>(
        '[data-close-drawer]',
      ) as HTMLButtonElement
    ).click();
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('尚未保存') }),
    );
  });
  it('办理按钮依据服务端动作，付款信息缺失不会显示零或开放付款', async () => {
    mocks.read.mockResolvedValue({
      ...document('SUBMITTED'),
      type: 'REIMBURSEMENT',
      allowedActions: [],
      summary: {
        complete: false,
        paidAmount: null,
        availablePaymentAmount: null,
      },
      name: '报销申请',
    });
    const host = await mount({ type: 'REIMBURSEMENT' });
    expect(host.textContent).toContain('付款资料待核实');
    expect(host.textContent).toContain('待核实');
    expect(host.textContent).not.toContain('登记本次付款');
    expect(host.textContent).not.toContain('审核通过');
  });
  it('保存成功但提交失败时保留最新草稿，重试复用已上传凭据并使用新保存版本', async () => {
    mocks.pending = [new File(['voucher'], 'taxi.pdf')];
    mocks.dirty = true;
    const saved = {
      ...document('DRAFT'),
      type: 'REIMBURSEMENT',
      id: 'reimbursement-1',
      name: '报销申请',
      version: 7,
      expenses: [{ evidenceRef: 'saved-voucher' }],
    };
    mocks.create.mockResolvedValue(saved);
    mocks.action.mockRejectedValueOnce(new Error('服务暂时不可用，请重试'));
    const host = await mount({ type: 'REIMBURSEMENT', recordId: undefined });
    click(host, '提交生效');
    await vi.waitFor(() =>
      expect(host.textContent).toContain('服务暂时不可用，请重试'),
    );
    expect(mocks.markSaved).toHaveBeenCalledTimes(1);
    expect(mocks.pending).toEqual([]);
    expect(
      host.querySelector<HTMLElement>('[data-reimbursement-form]'),
    ).toBeTruthy();
    mocks.action.mockImplementation(async (_id, body) => ({
      ...saved,
      version: body.action === 'UPDATE' ? 8 : 9,
      status: body.action === 'UPDATE' ? 'DRAFT' : 'APPROVED',
      allowedActions: body.action === 'UPDATE' ? ['UPDATE', 'SUBMIT'] : [],
    }));
    click(host, '提交生效');
    await vi.waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(3));
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.action.mock.calls[1]).toEqual([
      'reimbursement-1',
      expect.objectContaining({
        action: 'UPDATE',
        expectedVersion: 7,
        payload: expect.objectContaining({
          expenses: [expect.objectContaining({ evidenceRef: 'saved-voucher' })],
        }),
      }),
      [],
    ]);
    expect(mocks.action.mock.calls[2]).toEqual([
      'reimbursement-1',
      expect.objectContaining({
        action: 'SUBMIT',
        expectedVersion: 8,
        payload: {},
      }),
      [],
    ]);
  });
  it('切换单据后迟到的保存和生效响应不会覆盖当前详情或继续提交旧单', async () => {
    let finishSave!: (value: ReturnType<typeof document>) => void;
    let finishSubmit!: (value: ReturnType<typeof document>) => void;
    mocks.create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSave = resolve;
        }),
    );
    const selected = ref<string>();
    const updated = vi.fn();
    const host = documentElement();
    const app = createApp(
      defineComponent({
        setup: () => () =>
          h(FinanceDocument, {
            open: true,
            type: 'REIMBURSEMENT',
            recordId: selected.value,
            onUpdated: updated,
          }),
      }),
    );
    app.mount(host);
    unmount = () => {
      app.unmount();
      host.remove();
    };
    await nextTick();
    click(host, '提交生效');
    await nextTick();
    mocks.read.mockResolvedValue({
      ...document(),
      type: 'REIMBURSEMENT',
      id: 'second',
      name: '另一张报销',
    });
    selected.value = 'second';
    await vi.waitFor(() => expect(host.textContent).toContain('另一张报销'));
    finishSave({
      ...document('DRAFT'),
      id: 'old-created',
      name: '旧草稿',
      type: 'REIMBURSEMENT',
    });
    await nextTick();
    await nextTick();
    expect(host.textContent).toContain('另一张报销');
    expect(host.textContent).not.toContain('旧草稿');
    expect(mocks.action).not.toHaveBeenCalled();
    expect(updated).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(
        [...host.querySelectorAll('button')].find(
          (button) => button.textContent?.trim() === '提交生效',
        )?.disabled,
      ).toBe(false),
    );
    mocks.action.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSubmit = resolve;
        }),
    );
    click(host, '提交生效');
    await nextTick();
    mocks.read.mockResolvedValue({
      ...document(),
      type: 'REIMBURSEMENT',
      id: 'third',
      name: '当前报销',
    });
    selected.value = 'third';
    await vi.waitFor(() => expect(host.textContent).toContain('当前报销'));
    finishSubmit({
      ...document('APPROVED'),
      type: 'REIMBURSEMENT',
      id: 'second',
      name: '已完成的上一张',
    });
    await nextTick();
    await nextTick();
    expect(host.textContent).toContain('当前报销');
    expect(host.textContent).not.toContain('已完成的上一张');
    expect(updated).not.toHaveBeenCalled();
  });
});

describe('财务关联单据在原详情内办理', () => {
  it('采购请款直接打开付款子弹窗，带入来源与余额，保存刷新父单而不覆盖为付款记录', async () => {
    const source = {
      ...document('APPROVED'),
      allowedActions: [],
      contractId: 'contract-1',
      orderId: 'order-1',
      payerEntityId: 'payer-1',
      payeeName: '工厂',
      payeeAccount: '账户',
      summary: { availablePaymentAmount: '80.50' },
    };
    mocks.read.mockResolvedValue(source);
    const updated = vi.fn();
    const host = await mount({ onUpdated: updated });
    click(host, '登记本次付款');
    await nextTick();
    expect(host.querySelectorAll('[data-drawer]')).toHaveLength(2);
    const form = host.querySelector<HTMLElement>('[data-form-type="PAYMENT"]')!;
    expect(JSON.parse(form.dataset.formContext!)).toEqual({
      sourceDocumentId: 'request',
      contractId: 'contract-1',
      orderId: 'order-1',
      payerEntityId: 'payer-1',
      currency: 'CNY',
      amount: '80.50',
      payeeName: '工厂',
      payeeAccount: '账户',
    });
    mocks.read.mockResolvedValue({
      ...source,
      summary: { availablePaymentAmount: '0' },
    });
    (
      form.querySelector<HTMLElement>('[data-save-draft]') as HTMLButtonElement
    ).click();
    await vi.waitFor(() =>
      expect(updated).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'request' }),
      ),
    );
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'PAYMENT',
        payload: expect.objectContaining({ sourceDocumentId: 'request' }),
      }),
      [],
    );
    expect(updated).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: 'payment' }),
    );
    expect(
      host.querySelector<HTMLElement>('[data-title="采购请款单 · QK-1"]'),
    ).toBeTruthy();
    const child = host.querySelector<HTMLElement>(
      '[data-title="采购付款记录 · FK-1"]',
    )!;
    (
      child.querySelector<HTMLElement>(
        '[data-close-drawer]',
      ) as HTMLButtonElement
    ).click();
    await nextTick();
    expect(host.querySelectorAll('[data-drawer]')).toHaveLength(1);
    expect(host.textContent).not.toContain('登记本次付款');
  });

  it('合同中嵌入的报销详情无需外部 create 监听即可新建付款及成本分配', async () => {
    mocks.read.mockResolvedValue({
      ...document('APPROVED'),
      type: 'REIMBURSEMENT',
      allowedActions: [],
      contractId: 'contract-1',
      orderId: '',
      summary: {
        complete: true,
        paidAmount: '0',
        availablePaymentAmount: '100',
      },
    });
    const host = await mount({ type: 'REIMBURSEMENT' });
    click(host, '登记本次付款');
    await nextTick();
    expect(
      host.querySelector<HTMLElement>('[data-form-type="PAYMENT"]'),
    ).toBeTruthy();
    (
      host.querySelectorAll('[data-close-drawer]')[1] as HTMLButtonElement
    ).click();
    await nextTick();
    click(host, '新建报销成本分配');
    await nextTick();
    const form = host.querySelector<HTMLElement>(
      '[data-form-type="COST_ALLOCATION"]',
    )!;
    expect(JSON.parse(form.dataset.formContext!)).toEqual({
      sourceType: 'REIMBURSEMENT',
      sourceDocumentId: 'request',
      contractId: 'contract-1',
      orderId: '',
      currency: 'CNY',
      costScope: 'ORDER',
    });
    expect(
      host.querySelector<HTMLElement>('[data-title="费用报销单 · QK-1"]'),
    ).toBeTruthy();
  });

  it('已确认付款计划发起本期请款，保留期次与尚可请款金额', async () => {
    mocks.read.mockResolvedValue({
      ...document('CONFIRMED'),
      type: 'PAYMENT_PLAN',
      allowedActions: [],
      contractId: 'contract-1',
      orderId: 'order-1',
      periods: [
        {
          id: 'period-2',
          name: '尾款',
          payerEntityId: 'payer-2',
          amount: '100',
          availableRequestAmount: '35',
        },
      ],
    });
    const host = await mount({ type: 'PAYMENT_PLAN' });
    click(host, '发起本期请款');
    await nextTick();
    const form = host.querySelector<HTMLElement>('[data-form-type="REQUEST"]')!;
    expect(JSON.parse(form.dataset.formContext!)).toEqual({
      contractId: 'contract-1',
      orderId: 'order-1',
      currency: 'CNY',
      planId: 'request',
      periodId: 'period-2',
      payerEntityId: 'payer-2',
      amount: '35',
      name: '尾款',
    });
    expect(host.querySelectorAll('[data-drawer]')).toHaveLength(2);
    expect(
      host.querySelector<HTMLElement>('[data-title="付款计划 · QK-1"]'),
    ).toBeTruthy();
  });
});
afterEach(() => {
  unmount?.();
  unmount = undefined;
});
describe('采购财务直接生效与历史单据兼容', () => {
  it('旧待审请款直接提交生效，不打开审核弹窗或请求处理人', async () => {
    const host = await mount();
    click(host, '提交生效');
    await vi.waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(1));
    expect(mocks.action).toHaveBeenCalledWith(
      'request',
      expect.objectContaining({
        action: 'SUBMIT',
        expectedVersion: 4,
        payload: {},
      }),
      [],
    );
    expect(host.querySelector<HTMLElement>('[data-action-dialog]')).toBeNull();
    expect(mocks.directory).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(mocks.success).toHaveBeenCalledWith(
        expect.stringContaining('单据已生效'),
      ),
    );
  });
  it('请款草稿提交先保存最新资料，再直接生效，不传递处理人', async () => {
    mocks.read.mockResolvedValue(document('DRAFT'));
    mocks.action.mockImplementation(async (_id, body) => ({
      ...document('DRAFT'),
      version: body.action === 'UPDATE' ? 5 : 6,
      status: body.action === 'UPDATE' ? 'DRAFT' : 'APPROVED',
      allowedActions: body.action === 'UPDATE' ? ['UPDATE', 'SUBMIT'] : [],
    }));
    const host = await mount();
    click(host, '提交生效');
    await vi.waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(2));
    expect(mocks.action.mock.calls[0]![1].action).toBe('UPDATE');
    expect(mocks.action.mock.calls[1]![1]).toMatchObject({
      action: 'SUBMIT',
      expectedVersion: 5,
      payload: {},
    });
    expect(mocks.action.mock.calls[1]![1].payload).not.toHaveProperty(
      'handlerUserId',
    );
    expect(mocks.directory).not.toHaveBeenCalled();
    expect(host.querySelector<HTMLElement>('[data-action-dialog]')).toBeNull();
  });
  it('请款表单的提交生效入口复用保存与流转，无审核弹窗', async () => {
    mocks.read.mockResolvedValue(document('DRAFT'));
    mocks.action.mockImplementation(async (_id, body) => ({
      ...document('DRAFT'),
      version: body.action === 'UPDATE' ? 5 : 6,
      status: body.action === 'UPDATE' ? 'DRAFT' : 'APPROVED',
      allowedActions: body.action === 'UPDATE' ? ['UPDATE', 'SUBMIT'] : [],
    }));
    const host = await mount();
    click(host, '表单提交生效');
    await vi.waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(2));
    expect(mocks.action.mock.calls[0]![1]).toMatchObject({
      action: 'UPDATE',
      payload: { name: '申请' },
    });
    expect(mocks.action.mock.calls[1]![1]).toMatchObject({
      action: 'SUBMIT',
      expectedVersion: 5,
      payload: {},
    });
    expect(mocks.directory).not.toHaveBeenCalled();
    expect(host.querySelector<HTMLElement>('[data-action-dialog]')).toBeNull();
  });
  it('旧服务端返回的审核动作不再显示，付款确认仍保留办理凭证与失败重试', async () => {
    mocks.read.mockResolvedValue({
      ...document('CONFIRMED'),
      type: 'PAYMENT',
      allowedActions: ['APPROVE', 'REJECT', 'REVERSE'],
    });
    const host = await mount({ type: 'PAYMENT' });
    expect(host.textContent).not.toContain('历史批准');
    expect(host.textContent).not.toContain('历史退回');
    click(host, '退款 / 冲销');
    await nextTick();
    expect(
      host.querySelector<HTMLElement>('[data-action-dialog]'),
    ).toBeTruthy();
    (
      host.querySelector<HTMLElement>(
        '[data-add-evidence]',
      ) as HTMLButtonElement
    ).click();
    await nextTick();
    mocks.action.mockRejectedValueOnce(new Error('临时失败'));
    (
      host.querySelector<HTMLElement>(
        '[data-confirm-action]',
      ) as HTMLButtonElement
    ).click();
    await vi.waitFor(() => expect(host.textContent).toContain('临时失败'));
    expect(host.textContent).toContain('payment-evidence.pdf');
    (
      host.querySelector<HTMLElement>(
        '[data-confirm-action]',
      ) as HTMLButtonElement
    ).click();
    await vi.waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(2));
    const first = mocks.action.mock.calls[0]!;
    const retry = mocks.action.mock.calls[1]!;
    expect(first[1]).toMatchObject({
      action: 'REVERSE',
      expectedVersion: 4,
      idempotencyKey: 'stable-finance-operation',
    });
    expect(first[2][0].name).toBe('payment-evidence.pdf');
    expect(retry[1]).toEqual(first[1]);
    expect(retry[2]).toEqual(first[2]);
  });
});
