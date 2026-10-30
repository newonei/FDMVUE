/* eslint-disable vue/one-component-per-file -- Small controls exercise the actual editor without overlay animations. */
import type { PropType } from 'vue';

import { createApp, defineComponent, h, nextTick, reactive, ref } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ContractEditor from './ContractEditor.vue';

const api = vi.hoisted(() => ({
  access: vi.fn(),
  customers: vi.fn(),
  saveCustomer: vi.fn(),
  resolve: vi.fn(),
  create: vi.fn(),
  counter: 0,
}));
vi.mock('#/api/fdmplatform', () => ({
  contractAction: vi.fn(),
  getAccess: api.access,
  getAttachments: vi.fn().mockResolvedValue({ items: [] }),
  getContract: vi.fn(),
  newIdempotencyKey: () => `operation-${++api.counter}`,
}));
vi.mock('#/api/fdmplatform/customers', () => ({
  getCustomers: api.customers,
  getCustomer: vi.fn(),
  saveCustomer: api.saveCustomer,
  getCustomerOptions: vi.fn().mockResolvedValue({
    countries: [{ code: 'CN', nameZh: '中国', nameEn: 'China', iso3: 'CHN' }],
    customerSources: ['展会'],
    productCategories: [{ value: 'YOGA', label: '瑜伽系列产品' }],
  }),
}));
vi.mock('#/api/system/area', () => ({
  getAreaTree: vi
    .fn()
    .mockResolvedValue([{ name: '上海市', children: [{ name: '上海市' }] }]),
}));
vi.mock('#/api/fdmplatform/products', () => ({ resolveProducts: api.resolve }));
vi.mock('#/api/fdmplatform/contract-review', () => ({
  submitContractReview: vi.fn(),
}));
vi.mock('#/api/fdmplatform/submissions', () => ({
  createContractWithAttachments: api.create,
  contractActionWithAttachments: vi.fn(),
}));
vi.mock('../../components/RemoteMasterSelect.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../../trade/customers/CustomerSourceOptions.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../../components/CreationAttachments.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./ProductPicker.vue', () => ({
  default: defineComponent({
    props: { open: Boolean, busy: Boolean },
    emits: ['selected', 'close'],
    setup(props, { emit }) {
      return () =>
        props.open
          ? h('div', { 'data-picker': true }, [
              h(
                'button',
                {
                  disabled: props.busy,
                  onClick: () => emit('selected', [{ id: 'sku', version: 0 }]),
                },
                '选入测试规格',
              ),
              h('button', { onClick: () => emit('close') }, '关闭选品'),
            ])
          : null;
    },
  }),
}));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup: (_, ctx) => () => h('div', ctx.attrs, ctx.slots.default?.()),
  });
  const input = defineComponent({
    props: {
      value: { type: [String, Number, Boolean], default: undefined },
      disabled: Boolean,
    },
    emits: ['update:value', 'pressEnter'],
    setup(props, ctx) {
      const control = ref<HTMLInputElement>();
      ctx.expose({ focus: () => control.value?.focus() });
      return () =>
        h('input', {
          ...ctx.attrs,
          ref: control,
          value: props.value,
          disabled: props.disabled,
          onInput: (event: Event) =>
            ctx.emit('update:value', (event.target as HTMLInputElement).value),
          onKeydown: (event: KeyboardEvent) => {
            if (event.key === 'Enter') ctx.emit('pressEnter');
          },
        });
    },
  });
  const select = defineComponent({
    props: {
      value: { type: [String, Number, Array], default: undefined },
      options: {
        type: Array as PropType<{ label: string; value: number | string }[]>,
        default: () => [],
      },
    },
    emits: ['update:value', 'search'],
    setup(props, ctx) {
      return () =>
        h('div', {}, [
          h(
            'select',
            {
              value: props.value,
              onChange: (event: Event) => {
                const value = (event.target as HTMLSelectElement).value;
                ctx.emit(
                  'update:value',
                  props.options.find((entry) => String(entry.value) === value)
                    ?.value ?? value,
                );
              },
            },
            [
              h('option', { value: '' }, ''),
              ...props.options.map((option) =>
                h('option', { value: option.value }, option.label),
              ),
            ],
          ),
          h('input', {
            'data-search': true,
            onInput: (event: Event) =>
              ctx.emit('search', (event.target as HTMLInputElement).value),
          }),
        ]);
    },
  });
  const item = defineComponent({
    props: { label: { type: String, default: '' } },
    setup: (props, ctx) => () =>
      h('label', { 'data-label': props.label }, ctx.slots.default?.()),
  });
  const drawer = defineComponent({
    props: {
      open: Boolean,
      title: { type: String, default: '' },
      closable: Boolean,
    },
    emits: ['close'],
    setup: (props, ctx) => () =>
      props.open
        ? h('section', { 'data-drawer': props.title }, [
            h(
              'button',
              {
                'data-close': true,
                disabled: !props.closable,
                onClick: () => ctx.emit('close'),
              },
              '关闭',
            ),
            ctx.slots.default?.(),
            ctx.slots.footer?.(),
          ])
        : null,
  });
  const table = defineComponent({
    props: {
      dataSource: {
        type: Array as PropType<Record<string, unknown>[]>,
        default: () => [],
      },
      columns: {
        type: Array as PropType<{ key: string }[]>,
        default: () => [],
      },
    },
    setup: (props, ctx) => () =>
      h(
        'div',
        {},
        props.dataSource.map((record) =>
          h(
            'div',
            { 'data-row': record.id, key: String(record.id) },
            props.columns.map((column) =>
              h(
                'div',
                { 'data-column': column.key },
                ctx.slots.bodyCell?.({ column, record }),
              ),
            ),
          ),
        ),
      ),
  });
  return {
    Alert: defineComponent({
      props: { message: { type: String, default: '' } },
      setup: (props) => () => h('div', {}, props.message),
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
    Card: block,
    Checkbox: input,
    Collapse: Object.assign(block, { Panel: block }),
    Drawer: drawer,
    Empty: block,
    Form: Object.assign(block, { Item: item }),
    Input: Object.assign(input, { TextArea: input }),
    InputNumber: input,
    Select: select,
    Space: block,
    Switch: input,
    Table: table,
    Tag: block,
    Modal: { confirm: vi.fn() },
    message: { success: vi.fn(), warning: vi.fn(), info: vi.fn() },
  };
});

const disposals: (() => void)[] = [];
function button(host: ParentNode, title: string) {
  const result = [...host.querySelectorAll('button')].find(
    (entry) => entry.textContent?.trim() === title,
  );
  expect(result).toBeTruthy();
  return result!;
}
async function fill(
  host: ParentNode,
  label: string,
  value: string,
  tag = 'input',
) {
  const control = host.querySelector<HTMLInputElement>(
    `[data-label="${label}"] ${tag}`,
  )!;
  control.value = value;
  control.dispatchEvent(
    new Event(tag === 'select' ? 'change' : 'input', { bubbles: true }),
  );
  await nextTick();
}
async function mountEditor(
  defaultBusinessType: 'DOMESTIC' | 'FOREIGN' = 'FOREIGN',
) {
  const host = document.createElement('div');
  document.body.append(host);
  const props = reactive({
    defaultBusinessType,
    open: false,
    master: [],
    directory: {
      users: [{ id: 7, nickname: '经办人' }],
      departments: [],
      companies: [],
    },
  });
  const app = createApp({ render: () => h(ContractEditor, props) });
  app.mount(host);
  disposals.push(() => {
    app.unmount();
    host.remove();
  });
  props.open = true;
  await vi.waitFor(() =>
    expect(
      host.querySelector('[data-label="合同主体"] option[value="1"]'),
    ).toBeTruthy(),
  );
  return { host, props };
}
async function addProduct(host: HTMLElement) {
  button(host, '从产品中心选择').click();
  await nextTick();
  button(host, '选入测试规格').click();
  await vi.waitFor(() =>
    expect(host.querySelector('[data-picker]')).toBeNull(),
  );
  await nextTick();
}
beforeEach(() => {
  vi.clearAllMocks();
  api.counter = 0;
  api.access.mockReset().mockResolvedValue({
    userId: 7,
    companies: [{ companyId: 1, companyName: '测试公司' }],
  });
  api.customers.mockReset().mockResolvedValue({ list: [], total: 0 });
  api.create.mockReset();
  api.saveCustomer.mockReset();
  api.resolve.mockReset().mockResolvedValue([
    {
      skuId: 'sku',
      skuName: '测试规格',
      productVersion: 0,
      quantity: '1',
      unitPrice: '10',
      unit: '件',
    },
  ]);
});
afterEach(() => {
  while (disposals.length > 0) disposals.pop()!();
});

describe('order entry without changing menus', () => {
  it('seeds an inline customer from the search, selects it after save and preserves order fields and product lines', async () => {
    const { host } = await mountEditor();
    await fill(host, '内部名称（可选）', '保留的订单备注');
    await addProduct(host);
    const lineId = host.querySelector<HTMLElement>('[data-row]')?.dataset.row;
    await fill(host, '客户', '新客户全称', '[data-search]');
    button(host, '新增客户并选用').click();
    await nextTick();
    const customer = host.querySelector<HTMLElement>(
      '[data-drawer="新建客户"]',
    )!;
    expect(
      customer.querySelector<HTMLInputElement>('[data-label="客户全称"] input')
        ?.value,
    ).toBe('新客户全称');
    expect(button(host, '保存草稿').disabled).toBe(true);
    await vi.waitFor(() =>
      expect(customer.querySelector('option[value="CN"]')).toBeTruthy(),
    );
    await fill(customer, '国家 / 地区', 'CN', 'select');
    api.saveCustomer.mockResolvedValueOnce({
      id: 'created-customer',
      name: '新客户全称',
      active: true,
      type: 'CUSTOMER',
      code: 'KH-1',
      version: 0,
    });
    button(customer, '保存并选用').click();
    await vi.waitFor(() =>
      expect(host.querySelector('[data-drawer="新建客户"]')).toBeNull(),
    );
    expect(
      host.querySelector<HTMLSelectElement>('[data-label="客户"] select')
        ?.value,
    ).toBe('created-customer');
    expect(
      host.querySelector<HTMLInputElement>(
        '[data-label="内部名称（可选）"] input',
      )?.value,
    ).toBe('保留的订单备注');
    expect(host.querySelector<HTMLElement>('[data-row]')?.dataset.row).toBe(
      lineId,
    );
    expect(api.create).not.toHaveBeenCalled();
  });

  it('keeps a failed customer form open and cancels back to the unchanged order', async () => {
    const { host } = await mountEditor();
    await fill(host, '内部名称（可选）', '尚未保存');
    button(host, '新增客户并选用').click();
    await nextTick();
    const customer = host.querySelector<HTMLElement>(
      '[data-drawer="新建客户"]',
    )!;
    await fill(customer, '客户全称', '客户甲');
    await fill(customer, '国家 / 地区', 'CN', 'select');
    api.saveCustomer.mockRejectedValueOnce(new Error('暂时无法保存'));
    button(customer, '保存并选用').click();
    await vi.waitFor(() =>
      expect(customer.textContent).toContain('暂时无法保存'),
    );
    expect(
      customer.querySelector<HTMLInputElement>('[data-label="客户全称"] input')
        ?.value,
    ).toBe('客户甲');
    button(customer, '取消').click();
    await nextTick();
    expect(
      host.querySelector<HTMLInputElement>(
        '[data-label="内部名称（可选）"] input',
      )?.value,
    ).toBe('尚未保存');
    expect(button(host, '保存草稿').disabled).toBe(false);
  });

  it('opens a domestic order in RMB with only domestic customers and no trade-only fields', async () => {
    const { host } = await mountEditor('DOMESTIC');
    await vi.waitFor(() =>
      expect(api.customers).toHaveBeenCalledWith(
        expect.objectContaining({ salesChannel: 'DOMESTIC' }),
      ),
    );
    expect(
      host.querySelector<HTMLInputElement>('[data-label="合同币种"] input')
        ?.value,
    ).toBe('人民币（CNY）');
    expect(host.querySelector('[data-label="合同币种"] select')).toBeNull();
    for (const label of ['阿里信保订单', '业务部门（可选）', '业务类型'])
      expect(host.querySelector(`[data-label="${label}"]`)).toBeNull();
    expect(host.querySelector('[data-label="样品单"]')).toBeTruthy();
    button(host, '新增客户并选用').click();
    await nextTick();
    const customer = host.querySelector<HTMLElement>(
      '[data-drawer="新建内销客户"]',
    )!;
    expect(customer).toBeTruthy();
    expect(customer.querySelector('[data-label="国家 / 地区"]')).toBeNull();
    expect(customer.querySelector('[data-label="省份"]')).toBeTruthy();
    await fill(customer, '客户全称', '内销客户甲');
    await fill(customer, '纳税人识别号', '91310000AB1234567X');
    await vi.waitFor(() =>
      expect(
        customer.querySelector('[data-label="省份"] option[value="上海市"]'),
      ).toBeTruthy(),
    );
    await fill(customer, '省份', '上海市', 'select');
    await fill(customer, '城市', '上海市', 'select');
    await fill(customer, '详细地址', '浦东新区某路 1 号');
    await fill(customer, '联系人', '张三');
    await fill(customer, '联系电话', '13800000000');
    await fill(customer, '客户来源', '展会', 'select');
    await fill(customer, '产品种类', 'YOGA', 'select');
    api.saveCustomer.mockResolvedValueOnce({
      id: 'domestic-customer',
      name: '内销客户甲',
      active: true,
      type: 'CUSTOMER',
      code: 'KH-2',
      version: 0,
      salesChannel: 'DOMESTIC',
    });
    await vi.waitFor(() =>
      expect(button(customer, '保存并选用').disabled).toBe(false),
    );
    button(customer, '保存并选用').click();
    await vi.waitFor(() =>
      expect(api.saveCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          salesChannel: 'DOMESTIC',
          country: 'CN',
          province: '上海市',
          city: '上海市',
          contactName: '张三',
          productCategories: expect.anything(),
          invoice: expect.objectContaining({ taxNo: '91310000AB1234567X' }),
        }),
      ),
    );
  });

  it('keeps foreign currency choice and offers a sample switch instead of business types', async () => {
    const { host } = await mountEditor('FOREIGN');
    await vi.waitFor(() =>
      expect(api.customers).toHaveBeenCalledWith(
        expect.objectContaining({ salesChannel: 'FOREIGN' }),
      ),
    );
    expect(host.querySelector('[data-label="合同币种"] select')).toBeTruthy();
    expect(host.querySelector('[data-label="样品单"]')).toBeTruthy();
    expect(host.querySelector('[data-label="业务类型"]')).toBeNull();
    expect(host.querySelector('[data-label="业务部门（可选）"]')).toBeNull();
  });

  it('focuses the newly added duplicate and copied row, and Enter moves quantity to price to the next line', async () => {
    const { host } = await mountEditor();
    await addProduct(host);
    await addProduct(host);
    let rows = [...host.querySelectorAll('[data-row]')];
    expect(document.activeElement).toBe(
      rows[1]!.querySelector('[data-column="quantity"] input'),
    );
    const quantity = rows[0]!.querySelector<HTMLInputElement>(
      '[data-column="quantity"] input',
    )!;
    quantity.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await nextTick();
    const price = rows[0]!.querySelector<HTMLInputElement>(
      '[data-column="unitPrice"] input',
    )!;
    expect(document.activeElement).toBe(price);
    price.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await nextTick();
    expect(document.activeElement).toBe(
      rows[1]!.querySelector('[data-column="quantity"] input'),
    );
    button(rows[0]!, '复制行').click();
    await nextTick();
    await nextTick();
    rows = [...host.querySelectorAll('[data-row]')];
    expect(rows).toHaveLength(3);
    expect(document.activeElement).toBe(
      rows[2]!.querySelector('[data-column="quantity"] input'),
    );
  });

  it('links domestic unit price and line total, and hides the contract number', async () => {
    const { host } = await mountEditor('DOMESTIC');
    expect(host.querySelector('[data-label="订单号"]')).toBeNull();
    expect(host.querySelector('[data-label="内部单号"]')).toBeTruthy();
    await addProduct(host);
    const row = host.querySelector<HTMLElement>('[data-row]')!;
    const input = (key: string) =>
      row.querySelector<HTMLInputElement>(`[data-column="${key}"] input`)!;
    const type = async (key: string, value: string) => {
      input(key).value = value;
      input(key).dispatchEvent(new Event('input', { bubbles: true }));
      await nextTick();
    };
    await type('quantity', '3');
    await type('unitPrice', '12.5');
    expect(input('amount').value).toBe('37.50');
    await type('amount', '100');
    expect(input('unitPrice').value).toBe('33.333333');
    input('amount').dispatchEvent(new Event('blur'));
    await nextTick();
    expect(input('amount').value).toBe('100.00');
    await type('quantity', '4');
    expect(input('amount').value).toBe('133.33');
  });

  it('ignores delayed product resolution after the editor is closed and reopened', async () => {
    let finish!: (value: unknown) => void;
    api.resolve.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { host, props } = await mountEditor();
    button(host, '从产品中心选择').click();
    await nextTick();
    button(host, '选入测试规格').click();
    await nextTick();
    expect(button(host, '保存草稿').disabled).toBe(true);
    props.open = false;
    await nextTick();
    props.open = true;
    await nextTick();
    finish([
      { skuId: 'old', skuName: '过期选品', productVersion: 0, quantity: '1' },
    ]);
    await nextTick();
    await nextTick();
    expect(host.querySelector('[data-row]')).toBeNull();
    expect(host.textContent).not.toContain('过期选品');
    await addProduct(host);
    expect(host.querySelectorAll('[data-row]')).toHaveLength(1);
  });
});
