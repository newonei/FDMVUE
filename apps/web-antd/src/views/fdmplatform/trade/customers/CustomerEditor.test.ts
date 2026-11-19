/* eslint-disable vue/one-component-per-file -- UI adapters keep form and option-dialog interaction observable without overlays. */
import type { PropType } from 'vue';

import type { Customer, CustomerOptions } from '#/api/fdmplatform/customers';

import { createApp, defineComponent, h, nextTick, reactive } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CustomerEditor from './CustomerEditor.vue';

const api = vi.hoisted(() => ({
  options: vi.fn(),
  save: vi.fn(),
  saveSources: vi.fn(),
  saveTypes: vi.fn(),
  saveIndustries: vi.fn(),
}));
vi.mock('#/api/fdmplatform', () => ({
  newIdempotencyKey: () => 'customer-classification-request',
}));
vi.mock('#/api/fdmplatform/customers', () => ({
  getCustomerOptions: api.options,
  saveCustomer: api.save,
  saveCustomerSources: api.saveSources,
  saveCustomerTypes: api.saveTypes,
  saveCustomerIndustries: api.saveIndustries,
}));
vi.mock('#/api/system/area', () => ({ getAreaTree: async () => [] }));
vi.mock('../../data', () => ({ errorText: (error: Error) => error.message }));
vi.mock('#/components/fdm-resizable-drawer', () => ({
  FdmResizableDrawer: defineComponent({
    props: { open: Boolean },
    setup: (props, context) => () =>
      props.open
        ? h('section', [context.slots.default?.(), context.slots.footer?.()])
        : null,
  }),
}));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup: (_, context) => () => h('div', context.slots.default?.()),
  });
  const field = defineComponent({
    props: { label: String },
    setup: (props, context) => () =>
      h('fieldset', { 'data-field': props.label }, [
        h('legend', props.label),
        context.slots.default?.(),
      ]),
  });
  function input(tag: 'input' | 'textarea') {
    return defineComponent({
      props: { value: String, disabled: Boolean },
      emits: ['update:value'],
      setup: (props, context) => () =>
        h(tag, {
          value: props.value,
          disabled: props.disabled,
          onInput: (event: Event) =>
            context.emit(
              'update:value',
              (event.target as HTMLInputElement).value,
            ),
        }),
    });
  }
  return {
    Alert: defineComponent({
      props: { message: String },
      setup: (props) => () => h('p', props.message),
    }),
    Button: defineComponent({
      props: { disabled: Boolean },
      emits: ['click'],
      setup: (props, context) => () =>
        h(
          'button',
          { disabled: props.disabled, onClick: () => context.emit('click') },
          context.slots.default?.(),
        ),
    }),
    Select: defineComponent({
      props: {
        value: [String, Array],
        options: {
          type: Array as PropType<{ label: string; value: string }[]>,
          default: () => [],
        },
        disabled: Boolean,
        allowClear: Boolean,
        mode: String,
      },
      emits: ['update:value', 'change'],
      setup: (props, context) => () =>
        h(
          'select',
          {
            value: props.value,
            disabled: props.disabled,
            multiple: props.mode === 'multiple',
            onChange: (event: Event) => {
              const target = event.target as HTMLSelectElement;
              const value = target.multiple
                ? [...target.selectedOptions].map((option) => option.value)
                : target.value || (props.allowClear ? undefined : '');
              context.emit('update:value', value);
              context.emit('change', value);
            },
          },
          [
            h('option', { value: '' }, ''),
            ...props.options.map((option) =>
              h('option', { value: option.value }, option.label),
            ),
          ],
        ),
    }),
    Modal: defineComponent({
      props: {
        open: Boolean,
        title: String,
        okText: String,
        cancelText: String,
        okButtonProps: Object as PropType<{ disabled?: boolean }>,
      },
      emits: ['ok', 'cancel'],
      setup: (props, context) => () =>
        props.open
          ? h('dialog', { open: true }, [
              h('h2', props.title),
              context.slots.default?.(),
              h(
                'button',
                {
                  disabled: props.okButtonProps?.disabled,
                  onClick: () => context.emit('ok'),
                },
                props.okText || '保存选项',
              ),
              h(
                'button',
                { onClick: () => context.emit('cancel') },
                props.cancelText || '关闭选项',
              ),
            ])
          : null,
    }),
    Checkbox: block,
    Collapse: Object.assign(block, { Panel: block }),
    Form: Object.assign(block, { Item: field }),
    Input: Object.assign(input('input'), { TextArea: input('textarea') }),
    Space: block,
    message: { success: vi.fn() },
  };
});

const customer: Customer = {
  id: 'customer-1',
  code: 'KH-TEST-1',
  type: 'CUSTOMER',
  companyId: 0,
  name: '测试内销客户',
  version: 3,
  active: true,
  sourceSystem: 'LOCAL',
  salesChannel: 'DOMESTIC',
  country: 'CN',
  customerSource: '展会',
  contactName: '陈先生',
  phone: '13800000000',
  address: '上海市测试地址',
  productCategories: ['YOGA'],
};
let options: CustomerOptions;
const disposals: (() => void)[] = [];

async function mount(
  existing?: Customer,
  salesChannel: 'DOMESTIC' | 'FOREIGN' = 'DOMESTIC',
) {
  const props = reactive({ open: false, customer: existing, salesChannel });
  const host = document.createElement('div');
  document.body.append(host);
  const onClose = vi.fn();
  const app = createApp({
    render: () => h(CustomerEditor, { ...props, onClose }),
  });
  app.mount(host);
  disposals.push(() => {
    app.unmount();
    host.remove();
  });
  const previousLoads = api.options.mock.calls.length;
  props.open = true;
  await vi.waitFor(() =>
    expect(api.options.mock.calls.length).toBeGreaterThan(previousLoads),
  );
  await nextTick();
  return { host, onClose, props };
}
function click(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === text,
  );
  expect(button).toBeTruthy();
  button!.click();
}
async function fill(host: HTMLElement, label: string, value: string) {
  const input = host.querySelector(
    `[data-field="${label}"] input`,
  ) as HTMLInputElement;
  expect(input).toBeTruthy();
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await nextTick();
}
async function select(host: HTMLElement, label: string, value: string) {
  const input = host.querySelector(
    `[data-field="${label}"] select`,
  ) as HTMLSelectElement;
  expect(input).toBeTruthy();
  input.value = value;
  input.dispatchEvent(new Event('change'));
  await nextTick();
}
async function changeOptions(
  host: HTMLElement,
  button: string,
  values: string,
) {
  click(host, button);
  await vi.waitFor(() =>
    expect(host.querySelector('dialog textarea:not(:disabled)')).toBeTruthy(),
  );
  const textarea = host.querySelector('dialog textarea') as HTMLTextAreaElement;
  textarea.value = values;
  textarea.dispatchEvent(new Event('input'));
  await nextTick();
  click(host, '保存选项');
  await vi.waitFor(() => expect(host.querySelector('dialog')).toBeNull());
  await nextTick();
}
beforeEach(() => {
  vi.clearAllMocks();
  options = {
    countries: [{ code: 'CN', nameZh: '中国', nameEn: 'China', iso3: 'CHN' }],
    customerSources: ['展会', '其他'],
    sourceVersion: 2,
    customerTypes: ['国内电商', '贸易公司', '品牌客户', '瑜伽馆'],
    typeVersion: 7,
    industries: [],
    industryVersion: 4,
    productCategories: [{ value: 'YOGA', label: '瑜伽用品' }],
  };
  api.options.mockImplementation(async () => options);
  api.save.mockResolvedValue(customer);
  api.saveTypes.mockImplementation(async ({ values }: { values: string[] }) => {
    options = { ...options, customerTypes: values, typeVersion: 8 };
    return options;
  });
  api.saveIndustries.mockImplementation(
    async ({ values }: { values: string[] }) => {
      options = { ...options, industries: values, industryVersion: 5 };
      return options;
    },
  );
  api.saveSources.mockImplementation(
    async ({ values }: { values: string[] }) => {
      options = { ...options, customerSources: values, sourceVersion: 3 };
      return options;
    },
  );
});
afterEach(() => disposals.splice(0).forEach((dispose) => dispose()));

describe('内销客户类型与所在行业', () => {
  it('填写中的资料可继续编辑，明确放弃才关闭，未改动的档案直接关闭', async () => {
    const { host, onClose, props } = await mount(customer);
    await fill(host, '客户全称', '新的客户名称');
    click(host, '取消');
    await nextTick();
    expect(host.querySelector('dialog')?.textContent).toContain(
      '放弃未保存的客户资料',
    );
    click(host, '继续填写');
    await nextTick();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      host.querySelector<HTMLInputElement>('[data-field="客户全称"] input')
        ?.value,
    ).toBe('新的客户名称');
    click(host, '取消');
    await nextTick();
    click(host, '放弃修改');
    await nextTick();
    expect(onClose).toHaveBeenCalledOnce();
    props.open = false;
    await nextTick();
    props.open = true;
    await nextTick();
    expect(
      host.querySelector<HTMLInputElement>('[data-field="客户全称"] input')
        ?.value,
    ).toBe(customer.name);
    click(host, '取消');
    await nextTick();
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(api.save).not.toHaveBeenCalled();
  });

  it('新增自定义选项后可选择并保存客户，再次打开仍能读取已维护选项', async () => {
    const { host } = await mount();
    expect(
      host.querySelector('[aria-label="客户类型"]')?.textContent,
    ).toContain('国内电商');
    expect(host.querySelector('[aria-label="所在行业"]')?.textContent).toBe('');
    await changeOptions(
      host,
      '维护客户类型选项',
      '国内电商\n贸易公司\n品牌客户\n瑜伽馆\n运动连锁',
    );
    expect(api.saveTypes).toHaveBeenCalledWith({
      values: ['国内电商', '贸易公司', '品牌客户', '瑜伽馆', '运动连锁'],
      expectedVersion: 7,
      idempotencyKey: 'customer-classification-request',
    });
    await changeOptions(host, '维护行业选项', '体育用品');
    expect(api.saveIndustries).toHaveBeenCalledWith({
      values: ['体育用品'],
      expectedVersion: 4,
      idempotencyKey: 'customer-classification-request',
    });
    await select(host, '客户类型', '运动连锁');
    await select(host, '所在行业', '体育用品');
    await fill(host, '客户全称', '运动客户');
    await select(host, '客户来源', '展会');
    await fill(host, '详细地址', '上海');
    await fill(host, '联系人', '陈先生');
    await fill(host, '联系电话', '13800000000');
    await select(host, '产品种类', 'YOGA');
    click(host, '保存客户');
    await vi.waitFor(() =>
      expect(api.save).toHaveBeenCalledWith(
        expect.objectContaining({
          customerType: '运动连锁',
          industry: '体育用品',
          salesChannel: 'DOMESTIC',
        }),
      ),
    );
    const reopened = await mount();
    expect(
      reopened.host.querySelector('[aria-label="客户类型"]')?.textContent,
    ).toContain('运动连锁');
    expect(
      reopened.host.querySelector('[aria-label="所在行业"]')?.textContent,
    ).toContain('体育用品');
  });

  it('维护客户时回显已移除的原值，保留后再次保存；清空时发送空串', async () => {
    const { host } = await mount({
      ...customer,
      customerType: '历史客户类型',
      industry: '健康养老',
    });
    const type = host.querySelector(
      '[aria-label="客户类型"]',
    ) as HTMLSelectElement;
    const industry = host.querySelector(
      '[aria-label="所在行业"]',
    ) as HTMLSelectElement;
    expect(type.value).toBe('历史客户类型');
    expect(type.textContent).toContain('历史客户类型（原值）');
    expect(industry.value).toBe('健康养老');
    click(host, '保存客户');
    await vi.waitFor(() =>
      expect(api.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'customer-1',
          expectedVersion: 3,
          customerType: '历史客户类型',
          industry: '健康养老',
        }),
      ),
    );
    await select(host, '客户类型', '');
    await select(host, '所在行业', '');
    click(host, '保存客户');
    await vi.waitFor(() =>
      expect(api.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ customerType: '', industry: '' }),
      ),
    );
  });

  it('客户类型和行业均为选填，行业选项允许清空，来源维护仍使用来源接口', async () => {
    const { host } = await mount(customer);
    await changeOptions(host, '维护行业选项', '');
    expect(api.saveIndustries).toHaveBeenCalledWith(
      expect.objectContaining({ values: [] }),
    );
    await changeOptions(host, '维护来源选项', '展会\n客户介绍');
    expect(api.saveSources).toHaveBeenCalledWith(
      expect.objectContaining({
        values: ['展会', '客户介绍'],
        expectedVersion: 2,
      }),
    );
    click(host, '保存客户');
    await vi.waitFor(() =>
      expect(api.save).toHaveBeenCalledWith(
        expect.objectContaining({ customerType: '', industry: '' }),
      ),
    );
  });

  it('外贸客户不显示或提交内销分类字段', async () => {
    const { host } = await mount(
      {
        ...customer,
        salesChannel: 'FOREIGN',
        customerType: '国内电商',
        industry: '体育用品',
      },
      'FOREIGN',
    );
    expect(host.textContent).not.toContain('客户类型');
    expect(host.textContent).not.toContain('所在行业');
    click(host, '保存客户');
    await vi.waitFor(() => expect(api.save).toHaveBeenCalled());
    const payload = api.save.mock.calls[0]![0];
    expect(payload.customerType).toBeUndefined();
    expect(payload.industry).toBeUndefined();
  });
});
