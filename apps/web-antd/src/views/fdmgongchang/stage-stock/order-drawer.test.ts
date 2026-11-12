import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { createApp, defineComponent, h, nextTick, reactive } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import OrderDrawer from './modules/order-drawer.vue';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  getOrder: vi.fn(),
  operators: vi.fn(),
  page: vi.fn(),
  preview: vi.fn(),
  match: vi.fn(),
  report: vi.fn(),
  productionOrders: vi.fn(),
}));
vi.mock('#/api/fdmgongchang/stage-stock', () => ({
  createOrder: mocks.create,
  getOrder: mocks.getOrder,
  getOrderOperators: mocks.operators,
  getStockPage: mocks.page,
  previewItemCodes: mocks.preview,
  reportOrder: mocks.report,
}));
vi.mock('#/api/fdmgongchang/production-order', () => ({ getOpenProductionOrders: mocks.productionOrders }));
vi.mock('#/api/fdmgongchang/schedule', () => ({ getScheduleTasks: vi.fn().mockResolvedValue([]) }));
vi.mock('#/api/fdmgongchang/wage', () => ({ matchWageItems: mocks.match }));
vi.mock('@vben/stores', () => ({
  useUserStore: () => ({ userInfo: { id: 7 } }),
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
      label: '发泡',
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

function findButton(text: string) {
  return [...document.querySelectorAll('button')].find((b) =>
    b.textContent?.replaceAll(/\s/g, '').includes(text),
  );
}

function clickButton(text: string) {
  const button = findButton(text);
  if (!button) throw new Error(`missing button ${text}`);
  button.click();
}

/** 新建是分步填写：一路点「下一步」到最后一步再提交；某一步没通过检查时停在那一步。 */
async function submitCreate(text: string) {
  await vi.advanceTimersByTimeAsync(400);
  await flush();
  for (let i = 0; i < 4; i++) {
    const next = findButton('下一步');
    if (!next) {
      clickButton(text);
      return;
    }
    next.click();
    await flush();
    if (document.querySelector('.ant-alert-error')) return;
  }
  throw new Error(`never reached ${text}`);
}

describe('order drawer', () => {
  let host: HTMLDivElement;
  let unmount: () => void;
  const state = reactive<{
    mode: 'create' | 'report';
    open: boolean;
    orderId?: number;
  }>({ mode: 'create', open: false });
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
    mocks.productionOrders.mockResolvedValue([]);
    mocks.match.mockResolvedValue([{ itemId: 41, matched: true, name: '开片', price: 27, score: 0, unit: 'm³' }]);
    mocks.operators.mockResolvedValue([
      { deptName: '开片车间', nickname: '张三', team: '开片一组', userId: 3 },
      { deptName: '开片车间', nickname: '测试', team: '开片一组', userId: 7 },
    ]);
    host = document.createElement('div');
    document.body.append(host);
    const app = createApp(
      defineComponent({
        setup: () => () =>
          h(OrderDrawer, {
            initialStage: 'BOARD',
            mode: state.mode,
            orderId: state.orderId,
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
    state.mode = 'create';
    state.orderId = undefined;
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
    expect(document.querySelector('[id^="out-"][id$="-thickness"]')).toBeTruthy();
    expect(document.querySelector('[id^="out-"][id$="-length"]')).toBeNull();
    expect(document.body.textContent).toContain('厚度填写目标单层厚度');
    expect(document.querySelector('[id^="out-"][id$="-color"]')).toBeNull();
    // 像人一样逐个输入：每次输入之间让界面先刷新
    for (const [index, key] of ids.entries()) {
      expect((document.querySelector(`#out-good-${key}`) as HTMLInputElement).value).toBe('');
      typeInto(`out-${key}-thickness`, '3');
      typeInto(`out-good-${key}`, index === 0 ? '236' : '198');
      typeInto(`out-defect-${key}`, index === 0 ? '4' : '2');
    }
    await flush();
    expect(document.body.textContent).toContain(
      '良品 434 片，残次 6 片（残次率 1.4%）',
    );

    await submitCreate('提交领料并入库');
    await flush();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    const payload = mocks.create.mock.calls[0]![0] as Api.OrderCreateReq;
    expect(mocks.operators).toHaveBeenCalledWith('SLICE');
    expect(payload).toMatchObject({
      finish: true,
      operatorUserId: 7,
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
          length: 190,
          material: 'TPE',
          recipeCode: 'REC-001',
          thickness: 0.3,
          width: 130,
        },
        batchNo: 'MB1',
        defectQuantity: 4,
        goodQuantity: 236,
        sourceItemIds: [1],
      },
      {
        attrs: {
          color: 'GY',
          length: 190,
          material: 'TPE',
          recipeCode: 'REC-001',
          thickness: 0.3,
          width: 130,
        },
        batchNo: 'MB2',
        defectQuantity: 2,
        goodQuantity: 198,
        sourceItemIds: [2],
      },
    ]);
    expect(saved).toHaveBeenCalledWith(
      expect.stringContaining('片材入 434 片'),
      'SHEET',
    );
  });

  it('selects a two-colour 6.5 mm order before reporting and prefills 3.25 mm layers without rounding', async () => {
    const thickBoard = stock(1, 'BOARD', 'PU', 'MB1', 100);
    mocks.page.mockResolvedValue({ list: [{ ...thickBoard, item: { ...thickBoard.item, thickness: 4.8 } }], total: 1 });
    mocks.productionOrders.mockResolvedValue([{ id: 9, orderNo: 'GC-009', items: [{ id: 90,
      productName: '双色瑜伽垫', productId: 'MAT', quantity: 100, completedQuantity: 0,
      processes: ['SLICE', 'LAMINATE'], targetThickness: 0.65, targetFrontColor: 'PU', targetBackColor: 'GY',
      targetColorMode: 'DUAL', targetConstructionType: 'DOUBLE_LAYER', targetFrontThickness: 0.325, targetBackThickness: 0.325,
    }] }]);
    state.open = true; await flush();
    const selector = document.querySelector('#order-production-item')!.closest('.ant-select')!.querySelector('.ant-select-selector')!;
    expect(selector.closest('section')?.style.display).not.toBe('none');
    selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await flush();
    [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find((element) => element.getAttribute('title')?.includes('GC-009'))!.click();
    await flush(); typeInto('order-take-1', '2'); await flush();
    const thickness = document.querySelector<HTMLInputElement>('[id^="out-"][id$="-thickness"]')!;
    expect(Number(thickness.value)).toBe(3.25);
    const key = thickness.id.replace(/^out-/, '').replace(/-thickness$/, '');
    typeInto(`out-good-${key}`, '2'); await flush();
    await submitCreate('提交领料并入库'); await flush();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ productionOrderItemId: 90,
      outputs: [expect.objectContaining({ attrs: expect.objectContaining({ thickness: 0.325 }) })] }));
  });

  it('blocks submission with a readable list when sizes are missing', async () => {
    const incomplete = stock(1, 'BOARD', 'PU', 'MB1', 100);
    mocks.page.mockResolvedValue({ list: [{ ...incomplete, item: { ...incomplete.item, thickness: null } }], total: 1 });
    state.open = true;
    await flush();
    typeInto('order-take-1', '10');
    await flush();
    const key = document
      .querySelector('[id^="out-batch-"]')!
      .id.replace('out-batch-', '');
    typeInto(`out-good-${key}`, '20');
    await flush();
    await submitCreate('提交领料并入库');
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
    await submitCreate('提交领料');
    await flush();
    const payload = mocks.create.mock.calls[0]![0] as Api.OrderCreateReq;
    expect(payload).toMatchObject({ finish: false, outputs: [] });
    expect(saved).toHaveBeenCalledWith(
      expect.stringContaining('进入车间在制'),
      'BOARD',
    );
  });

  it('allows one stock batch to supply both laminate faces as separate input lines', async () => {
    mocks.page.mockResolvedValue({ list: [stock(1, 'SHEET', 'PU', 'SAME', 300)], total: 1 });
    state.open = true; await flush();
    const process = document.querySelector<HTMLInputElement>('input[value="LAMINATE"]');
    expect(process).toBeTruthy(); process!.click(); await flush();
    typeInto('order-take-1', '10'); await flush();
    typeInto('order-take-opposite-1', '10'); await flush();
    document.querySelector<HTMLInputElement>('input[value="false"]')!.click(); await flush();
    await submitCreate('提交领料'); await flush();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ process: 'LAMINATE', finish: false, inputs: [
      { stockId: 1, quantity: 10, laminationSide: 'FRONT' },
      { stockId: 1, quantity: 10, laminationSide: 'BACK' },
    ] }));
  });

  it('asks to assign the post first when nobody can do this process', async () => {
    mocks.operators.mockResolvedValue([]);
    state.open = true;
    await flush();
    typeInto('order-take-2', '50');
    await flush();
    [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
      .find((r) => r.value === 'false')!
      .click();
    await flush();
    await submitCreate('提交领料');
    await flush();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      '还没有人分配「开片」岗位，请先到 黄石工厂 → 人员与工资 → 人员岗位 里分配。',
    );
  });

  it('reports one batch and keeps the order in progress, then closes it without new output', async () => {
    const inProgress: Api.Order = {
      defectQuantity: 0,
      goodQuantity: 0,
      id: 5,
      inputQuantity: 50,
      inputs: [
        {
          batchNo: 'MB2',
          id: 51,
          item: stock(2, 'BOARD', 'GY', 'MB2', 100).item,
          itemCode: 'BC-TPE-REC001-GY-190X130X0.3',
          location: '板材区',
          quantity: 50,
          returnedQuantity: 10,
          stage: 'BOARD',
          stockId: 2,
        },
      ],
      issuedAt: '2026-10-10 08:00:00',
      orderNo: 'GX20261010-001',
      operatorUserId: 7,
      outputStage: 'SHEET',
      outputAttrs: { thickness: 0.3 },
      outputs: [],
      process: 'SLICE',
      reportCount: 0,
      sourceStage: 'BOARD',
      status: 'IN_PROGRESS',
    };
    mocks.getOrder.mockResolvedValue(inProgress);
    mocks.report.mockResolvedValue(true);
    state.mode = 'report';
    state.orderId = 5;
    await nextTick();
    state.open = true;
    await flush();
    expect(document.body.textContent).toContain('报产出 · GX20261010-001');
    expect(document.body.textContent).toContain('40');

    const key = document
      .querySelector('[id^="out-batch-"]')!
      .id.replace('out-batch-', '');
    expect(Number((document.querySelector(`#out-${key}-thickness`) as HTMLInputElement).value)).toBe(3);
    typeInto(`out-good-${key}`, '30');
    await flush();
    [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
      .find((r) => r.value === 'false')!
      .click();
    await flush();
    await vi.advanceTimersByTimeAsync(400);
    await flush();
    clickButton('登记这一批');
    await flush();
    expect(mocks.report.mock.calls[0]![0]).toMatchObject({
      finish: false,
      id: 5,
      outputs: [expect.objectContaining({ goodQuantity: 30 })],
    });
    expect(saved).toHaveBeenCalledWith(
      expect.stringContaining('单子继续在制'),
      'SHEET',
    );

    // 已经报过一次：关单时可以不再填产出
    state.open = false;
    await flush();
    mocks.getOrder.mockResolvedValue({
      ...inProgress,
      goodQuantity: 30,
      reportCount: 1,
    });
    state.open = true;
    await flush();
    expect(document.body.textContent).toContain('已报 1 次');
    clickButton('确认报完并关单');
    await flush();
    expect(mocks.report.mock.calls[1]![0]).toEqual({
      finish: true,
      id: 5,
      outputs: [],
      pieceworks: [],
    });
  });

  it('records slice wages with total good cubic metres and a single shared rate', async () => {
    mocks.match.mockResolvedValue([
      { itemId: 41, matched: true, name: '开片', price: 27, score: 0, unit: 'm³' },
      { itemId: 23, matched: false, name: '单片', price: 0.27, score: 0, unit: '片', productType: null },
    ]);
    state.open = true;
    await flush();
    typeInto('order-take-2', '50');
    await flush();
    const key = document
      .querySelector('[id^="out-batch-"]')!
      .id.replace('out-batch-', '');
    typeInto(`out-${key}-thickness`, '3');
    typeInto(`out-good-${key}`, '98');
    await flush();
    await vi.advanceTimersByTimeAsync(400);
    await flush();
    expect(mocks.match).toHaveBeenCalledWith(
      expect.objectContaining({ process: 'SLICE', width: 130, thickness: 0.3 }),
    );
    expect(document.body.textContent).toContain('计件');
    expect(document.body.textContent).toContain('0.72618 m³ × ¥27/m³');
    expect(document.body.textContent).toContain('¥19.61');
    expect(document.querySelector('[id^="piece-item-"]')).toBeNull();
    expect(document.querySelector('[id^="piece-qty-"]')).toBeNull();

    await submitCreate('提交领料并入库');
    await flush();
    expect(mocks.create.mock.calls[0]![0]).toMatchObject({
      pieceworks: [{ itemId: 41, quantity: '0.72618', userId: 7 }],
    });
  });

  it('blocks slice reporting when only an obsolete per-piece rate is configured', async () => {
    mocks.match.mockResolvedValue([{ itemId: 23, matched: true, name: '开片1700以上', price: 24, score: 0, unit: '待定' }]);
    state.open = true;
    await flush();
    typeInto('order-take-2', '50');
    await flush();
    const key = document.querySelector('[id^="out-batch-"]')!.id.replace('out-batch-', '');
    typeInto(`out-${key}-thickness`, '3');
    typeInto(`out-good-${key}`, '30');
    await flush();
    await submitCreate('提交领料并入库');
    await flush();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('开片计价未配置');
  });

  it('shares the same batch wage when a second slice worker is selected', async () => {
    state.open = true;
    await flush();
    typeInto('order-take-2', '50');
    await flush();
    const key = document.querySelector('[id^="out-batch-"]')!.id.replace('out-batch-', '');
    typeInto(`out-${key}-thickness`, '3');
    typeInto(`out-good-${key}`, '98');
    await vi.advanceTimersByTimeAsync(400);
    await flush();
    clickButton('加一个人');
    await flush();
    const people = [...document.querySelectorAll('[id^="piece-user-"]')];
    people[1]!.closest('.ant-select')!.querySelector('.ant-select-selector')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flush();
    const option = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')]
      .find((element) => element.getAttribute('title')?.includes('张三'));
    expect(option).toBeDefined();
    option!.click();
    await flush();
    expect(document.body.textContent).toContain('¥19.61');
    expect(document.body.textContent).toContain('分得 ¥9.81');
    expect(document.body.textContent).toContain('分得 ¥9.80');
    await submitCreate('提交领料并入库');
    await flush();
    expect(mocks.create.mock.calls[0]![0]).toMatchObject({ pieceworks: [
      { itemId: 41, quantity: '0.72618', userId: 7 },
      { itemId: 41, quantity: '0.72618', userId: 3 },
    ] });
  });
});
