import type {
  MixBatchPreview,
  MixBatchRow,
} from '#/api/fdmgongchang/schedule/mix-batch';

import { createApp, defineComponent, h, nextTick, ref } from 'vue';

import dayjs from 'dayjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MixBatchModal from './modules/mix-batch-modal.vue';

const api = vi.hoisted(() => ({
  orders: vi.fn(),
  workers: vi.fn(),
  preview: vi.fn(),
  release: vi.fn(),
  success: vi.fn(),
  key: 0,
}));
vi.mock('#/api/fdmgongchang/factory', () => ({ getWorkerList: api.workers }));
vi.mock('#/api/fdmgongchang/production-order', () => ({
  getOpenProductionOrders: api.orders,
}));
vi.mock('#/api/fdmgongchang/schedule/mix-batch', () => ({
  previewMixBatch: api.preview,
  releaseMixBatch: api.release,
}));
vi.mock('#/api/fdmplatform', () => ({
  newIdempotencyKey: () => `batch-request-${++api.key}`,
}));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('div', [slots.default?.(), slots.footer?.()]),
  });
  const input = defineComponent({
    props: ['value', 'disabled'],
    emits: ['update:value'],
    setup:
      (props, { attrs, emit }) =>
      () =>
        h('input', {
          ...attrs,
          value: props.value ?? '',
          disabled: props.disabled,
          onInput: (event: Event) =>
            emit('update:value', (event.target as HTMLInputElement).value),
        }),
  });
  return {
    Spin: block,
    Empty: block,
    Modal: defineComponent({
      props: ['open'],
      setup:
        (props, { slots }) =>
        () =>
          props.open ? h('div', [slots.default?.(), slots.footer?.()]) : null,
    }),
    Alert: defineComponent({
      props: ['message'],
      setup:
        (props, { slots }) =>
        () =>
          h('div', { role: 'alert' }, [props.message, slots.description?.()]),
    }),
    Button: defineComponent({
      props: ['disabled', 'loading'],
      setup:
        (props, { attrs, slots }) =>
        () =>
          h(
            'button',
            { ...attrs, disabled: props.disabled || props.loading },
            slots.default?.(),
          ),
    }),
    Input: Object.assign(input, { TextArea: input }),
    Checkbox: defineComponent({
      props: ['checked', 'disabled'],
      emits: ['change'],
      setup:
        (props, { attrs, emit, slots }) =>
        () =>
          h('label', [
            h('input', {
              ...attrs,
              type: 'checkbox',
              checked: props.checked,
              disabled: props.disabled,
              onChange: (event: Event) => emit('change', event),
            }),
            slots.default?.(),
          ]),
    }),
    DatePicker: defineComponent({
      props: ['value', 'disabled'],
      emits: ['update:value'],
      setup:
        (props, { attrs, emit }) =>
        () =>
          h('input', {
            ...attrs,
            value: props.value?.format('YYYY-MM-DD'),
            disabled: props.disabled,
            onInput: (event: Event) =>
              emit(
                'update:value',
                dayjs((event.target as HTMLInputElement).value),
              ),
          }),
    }),
    Select: defineComponent({
      props: ['value', 'options', 'disabled'],
      emits: ['update:value'],
      setup:
        (props, { attrs, emit }) =>
        () =>
          h(
            'select',
            {
              ...attrs,
              value: String(props.value?.[0] ?? ''),
              disabled: props.disabled,
              onChange: (event: Event) => {
                const value = (event.target as HTMLSelectElement).value;
                emit('update:value', value ? [Number(value)] : []);
              },
            },
            [
              h('option', { value: '' }, '任务大厅'),
              ...(props.options ?? []).map(
                (option: { label: string; value: number; }) =>
                  h('option', { value: String(option.value) }, option.label),
              ),
            ],
          ),
    }),
    message: { success: api.success, warning: vi.fn() },
  };
});

const order = (id: number) => ({
  id,
  orderNo: `GD-${id}`,
  status: 'ACCEPTED',
  items: [{ id: id * 10, productName: `产品${id}` }],
});
const row = (key: string, options: Partial<MixBatchRow> = {}): MixBatchRow => ({
  rowKey: key,
  orderId: 1,
  orderNo: 'GD-1',
  itemId: 10,
  productName: '测试垫',
  side: 'FRONT',
  color: 'P',
  layerThickness: 0.2,
  recipeCode: 'R1',
  boardAttrs: {
    material: 'TPE',
    color: 'P',
    length: 200,
    width: 130,
    thickness: 4.8,
  },
  requiredBoards: 10,
  existingMixBoards: 4,
  quantity: 6,
  status: 'READY',
  warnings: [],
  ...options,
});
const preview = (): MixBatchPreview => ({
  previewKey: 'hash1',
  totalBoards: 15,
  readyCount: 3,
  warnings: [],
  rows: [
    row('front'),
    row('back', {
      side: 'BACK',
      layerThickness: 0.4,
      requiredBoards: 12,
      existingMixBoards: 5,
      quantity: 7,
    }),
    row('other', { orderId: 2, orderNo: 'GD-2', itemId: 20, quantity: 2 }),
    row('blocked', {
      itemId: 30,
      status: 'BLOCKED',
      quantity: 0,
      reason: '制造结构尚未确认',
    }),
    row('skipped', {
      itemId: 40,
      status: 'SKIPPED',
      quantity: 0,
      reason: '已有任务覆盖，无需重复安排',
    }),
  ],
});
const flush = async () => {
  for (let index = 0; index < 10; index++) {
    await Promise.resolve();
    await nextTick();
  }
};
let unmount: (() => void) | undefined;
let opened = ref(true);
async function mount(props: Record<string, unknown> = {}) {
  opened = ref(true);
  const host = document.createElement('div');
  document.body.append(host);
  const released = vi.fn();
  const app = createApp(
    defineComponent({
      setup: () => () =>
        h(MixBatchModal, {
          ...props,
          open: opened.value,
          'onUpdate:open': (value: boolean) => {
            opened.value = value;
          },
          onReleased: released,
        }),
    }),
  );
  app.mount(host);
  unmount = () => app.unmount();
  await flush();
  return released;
}
function button(text: string) {
  const found = [
    ...document.querySelectorAll<HTMLButtonElement>('button'),
  ].find((element) => element.textContent?.includes(text));
  expect(found).toBeTruthy();
  return found!;
}
async function click(text: string) {
  button(text).click();
  await flush();
}
async function check(label: string, checked = true) {
  const input = document.querySelector<HTMLInputElement>(
    `input[aria-label="${label}"]`,
  )!;
  expect(input).toBeTruthy();
  expect(input.disabled).toBe(false);
  input.checked = checked;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await flush();
}
async function input(id: string, value: string, event = 'input') {
  const element = document.querySelector<HTMLInputElement>(`#${id}`)!;
  expect(element).toBeTruthy();
  element.value = value;
  element.dispatchEvent(new Event(event, { bubbles: true }));
  await flush();
}
beforeEach(() => {
  api.orders.mockResolvedValue([order(1), order(2)]);
  api.workers.mockResolvedValue([
    { userId: 7, nickname: '发泡甲', posts: ['MIX'], status: 0 },
    { userId: 8, nickname: '开片乙', posts: ['SLICE'], status: 0 },
  ]);
  api.preview.mockImplementation(async () => preview());
  api.release.mockResolvedValue({
    scheduleId: 90,
    scheduleNo: 'PB90',
    taskIds: [1, 2, 3],
    taskCount: 3,
    totalBoards: 15,
    reused: false,
    warnings: [],
  });
});
afterEach(() => {
  unmount?.();
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('批量发泡', () => {
  it('大量原料与行提示默认收起，历史规格待确认原因仍立即可见', async () => {
    const warnings = Array.from(
      { length: 11 },
      (_, index) => `原料提示 ${index + 1}`,
    );
    const rowWarnings = Array.from(
      { length: 7 },
      (_, index) => `明细提示 ${index + 1}`,
    );
    api.preview.mockResolvedValue({
      ...preview(),
      warnings,
      rows: [
        row('legacy', {
          side: 'UNSPECIFIED',
          status: 'BLOCKED',
          quantity: 0,
          reason: '颜色方式或制造结构尚未确认，请确认规格',
          warnings: rowWarnings,
        }),
      ],
      readyCount: 0,
    });
    await mount({ initialOrderNo: 'GD-1' });
    await click('预览发泡任务');
    const grouped =
      document.querySelector<HTMLDetailsElement>('.batch-warnings')!;
    const perRow = document.querySelector<HTMLDetailsElement>(
      '.batch-row-warnings',
    )!;
    expect(grouped.open).toBe(false);
    expect(perRow.open).toBe(false);
    expect(grouped.querySelector('summary')!.textContent).toContain(
      '原料与排产提示（11 项）',
    );
    expect(perRow.querySelector('summary')!.textContent).toContain(
      '查看 7 条提示',
    );
    expect(grouped.querySelectorAll('li')).toHaveLength(11);
    expect(perRow.querySelectorAll('li')).toHaveLength(7);
    const reason = document.querySelector('.batch-row-reason')!;
    expect(reason.textContent).toContain('请确认规格');
    expect(reason.closest('details')).toBeNull();
    expect(
      document.querySelector('tbody td:nth-child(3)')!.textContent,
    ).toContain('待确认结构');
    for (const column of [5, 6, 7])
      expect(
        document
          .querySelector(`tbody td:nth-child(${column})`)!
          .textContent?.trim(),
      ).toBe('—');
    expect(
      document.querySelector<HTMLInputElement>(
        'input[aria-label="安排 legacy"]',
      )!.disabled,
    ).toBe(true);
    expect(button('下发选中').disabled).toBe(true);
  });
  it('预带当前订单和日期，可增加订单；完整预览所有明细和层后一次原子提交', async () => {
    const date = dayjs().add(1, 'day').format('YYYY-MM-DD');
    const released = await mount({ initialOrderNo: 'GD-1', initialDate: date });
    expect(
      document.querySelector<HTMLInputElement>('#mix-batch-date')!.value,
    ).toBe(date);
    expect(
      document.querySelector<HTMLInputElement>(
        'input[aria-label="发泡订单 GD-1"]',
      )!.checked,
    ).toBe(true);
    await check('发泡订单 GD-2');
    await input('mix-batch-workers', '7', 'change');
    expect(document.body.textContent).toContain('发泡甲');
    expect(document.body.textContent).not.toContain('开片乙');
    await click('预览发泡任务');
    expect(api.preview).toHaveBeenCalledWith({
      productionOrderIds: [1, 2],
      workDate: date,
      workerIds: [7],
      note: undefined,
    });
    expect(document.querySelectorAll('tbody tr')).toHaveLength(5);
    expect(document.body.textContent).toContain('正面层 · 2 mm');
    expect(document.body.textContent).toContain('反面层 · 4 mm');
    expect(
      document.querySelector<HTMLInputElement>(
        'input[aria-label="安排 front"]',
      )!.checked,
    ).toBe(true);
    expect(
      document.querySelector<HTMLInputElement>(
        'input[aria-label="安排 blocked"]',
      )!.disabled,
    ).toBe(true);
    expect(document.body.textContent).toContain('制造结构尚未确认');
    expect(
      document.querySelector<HTMLInputElement>(
        'input[aria-label="安排 skipped"]',
      )!.disabled,
    ).toBe(true);
    expect(document.body.textContent).toContain('已有任务覆盖，无需重复安排');
    await click('下发选中的 3 项');
    expect(api.release).toHaveBeenCalledTimes(1);
    expect(api.release).toHaveBeenCalledWith(
      expect.objectContaining({
        productionOrderIds: [1, 2],
        workDate: date,
        workerIds: [7],
        rowKeys: ['front', 'back', 'other'],
        previewKey: 'hash1',
      }),
    );
    expect(released).toHaveBeenCalledWith(90);
    expect(opened.value).toBe(false);
  });
  it('修改共同日期、人员、订单或备注会作废预览，必须重新核对', async () => {
    await mount({ initialOrderNo: 'GD-1' });
    await click('预览发泡任务');
    await input('mix-batch-date', dayjs().add(2, 'day').format('YYYY-MM-DD'));
    expect(document.querySelector('tbody')).toBeNull();
    expect(button('下发选中').disabled).toBe(true);
    await click('预览发泡任务');
    await input('mix-batch-workers', '7', 'change');
    expect(button('下发选中').disabled).toBe(true);
    await click('预览发泡任务');
    await input('mix-batch-note', '本批说明');
    expect(button('下发选中').disabled).toBe(true);
    await click('预览发泡任务');
    await check('发泡订单 GD-2');
    expect(button('下发选中').disabled).toBe(true);
    expect(api.release).not.toHaveBeenCalled();
  });
  it('提交失败保留勾选和请求标识，重试相同请求不会拆为多次单条提交', async () => {
    api.release.mockRejectedValueOnce(new Error('网络暂时不可用'));
    await mount({ initialOrderNo: 'GD-1' });
    await click('预览发泡任务');
    await check('安排 back', false);
    await click('下发选中的 2 项');
    expect(opened.value).toBe(true);
    expect(document.body.textContent).toContain('网络暂时不可用');
    const first = api.release.mock.calls[0]![0];
    expect(first.rowKeys).toEqual(['front', 'other']);
    await click('下发选中的 2 项');
    expect(api.release.mock.calls[1]![0]).toEqual(first);
  });
  it('关闭后忽略尚未返回的旧预览，不泄露到下一次打开', async () => {
    let resolve!: (value: MixBatchPreview) => void;
    api.preview.mockReturnValue(
      new Promise<MixBatchPreview>((done) => {
        resolve = done;
      }),
    );
    await mount({ initialOrderNo: 'GD-1' });
    await click('预览发泡任务');
    opened.value = false;
    await flush();
    resolve(preview());
    await flush();
    opened.value = true;
    await flush();
    expect(document.querySelector('tbody')).toBeNull();
    expect(button('下发选中').disabled).toBe(true);
  });
  it('超过 50 单明确阻止预览，不能静默截取订单', async () => {
    api.orders.mockResolvedValue(
      Array.from({ length: 51 }, (_, index) => order(index + 1)),
    );
    await mount({
      orders: Array.from({ length: 51 }, (_, index) => order(index + 1)),
    });
    expect(document.body.textContent).toContain('已选 51 张订单');
    expect(button('预览发泡任务').disabled).toBe(true);
    await click('预览发泡任务');
    expect(api.preview).not.toHaveBeenCalled();
  });
  it('超过 300 项保留全部预览并禁止提交，取消部分后可下发', async () => {
    api.preview.mockResolvedValue({
      ...preview(),
      rows: Array.from({ length: 301 }, (_, index) => row(`row-${index}`)),
      readyCount: 301,
    });
    await mount({ initialOrderNo: 'GD-1' });
    await click('预览发泡任务');
    expect(document.querySelectorAll('tbody tr')).toHaveLength(301);
    expect(document.body.textContent).toContain(
      '每批最多下发 300 项，当前已选 301 项',
    );
    expect(button('下发选中').disabled).toBe(true);
    await check('安排 row-300', false);
    expect(button('下发选中').disabled).toBe(false);
    await click('下发选中');
    expect(api.release.mock.calls[0]![0].rowKeys).toHaveLength(300);
  });
  it('订单仅显示两个产品摘要，搜索仍覆盖全部明细', async () => {
    api.orders.mockResolvedValue([
      {
        ...order(1),
        items: Array.from({ length: 18 }, (_, index) => ({
          productName: `特殊产品-${index}`,
        })),
      },
      order(2),
    ]);
    await mount();
    expect(
      document.querySelector('.batch-order-products')!.textContent,
    ).toContain('等 18 个产品');
    expect(
      document.querySelector('.batch-order-products')!.textContent,
    ).not.toContain('特殊产品-17');
    await input('mix-batch-order-search', '特殊产品-17');
    expect(document.querySelectorAll('.batch-order')).toHaveLength(1);
    expect(document.querySelector('.batch-order')!.textContent).toContain(
      'GD-1',
    );
  });
  it('后端拒绝过期预览时保留错误，刷新预览取得新键后才改用新请求', async () => {
    api.release.mockRejectedValueOnce(new Error('预览已过期，请刷新预览'));
    await mount({ initialOrderNo: 'GD-1' });
    await click('预览发泡任务');
    await click('下发选中');
    expect(document.body.textContent).toContain('预览已过期');
    const first = api.release.mock.calls[0]![0];
    api.preview.mockResolvedValue({ ...preview(), previewKey: 'hash2' });
    await click('刷新发泡预览');
    await click('下发选中');
    expect(api.release.mock.calls[1]![0].previewKey).toBe('hash2');
    expect(api.release.mock.calls[1]![0].requestId).not.toBe(first.requestId);
  });
});
