import type { Component, PropType } from 'vue';
import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';
import { createApp, defineComponent, h, nextTick, reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AssignmentDialog from './modules/assignment-dialog.vue';
import ReportForm from './modules/report-form.vue';
import ScopeDialog from './modules/scope-dialog.vue';

const mocks = vi.hoisted(() => ({
  assignments: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  preview: vi.fn(),
  apply: vi.fn(),
  scopePreview: vi.fn(),
  scopeSync: vi.fn(),
}));
vi.mock('#/api/fdmcaiwu/ec-profit', () => ({
  getShopAssignments: mocks.assignments,
  createEcProfit: mocks.create,
  updateEcProfit: mocks.update,
  previewShopAssignments: mocks.preview,
  applyShopAssignments: mocks.apply,
  previewEcProfitScope: mocks.scopePreview,
  syncEcProfitScope: mocks.scopeSync,
}));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup: (_, ctx) => () => h('div', ctx.slots.default?.()),
  });
  const input = defineComponent({
    props: {
      value: { type: [String, Number, Boolean], default: undefined },
      disabled: Boolean,
    },
    emits: ['update:value'],
    setup: (props, ctx) => () =>
      h('input', {
        value: props.value,
        disabled: props.disabled,
        onInput: (event: Event) =>
          ctx.emit('update:value', (event.target as HTMLInputElement).value),
      }),
  });
  return {
    Alert: defineComponent({
      props: { message: String },
      setup: (props, ctx) => () =>
        h('div', { role: 'alert' }, [props.message, ctx.slots.description?.()]),
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
    DatePicker: input,
    Input: Object.assign(input, { TextArea: input }),
    Select: input,
    Form: defineComponent({
      setup: (_, ctx) => {
        ctx.expose({ validate: async () => true, clearValidate: () => {} });
        return () => h('form', ctx.slots.default?.());
      },
    }),
    FormItem: defineComponent({
      props: { label: String },
      setup: (props, ctx) => () =>
        h('label', { 'data-label': props.label }, ctx.slots.default?.()),
    }),
    Modal: defineComponent({
      props: {
        open: Boolean,
        confirmLoading: Boolean,
        footer: { type: Object, default: undefined },
        okButtonProps: {
          type: Object as PropType<{ disabled?: boolean }>,
          default: () => ({}),
        },
        okText: { type: String, default: '提交' },
      },
      emits: ['ok', 'cancel'],
      setup: (props, ctx) => () =>
        props.open
          ? h('section', { role: 'dialog' }, [
              ctx.slots.default?.(),
              props.footer === null
                ? null
                : h(
                    'button',
                    {
                      'data-submit': true,
                      disabled:
                        props.confirmLoading || props.okButtonProps.disabled,
                      onClick: () => ctx.emit('ok'),
                    },
                    props.okText,
                  ),
            ])
          : null,
    }),
    Radio: Object.assign(block, { Group: input }),
    Spin: block,
    Table: block,
    Tag: block,
    message: { success: vi.fn() },
  };
});

const cleanups: (() => void)[] = [];
async function settle() {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
  }
}
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
function click(host: Element, text: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (element) => element.textContent?.trim() === text,
  );
  expect(button).toBeDefined();
  button!.click();
}
const shop: Api.AssignmentShop = {
  shopId: 'shop1',
  shopName: '店铺一',
  enabled: true,
  configured: true,
  included: true,
  assignmentId: 10,
  assignmentVersion: 2,
};
const report: Api.Report = {
  id: 8,
  reportNo: 'EC-8',
  month: '2026-09',
  status: 'WAITING_IMPORT',
  version: 3,
  currency: 'CNY',
  shopCount: 1,
  importedShopCount: 0,
  summary: {},
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.assignments.mockResolvedValue({
    effectiveMonth: '2026-09',
    configVersion: 12,
    groups: [],
    shops: [shop],
  });
  mocks.create.mockResolvedValue(8);
  mocks.update.mockResolvedValue(true);
  mocks.preview.mockResolvedValue({
    effectiveMonth: '2026-09',
    configVersion: 12,
    previewToken: 'review-token',
    changes: [
      {
        shopId: shop.shopId,
        shopName: shop.shopName,
        before: shop,
        after: shop,
      },
    ],
    affectedReports: [],
    warnings: [],
  });
  mocks.apply.mockResolvedValue({ configVersion: 13, changeCount: 1 });
  mocks.scopePreview.mockResolvedValue({
    reportId: 8,
    month: '2026-09',
    reportVersion: 3,
    configVersion: 12,
    previewToken: 'scope-token',
    expectedShopCount: 1,
    unconfiguredShops: [],
    canSync: true,
    changes: [{ kind: 'ADD', shopId: 'shop1', shopName: '店铺一' }],
    warnings: [],
  });
  mocks.scopeSync.mockResolvedValue(true);
});
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

describe('真实月报表单组件', () => {
  it('按范围预览版本建单，不发送手选店铺或客户端金额', async () => {
    const { host, props } = mount(ReportForm, {
      open: false,
      defaultMonth: '2026-09',
    });
    props.open = true;
    await settle();
    click(host, '创建月报');
    await settle();
    expect(mocks.create).toHaveBeenCalledWith({
      month: '2026-09',
      expectedConfigVersion: 12,
      remark: undefined,
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('未配置店铺阻止建单；旧月份慢响应不能覆盖新月份范围', async () => {
    let finishOld!: (value: unknown) => void;
    mocks.assignments.mockImplementation((month: string) =>
      month === '2026-09'
        ? new Promise((resolve) => {
            finishOld = resolve;
          })
        : Promise.resolve({
            effectiveMonth: month,
            configVersion: 13,
            groups: [],
            shops: [{ ...shop, configured: false }],
          }),
    );
    const { host, props } = mount(ReportForm, {
      open: false,
      defaultMonth: '2026-09',
    });
    props.open = true;
    await settle();
    const monthInput = host.querySelector<HTMLInputElement>(
      '[data-label="所属月份"] input',
    )!;
    monthInput.value = '2026-10';
    monthInput.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    finishOld({
      effectiveMonth: '2026-09',
      configVersion: 12,
      groups: [],
      shops: [shop],
    });
    await settle();
    expect(host.textContent).toContain('1 家未配置');
    expect(
      host.querySelector<HTMLButtonElement>('[data-submit]')!.disabled,
    ).toBe(true);
    click(host, '创建月报');
    await settle();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('编辑备注携带月报版本且不重写范围', async () => {
    const { host, props } = mount(ReportForm, {
      open: false,
      defaultMonth: '2026-09',
      report,
    });
    props.open = true;
    await settle();
    click(host, '保存备注');
    await settle();
    expect(mocks.update).toHaveBeenCalledWith({
      id: 8,
      expectedVersion: 3,
      remark: undefined,
    });
    expect(mocks.assignments).not.toHaveBeenCalled();
  });
});

describe('预览后提交的交互保护', () => {
  it('归属提交失败后保留同一幂等键、预览和原始版本重试', async () => {
    mocks.apply.mockRejectedValueOnce(new Error('response lost'));
    const { host, props } = mount(AssignmentDialog, {
      open: false,
      month: '2026-09',
      shops: [shop],
      groups: [],
    });
    props.open = true;
    await settle();
    click(host, '预览变更');
    await settle();
    click(host, '确认保存归属');
    await settle();
    expect(host.textContent).toContain('提交未确认成功');
    click(host, '确认保存归属');
    await settle();
    const first = mocks.apply.mock.calls[0]![0] as Api.AssignmentApply;
    expect(mocks.apply.mock.calls[1]![0]).toEqual(first);
    expect(first.previewToken).toBe('review-token');
    expect(first.expectedAssignments).toEqual([
      { shopId: 'shop1', assignmentId: 10, version: 2 },
    ]);
    expect(first.idempotencyKey).toBeTruthy();
  });
  it('范围同步失败保留同一幂等键，未配置范围禁止提交', async () => {
    mocks.scopeSync.mockRejectedValueOnce(new Error('response lost'));
    const { host, props } = mount(ScopeDialog, { open: false, report });
    props.open = true;
    await settle();
    click(host, '确认同步范围');
    await settle();
    click(host, '确认同步范围');
    await settle();
    expect(mocks.scopeSync.mock.calls[1]![0]).toEqual(
      mocks.scopeSync.mock.calls[0]![0],
    );
    props.open = false;
    await settle();
    mocks.scopePreview.mockResolvedValue({
      reportId: 8,
      month: '2026-09',
      reportVersion: 3,
      configVersion: 12,
      previewToken: 'blocked',
      expectedShopCount: 1,
      unconfiguredShops: [shop],
      canSync: false,
      changes: [],
      warnings: [],
    });
    props.open = true;
    await settle();
    expect(
      host.querySelector<HTMLButtonElement>('[data-submit]')!.disabled,
    ).toBe(true);
  });
});
