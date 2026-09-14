/* eslint-disable vue/one-component-per-file -- Minimal UI adapters expose the actual business form behavior without Ant Design overlays. */
import type { Component, PropType } from 'vue';

import type { ActionDefinition } from '../data';

import {
  createApp,
  defineComponent,
  h,
  nextTick,
  reactive,
  ref,
  toRaw,
} from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ContractEditor from '../products/components/ContractEditor.vue';
import CustomerEditor from '../trade/customers/CustomerEditor.vue';
import ActionDialog from './ActionDialog.vue';
import CreationAttachments from './CreationAttachments.vue';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  getAccess: vi.fn(),
  resolve: vi.fn(),
  getCustomers: vi.fn(),
  getCustomer: vi.fn(),
  getCustomerOptions: vi.fn(),
  saveCustomer: vi.fn(),
  counter: 0,
}));
vi.mock('#/api/fdmplatform', () => ({
  getAccess: mocks.getAccess,
  getAttachments: vi.fn().mockResolvedValue({ items: [] }),
  newIdempotencyKey: () => `test-operation-${++mocks.counter}`,
}));
vi.mock('#/api/fdmplatform/submissions', () => ({
  createContractWithAttachments: mocks.create,
  contractActionWithAttachments: mocks.update,
}));
vi.mock('#/api/fdmplatform/products', () => ({
  resolveProducts: mocks.resolve,
}));
vi.mock('#/api/fdmplatform/customers', () => ({
  getCustomers: mocks.getCustomers,
  getCustomer: mocks.getCustomer,
  getCustomerOptions: mocks.getCustomerOptions,
  saveCustomer: mocks.saveCustomer,
}));
vi.mock('../products/components/ProductPicker.vue', () => ({
  default: defineComponent({
    props: { open: Boolean },
    emits: ['selected'],
    setup(props, { emit }) {
      return () =>
        props.open
          ? h(
              'button',
              {
                'data-select-product': true,
                onClick: () => emit('selected', [{ id: 'sku-a', version: 0 }]),
              },
              '选择测试产品',
            )
          : null;
    },
  }),
}));
vi.mock('../finance/exchange-rates/ReceiptFxPreview.vue', () => ({
  default: defineComponent({ render: () => h('div') }),
}));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup(_, ctx) {
      return () => h('div', ctx.attrs, ctx.slots.default?.());
    },
  });
  const item = defineComponent({
    props: { label: { type: String, default: '' } },
    setup(props, ctx) {
      return () =>
        h('label', { 'data-label': props.label }, [
          props.label,
          ctx.slots.default?.(),
        ]);
    },
  });
  const input = defineComponent({
    props: {
      value: { type: [String, Number, Boolean, Array], default: undefined },
      disabled: Boolean,
    },
    emits: ['update:value'],
    setup(props, ctx) {
      return () =>
        h('input', {
          ...ctx.attrs,
          value: props.value,
          disabled: props.disabled,
          onInput: (event: Event) =>
            ctx.emit('update:value', (event.target as HTMLInputElement).value),
        });
    },
  });
  const select = defineComponent({
    props: {
      value: { type: [String, Number, Boolean, Array], default: undefined },
      options: {
        type: Array as PropType<{ label: string; value: unknown }[]>,
        default: () => [],
      },
      disabled: Boolean,
    },
    emits: ['update:value'],
    setup(props, ctx) {
      return () =>
        h(
          'select',
          {
            value: props.value,
            disabled: props.disabled,
            onChange: (event: Event) => {
              const value = (event.target as HTMLSelectElement).value;
              ctx.emit(
                'update:value',
                props.options?.find(
                  (option: { value: unknown }) =>
                    String(option.value) === value,
                )?.value ?? value,
              );
            },
          },
          [
            h('option', { value: '' }, ''),
            ...(props.options ?? []).map(
              (option: { label: string; value: unknown }) =>
                h('option', { value: option.value }, option.label),
            ),
          ],
        );
    },
  });
  const button = defineComponent({
    props: { disabled: Boolean, loading: Boolean },
    setup(props, ctx) {
      return () =>
        h(
          'button',
          { ...ctx.attrs, disabled: props.disabled || props.loading },
          ctx.slots.default?.(),
        );
    },
  });
  const modal = defineComponent({
    props: {
      open: Boolean,
      closable: { type: Boolean, default: true },
      confirmLoading: Boolean,
    },
    emits: ['ok', 'cancel'],
    setup(props, ctx) {
      return () =>
        props.open
          ? h('section', {}, [
              ctx.slots.default?.(),
              h(
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
                  disabled: props.closable === false,
                  onClick: () => ctx.emit('cancel'),
                },
                '取消',
              ),
            ])
          : null;
    },
  });
  const drawer = defineComponent({
    props: { open: Boolean, closable: { type: Boolean, default: true } },
    emits: ['close'],
    setup(props, ctx) {
      return () =>
        props.open
          ? h('section', {}, [
              h(
                'button',
                {
                  'data-close': true,
                  disabled: props.closable === false,
                  onClick: () => ctx.emit('close'),
                },
                '关闭',
              ),
              ctx.slots.default?.(),
              ctx.slots.footer?.(),
            ])
          : null;
    },
  });
  const table = defineComponent({
    props: { dataSource: { type: Array, default: () => [] } },
    setup(props) {
      return () => h('div', {}, JSON.stringify(props.dataSource ?? []));
    },
  });
  return {
    Alert: defineComponent({
      props: { message: { type: String, default: '' } },
      setup(props) {
        return () => h('div', {}, props.message);
      },
    }),
    AutoComplete: input,
    Button: button,
    Card: block,
    Checkbox: input,
    Collapse: Object.assign(block, { Panel: block }),
    Descriptions: Object.assign(block, { Item: item }),
    Drawer: drawer,
    Empty: block,
    Form: Object.assign(block, { Item: item }),
    Input: Object.assign(input, { TextArea: input }),
    InputNumber: input,
    Modal: Object.assign(modal, {
      confirm: vi.fn((options: { onOk: () => void }) => options.onOk()),
    }),
    Select: select,
    Space: block,
    Switch: input,
    Table: table,
    Tag: block,
    Textarea: input,
    message: { success: vi.fn(), info: vi.fn() },
  };
});
const disposals: (() => void)[] = [];
function mount(
  component: Component,
  props: Record<string, unknown>,
  slots?: Record<string, () => unknown>,
) {
  const values = reactive(props);
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(component, values, slots) });
  app.mount(host);
  disposals.push(() => {
    app.unmount();
    host.remove();
  });
  return { host, props: values };
}
async function fill(host: HTMLElement, label: string, value: string) {
  const input = host.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[data-label="${label}"] input,[data-label="${label}"] select`,
  )!;
  expect(input).toBeTruthy();
  input.value = value;
  input.dispatchEvent(
    new Event(input.tagName === 'SELECT' ? 'change' : 'input', {
      bubbles: true,
    }),
  );
  await nextTick();
}
async function attach(host: HTMLElement, file: File) {
  const input = host.querySelector<HTMLInputElement>(
    '[aria-label="选择单据附件"]',
  )!;
  expect(input).toBeTruthy();
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await nextTick();
}
function clickText(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll('button')].find((entry) =>
    entry.textContent?.includes(text),
  );
  expect(button).toBeTruthy();
  button!.click();
}
async function newContract(category: string | undefined = 'YOGA') {
  const saved = vi.fn();
  const closed = vi.fn();
  const view = mount(ContractEditor, {
    open: false,
    master: [
      { id: 'customer', name: '测试客户', type: 'CUSTOMER', active: true },
    ],
    directory: {
      users: [{ id: 7, name: '测试用户' }],
      departments: [],
      companies: [],
    },
    onSaved: saved,
    onClose: closed,
  });
  view.props.open = true;
  await vi.waitFor(() =>
    expect(
      view.host.querySelector(
        '[data-label="订单所属公司"] select option[value="1"]',
      ),
    ).toBeTruthy(),
  );
  await fill(view.host, '订单所属公司', '1');
  await fill(view.host, '合同名称', '含附件的测试合同');
  await fill(view.host, '客户', 'customer');
  if (category) await fill(view.host, '产品分类', category);
  clickText(view.host, '产品中心');
  await nextTick();
  view.host.querySelector<HTMLButtonElement>('[data-select-product]')!.click();
  await vi.waitFor(() => expect(mocks.resolve).toHaveBeenCalled());
  await nextTick();
  return { ...view, saved, closed };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockReset();
  mocks.update.mockReset();
  mocks.counter = 0;
  mocks.getCustomerOptions.mockReset().mockResolvedValue({
    countries: [
      { code: 'CN', nameZh: '中国', nameEn: 'China', iso3: 'CHN' },
      { code: 'US', nameZh: '美国', nameEn: 'United States', iso3: 'USA' },
    ],
    productCategories: [],
  });
  mocks.saveCustomer.mockReset();
  mocks.getCustomers.mockReset().mockResolvedValue({
    list: [
      {
        id: 'customer',
        code: 'C-1',
        name: '测试客户',
        type: 'CUSTOMER',
        active: true,
      },
    ],
    total: 1,
  });
  mocks.getCustomer.mockReset();
  mocks.getAccess.mockResolvedValue({
    userId: 7,
    companies: [{ companyId: 1, companyName: '测试公司' }],
  });
  mocks.resolve.mockResolvedValue([
    {
      skuId: 'sku-a',
      skuCode: 'SKU-1',
      skuName: '测试产品',
      productVersion: 0,
      specification: '规格',
      unit: '张',
      quantity: '1',
      unitPrice: '10',
      attachmentIds: [],
    },
  ]);
});
afterEach(() => {
  while (disposals.length > 0) disposals.pop()!();
});
describe('business creation attachment queues', () => {
  it('requires an explicit product category and sends the selected value without a default', async () => {
    const view = await newContract('');
    const select = view.host.querySelector<HTMLSelectElement>(
      '[data-label="产品分类"] select',
    )!;
    expect(select.value).toBe('');
    expect(
      [...select.options]
        .filter((option) => option.value)
        .map((option) => option.value),
    ).toEqual(['YOGA', 'MOUSEPAD_MAT', 'FITNESS', 'ARCHERY']);
    clickText(view.host, '保存草稿');
    await nextTick();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(view.host.textContent).toContain('请选择合同产品分类');
    mocks.create.mockResolvedValueOnce({ id: 'created' });
    await fill(view.host, '产品分类', 'ARCHERY');
    clickText(view.host, '保存草稿');
    await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(mocks.create.mock.calls[0]![0].productCategory).toBe('ARCHERY');
  });
  it('keeps an existing category and clears it when reopening a historical unclassified contract', async () => {
    const view = mount(ContractEditor, {
      open: false,
      master: [],
      contract: { id: 'one', productCategory: 'FITNESS', items: [] },
    });
    view.props.open = true;
    await nextTick();
    expect(
      view.host.querySelector<HTMLSelectElement>(
        '[data-label="产品分类"] select',
      )?.value,
    ).toBe('FITNESS');
    view.props.open = false;
    await nextTick();
    view.props.contract = { id: 'old', items: [] };
    view.props.open = true;
    await nextTick();
    expect(
      view.host.querySelector<HTMLSelectElement>(
        '[data-label="产品分类"] select',
      )?.value,
    ).toBe('');
    expect(view.host.textContent).not.toContain('默认瑜伽');
  });
  it('loads customer options by server page and resolves an existing customer outside that page', async () => {
    mocks.getCustomers.mockResolvedValue({ list: [], total: 3825 });
    mocks.getCustomer.mockResolvedValue({
      id: 'outside',
      code: 'C-3825',
      name: '跨页已选客户',
      type: 'CUSTOMER',
      active: true,
    });
    const view = mount(ContractEditor, {
      open: false,
      master: [],
      contract: { id: 'c1', version: 0, customerId: 'outside', items: [] },
    });
    view.props.open = true;
    await vi.waitFor(() =>
      expect(mocks.getCustomer).toHaveBeenCalledWith('outside'),
    );
    await vi.waitFor(() =>
      expect(view.host.textContent).toContain('跨页已选客户'),
    );
    expect(mocks.getCustomers).toHaveBeenCalledWith({
      active: true,
      keyword: undefined,
      pageNo: 1,
      pageSize: 30,
    });
    expect(
      view.host.querySelector<HTMLSelectElement>('[data-label="客户"] select')
        ?.value,
    ).toBe('outside');
  });
  it('does not let the customer request from a closed editor overwrite the reopened contract', async () => {
    let finishOld!: (value: unknown) => void;
    mocks.getCustomers.mockReturnValueOnce(
      new Promise((resolve) => {
        finishOld = resolve;
      }),
    );
    const view = mount(ContractEditor, {
      open: false,
      master: [],
      contract: { id: 'c1', version: 0, customerId: 'old', items: [] },
    });
    view.props.open = true;
    await vi.waitFor(() => expect(mocks.getCustomers).toHaveBeenCalledOnce());
    view.props.open = false;
    await nextTick();
    view.props.contract = {
      id: 'c2',
      version: 0,
      customerId: 'customer',
      items: [],
    };
    view.props.open = true;
    await vi.waitFor(() => expect(view.host.textContent).toContain('测试客户'));
    finishOld({
      list: [{ id: 'old', code: 'OLD', name: '已过时客户', active: true }],
      total: 1,
    });
    await nextTick();
    await nextTick();
    expect(view.host.textContent).not.toContain('已过时客户');
    expect(
      view.host.querySelector<HTMLSelectElement>('[data-label="客户"] select')
        ?.value,
    ).toBe('customer');
    expect(mocks.getCustomer).not.toHaveBeenCalled();
  });
  it('submits a new contract with its files and preserves the input, files and same operation key after failure', async () => {
    mocks.create
      .mockRejectedValueOnce(new Error('模拟保存失败'))
      .mockResolvedValueOnce({ id: 'created', code: 'HT-1' });
    const view = await newContract();
    const file = new File(['test'], '合同资料.pdf', {
      type: 'application/pdf',
    });
    await attach(view.host, file);
    clickText(view.host, '保存草稿');
    await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(view.host.textContent).toContain('模拟保存失败'),
    );
    expect(view.host.textContent).toContain(file.name);
    expect(
      view.host.querySelector<HTMLInputElement>('[data-label="合同名称"] input')
        ?.value,
    ).toBe('含附件的测试合同');
    const [firstBody, firstFiles] = mocks.create.mock.calls[0]!;
    expect(firstBody.name).toBe('含附件的测试合同');
    expect(firstBody.items).toHaveLength(1);
    expect(toRaw(firstFiles[0])).toBe(file);
    clickText(view.host, '保存草稿');
    await vi.waitFor(() => expect(view.saved).toHaveBeenCalledOnce());
    expect(mocks.create.mock.calls[1]![0].idempotencyKey).toBe(
      firstBody.idempotencyKey,
    );
    expect(toRaw(mocks.create.mock.calls[1]![1][0])).toBe(file);
    expect(view.closed).toHaveBeenCalledOnce();
  });
  it('disables closing and file edits while contract plus attachments are saving', async () => {
    let resolve!: (value: unknown) => void;
    mocks.create.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const view = await newContract();
    await attach(
      view.host,
      new File(['test'], '合同.pdf', { type: 'application/pdf' }),
    );
    clickText(view.host, '保存草稿');
    await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    const close = view.host.querySelector<HTMLButtonElement>('[data-close]')!;
    expect(close.disabled).toBe(true);
    expect(
      view.host.querySelector<HTMLInputElement>('[aria-label="选择单据附件"]')
        ?.disabled,
    ).toBe(true);
    close.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(view.closed).not.toHaveBeenCalled();
    resolve({ id: 'created' });
    await vi.waitFor(() => expect(view.saved).toHaveBeenCalledOnce());
  });
  it('requires existing evidence when no files are queued and accepts an uploaded replacement without inventing a file ID', async () => {
    const submit = vi.fn();
    const queue = ref<File[]>([]);
    const props = reactive<{
      definition: ActionDefinition;
      open: boolean;
      saving: boolean;
    }>({
      open: false,
      saving: false,
      definition: {
        action: 'CREATE_COST',
        title: '登记成本',
        description: '核对金额，并选择已有凭据或添加本次附件。',
        fields: [
          { key: 'amount', label: '金额', type: 'decimal', required: true },
          {
            key: 'evidenceRef',
            label: '凭据',
            type: 'reference',
            required: true,
          },
        ],
        initialValues: { amount: '12' },
      },
    });
    const view = mount(
      defineComponent({
        render: () =>
          h(
            ActionDialog,
            {
              ...props,
              evidenceReady: queue.value.length > 0,
              onSubmit: submit,
            },
            {
              attachments: () =>
                h(CreationAttachments, {
                  files: queue.value,
                  'onUpdate:files': (value: File[]) => {
                    queue.value = value;
                  },
                }),
            },
          ),
      }),
      {},
    );
    props.open = true;
    await nextTick();
    view.host.querySelector<HTMLButtonElement>('[data-submit]')!.click();
    await nextTick();
    expect(submit).not.toHaveBeenCalled();
    expect(view.host.textContent).toContain('请填写凭据');
    await attach(
      view.host,
      new File(['proof'], '费用.pdf', { type: 'application/pdf' }),
    );
    view.host.querySelector<HTMLButtonElement>('[data-submit]')!.click();
    await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0]![0]).toEqual({ amount: '12' });
    expect(submit.mock.calls[0]![1]).toBeTruthy();
  });
  it('does not use queued evidence to bypass unrelated required business fields', async () => {
    const submit = vi.fn();
    const view = mount(ActionDialog, {
      open: false,
      saving: false,
      evidenceReady: true,
      definition: {
        action: 'CREATE_COST',
        title: '成本',
        fields: [
          { key: 'amount', label: '金额', type: 'decimal', required: true },
          {
            key: 'evidenceRef',
            label: '凭据',
            type: 'reference',
            required: true,
          },
        ],
      },
      onSubmit: submit,
    });
    view.props.open = true;
    await nextTick();
    view.host.querySelector<HTMLButtonElement>('[data-submit]')!.click();
    await nextTick();
    expect(submit).not.toHaveBeenCalled();
    expect(view.host.textContent).toContain('请填写金额');
  });
});

describe('customer identity and fixed country selection', () => {
  async function customerEditor(customer?: Record<string, unknown>) {
    const closed = vi.fn();
    const view = mount(CustomerEditor, {
      open: true,
      customer,
      onClose: closed,
    });
    await vi.waitFor(() =>
      expect(
        view.host.querySelector(
          '[data-label="国家 / 地区"] option[value="US"]',
        ),
      ).toBeTruthy(),
    );
    return { ...view, closed };
  }
  it('creates a customer without a caller-supplied code and preserves company and business source separately', async () => {
    const view = await customerEditor();
    const code = view.host.querySelector<HTMLInputElement>(
      '[data-label="客户编号"] input',
    )!;
    expect(code.readOnly).toBe(true);
    expect(code.placeholder).toBe('首次保存后自动生成');
    await fill(view.host, '客户全称', '测试客户');
    await fill(view.host, '客户来源', '展会');
    await fill(view.host, '公司名称', '测试公司');
    clickText(view.host, '保存客户');
    await nextTick();
    expect(mocks.saveCustomer).not.toHaveBeenCalled();
    expect(view.host.textContent).toContain('国家 / 地区列表');
    await fill(view.host, '国家 / 地区', 'US');
    mocks.saveCustomer.mockResolvedValueOnce({
      id: 'new',
      code: 'KH-generated',
    });
    clickText(view.host, '保存客户');
    await vi.waitFor(() => expect(mocks.saveCustomer).toHaveBeenCalledOnce());
    expect(mocks.saveCustomer.mock.calls[0]![0]).toMatchObject({
      name: '测试客户',
      customerSource: '展会',
      companyName: '测试公司',
      country: 'US',
    });
    expect(mocks.saveCustomer.mock.calls[0]![0]).not.toHaveProperty('code');
    expect(mocks.saveCustomer.mock.calls[0]![0]).not.toHaveProperty(
      'sourceSystem',
    );
  });
  it('shows a legacy country verbatim but rejects saving until a valid country is chosen', async () => {
    const view = await customerEditor({
      id: 'legacy',
      name: '旧客户',
      code: 'OLD-1',
      country: '原始自定义地区',
      version: 0,
    });
    expect(view.host.textContent).toContain('原记录国家：原始自定义地区');
    clickText(view.host, '保存客户');
    await nextTick();
    expect(mocks.saveCustomer).not.toHaveBeenCalled();
    await fill(view.host, '国家 / 地区', 'CN');
    mocks.saveCustomer.mockResolvedValueOnce({ id: 'legacy' });
    clickText(view.host, '保存客户');
    await vi.waitFor(() => expect(mocks.saveCustomer).toHaveBeenCalledOnce());
    expect(mocks.saveCustomer.mock.calls[0]![0]).toMatchObject({
      id: 'legacy',
      expectedVersion: 0,
      country: 'CN',
    });
  });
  it('keeps customer fields and the same key after failure and prevents closing while saving', async () => {
    let finish!: (value: unknown) => void;
    mocks.saveCustomer
      .mockRejectedValueOnce(new Error('保存失败'))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
    const view = await customerEditor({
      id: 'okki',
      sourceSystem: 'OKKI',
      companyName: '原公司',
      name: '客户',
      code: 'KH-1',
      country: 'CN',
      version: 0,
    });
    const company = view.host.querySelector<HTMLInputElement>(
      '[data-label="公司名称"] input',
    )!;
    expect(company.readOnly).toBe(false);
    await fill(view.host, '公司名称', '人工核实公司');
    clickText(view.host, '保存客户');
    await vi.waitFor(() => expect(view.host.textContent).toContain('保存失败'));
    expect(company.value).toBe('人工核实公司');
    clickText(view.host, '保存客户');
    await vi.waitFor(() => expect(mocks.saveCustomer).toHaveBeenCalledTimes(2));
    expect(mocks.saveCustomer.mock.calls[1]![0].idempotencyKey).toBe(
      mocks.saveCustomer.mock.calls[0]![0].idempotencyKey,
    );
    expect(
      view.host.querySelector<HTMLButtonElement>('[data-close]')?.disabled,
    ).toBe(true);
    expect(view.closed).not.toHaveBeenCalled();
    finish({ id: 'okki' });
    await vi.waitFor(() => expect(view.closed).toHaveBeenCalledOnce());
  });
});
