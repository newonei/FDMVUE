import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { createApp, defineComponent, h, nextTick, reactive } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import OrderDrawer from './modules/order-drawer.vue';

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  create: vi.fn(),
  getOrder: vi.fn(),
  makeTasks: vi.fn(),
  page: vi.fn(),
  preview: vi.fn(),
}));
vi.mock('#/api/fdmgongchang/stage-stock', () => ({
  completeOrder: mocks.complete,
  createOrder: mocks.create,
  getMakeTasks: mocks.makeTasks,
  getOrder: mocks.getOrder,
  getStockPage: mocks.page,
  previewItemCodes: mocks.preview,
}));

const options: Api.Options = {
  colors: [
    { label: '紫色', value: 'PU' },
    { label: '灰色', value: 'GY' },
  ],
  materials: [{ label: 'TPE', value: 'TPE' }],
  patterns: [],
  processes: [
    {
      allowedSources: ['RAW'],
      code: 'MIX',
      label: '密炼挤出发泡',
      outputStage: 'BOARD',
      sources: ['RAW'],
    },
    {
      allowedSources: ['BOARD'],
      code: 'SLICE',
      label: '开片',
      outputStage: 'SHEET',
      sources: ['BOARD'],
    },
    {
      allowedSources: ['SHEET', 'BOARD'],
      code: 'LAMINATE',
      label: '贴合',
      outputStage: 'LAMINATED',
      sources: ['SHEET'],
    },
    {
      allowedSources: ['LAMINATED', 'SHEET', 'BOARD'],
      code: 'EMBOSS',
      label: '压花',
      outputStage: 'EMBOSSED',
      sources: ['LAMINATED', 'SHEET'],
    },
  ],
  rawMaterials: [],
  recipes: [{ code: 'REC-001', enabled: true, name: '常规款' }],
  stages: [
    { code: 'RAW', defaultLocation: '原料仓', label: '原材料', unit: 'kg' },
    {
      code: 'BOARD',
      codePrefix: 'BC',
      defaultLocation: '板材区',
      label: '板材',
      unit: '张',
    },
    {
      code: 'SHEET',
      codePrefix: 'PC',
      defaultLocation: '片材区',
      label: '片材',
      unit: '片',
    },
    {
      code: 'LAMINATED',
      codePrefix: 'TH',
      defaultLocation: '半成品区',
      label: '已贴合片材',
      unit: '片',
    },
    {
      code: 'EMBOSSED',
      codePrefix: 'YH',
      defaultLocation: '半成品区',
      label: '已压花片材',
      unit: '片',
    },
  ],
  textures: [
    { label: '贝壳纹', value: 'SH' },
    { label: '防滑纹', value: 'AS' },
  ],
};

function stock(
  id: number,
  stage: string,
  color: string,
  batchNo: string,
  quantity: number,
): Api.Stock {
  return {
    batchNo,
    id,
    item: {
      color,
      length: 190,
      material: 'TPE',
      recipeCode: 'REC-001',
      thickness: 0.3,
      width: 130,
    },
    itemCode: `BC-TPE-REC001-${color}-190X130X0.3`,
    itemId: id,
    location: '板材区',
    quantity,
    stage,
  };
}

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    await nextTick();
  }
};

function typeInto(id: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`missing input #${id}`);
  input.focus();
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));
}

function clickButton(text: string) {
  const button = [...document.querySelectorAll('button')].find((b) =>
    b.textContent?.replaceAll(/\s/g, '').includes(text),
  );
  if (!button) throw new Error(`missing button ${text}`);
  button.click();
}

describe('order drawer', () => {
  let host: HTMLDivElement;
  let unmount: () => void;
  const state = reactive<{
    open: boolean;
    task?: { assignmentId: string; contractId: string };
  }>({ open: false });
  const saved = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    mocks.page.mockResolvedValue({
      list: [
        stock(1, 'BOARD', 'PU', 'MB1', 300),
        stock(2, 'BOARD', 'GY', 'MB2', 100),
      ],
      total: 2,
    });
    mocks.preview.mockImplementation(async (rows: unknown[]) =>
      rows.map((_, i) => `CODE-${i}`),
    );
    mocks.create.mockResolvedValue(9);
    mocks.makeTasks.mockResolvedValue([]);
    host = document.createElement('div');
    document.body.append(host);
    const app = createApp(
      defineComponent({
        setup: () => () =>
          h(OrderDrawer, {
            initialStage: 'BOARD',
            initialTask: state.task,
            mode: 'create',
            onSaved: saved,
            'onUpdate:open': (v: boolean) => (state.open = v),
            open: state.open,
            options,
          }),
      }),
    );
    app.mount(host);
    unmount = () => app.unmount();
  });

  afterEach(() => {
    unmount();
    host.remove();
    document.body.innerHTML = '';
    state.open = false;
    state.task = undefined;
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('slices two board colours into two output lines and submits each with its own batch', async () => {
    state.open = true;
    await flush();
    expect(mocks.page).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 200, stage: 'BOARD' }),
    );

    typeInto('order-take-1', '120');
    typeInto('order-take-2', '100');
    await flush();
    expect(document.body.textContent).toContain('领料 220 张');

    const outputs = document.querySelectorAll('[id^="out-batch-"]');
    expect(outputs).toHaveLength(2);
    const ids = [...outputs].map((el) => el.id.replace('out-batch-', ''));
    expect((outputs[0] as HTMLInputElement).value).toBe('MB1');
    expect((outputs[1] as HTMLInputElement).value).toBe('MB2');
    // 像人一样逐个输入：每次输入之间让界面先刷新
    for (const [index, key] of ids.entries()) {
      for (const [field, value] of [
        ['length', '185'],
        ['width', '63'],
      ] as const) {
        typeInto(`out-${key}-${field}`, value);
        await flush();
      }
      typeInto(`out-good-${key}`, index === 0 ? '236' : '198');
      typeInto(`out-defect-${key}`, index === 0 ? '4' : '2');
    }
    await flush();
    expect(document.body.textContent).toContain(
      '良品 434 片，残次 6 片（残次率 1.4%）',
    );

    clickButton('提交领料并入库');
    await flush();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    const payload = mocks.create.mock.calls[0]![0] as Api.OrderCreateReq;
    expect(payload).toMatchObject({
      finish: true,
      process: 'SLICE',
      sourceStage: 'BOARD',
    });
    expect(payload.inputs).toEqual([
      { laminationSide: undefined, quantity: 120, stockId: 1 },
      { laminationSide: undefined, quantity: 100, stockId: 2 },
    ]);
    expect(payload.outputs).toEqual([
      {
        attrs: {
          color: 'PU',
          length: 185,
          material: 'TPE',
          thickness: 0.3,
          width: 63,
        },
        batchNo: 'MB1',
        defectQuantity: 4,
        goodQuantity: 236,
      },
      {
        attrs: {
          color: 'GY',
          length: 185,
          material: 'TPE',
          thickness: 0.3,
          width: 63,
        },
        batchNo: 'MB2',
        defectQuantity: 2,
        goodQuantity: 198,
      },
    ]);
    expect(saved).toHaveBeenCalledWith(
      expect.stringContaining('片材入 434 片'),
      'SHEET',
    );
  });

  it('blocks submission with a readable list when sizes are missing', async () => {
    state.open = true;
    await flush();
    typeInto('order-take-1', '10');
    await flush();
    const key = document
      .querySelector('[id^="out-batch-"]')!
      .id.replace('out-batch-', '');
    typeInto(`out-good-${key}`, '20');
    await flush();
    clickButton('提交领料并入库');
    await flush();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      '第 1 行请填完整的长、宽、厚。',
    );
  });

  it('can issue only, leaving the order in progress without outputs', async () => {
    state.open = true;
    await flush();
    typeInto('order-take-2', '50');
    await flush();
    const radios = [
      ...document.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    ];
    radios.find((r) => r.value === 'false')!.click();
    await flush();
    expect(document.querySelectorAll('[id^="out-batch-"]')).toHaveLength(0);
    clickButton('提交领料');
    await flush();
    const payload = mocks.create.mock.calls[0]![0] as Api.OrderCreateReq;
    expect(payload).toMatchObject({ finish: false, outputs: [] });
    expect(saved).toHaveBeenCalledWith(
      expect.stringContaining('进入车间在制'),
      'BOARD',
    );
  });

  it('links a ready make task from the trade list and submits its contract and assignment', async () => {
    mocks.makeTasks.mockResolvedValue([
      {
        approvedQuantity: 100,
        assignmentId: 'a1',
        assignmentQuantity: 100,
        completedQuantity: 0,
        contractCode: 'HT-20261008-001',
        contractId: 'c1',
        contractItemId: 'i1',
        customerName: '美国客户',
        inProgressOrderCount: 0,
        itemQuantity: 100,
        linkedOrderCount: 0,
        productName: '紫灰双色瑜伽垫',
        ready: true,
        shippedQuantity: 0,
        unit: '张',
      },
    ]);
    state.task = { assignmentId: 'a1', contractId: 'c1' };
    await nextTick();
    state.open = true;
    await flush();
    expect(document.body.textContent).toContain('HT-20261008-001');
    typeInto('order-take-1', '10');
    await flush();
    [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
      .find((r) => r.value === 'false')!
      .click();
    await flush();
    clickButton('提交领料');
    await flush();
    expect(mocks.create.mock.calls[0]![0]).toMatchObject({
      assignmentId: 'a1',
      contractId: 'c1',
      finish: false,
    });
  });
});
