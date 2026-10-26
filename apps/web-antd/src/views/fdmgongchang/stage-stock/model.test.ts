import type { InputLine } from './model';

import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { describe, expect, it } from 'vitest';

import {
  applySliceYield,
  attrSummary,
  deriveOutputs,
  EDITABLE_FIELDS,
  groupStages,
  guessPackedAttrs,
  isLayered,
  issueSeqLabel,
  joinBatches,
  lineBatch,
  makeLabels,
  materialGap,
  normalizeForStage,
  parseSizeText,
  pickAuxStocks,
  recipeCheck,
  recipePicks,
  sliceHint,
  slicePerBoard,
  stageColumns,
  stageFlow,
  stockSpec,
  stockTitle,
  stockUnit,
  suggestAuxQuantity,
  sumQty,
  validateOutputs,
  validateTradeReceipt,
} from './model';

function line(
  id: number,
  stage: string,
  item: Api.ItemAttrs,
  batchNo: string,
  quantity: number,
  side?: Api.LaminationSide,
): InputLine {
  return {
    quantity,
    side,
    stock: {
      batchNo,
      id,
      item,
      itemCode: `CODE-${id}`,
      location: '库位',
      quantity: 100,
      stage,
    },
  };
}

const board = (color: string, thickness = 0.3): Api.ItemAttrs => ({
  color,
  length: 190,
  material: 'TPE',
  recipeCode: 'REC-001',
  thickness,
  width: 130,
});

const options = {
  colors: [
    { label: '紫色', value: 'PU' },
    { label: '灰色', value: 'GY' },
  ],
  materials: [{ label: 'TPE', value: 'TPE' }],
  patterns: [{ label: '体位线', value: 'TW' }],
  processes: [],
  rawMaterials: [],
  recipes: [{ code: 'REC-001', enabled: true, name: '常规款（密度110）' }],
  stages: [],
  textures: [
    { label: '贝壳纹', value: 'SH' },
    { label: '防滑纹', value: 'AS' },
  ],
} satisfies Api.Options;

describe('deriveOutputs', () => {
  it('splits a mixed-colour slicing job into one line per colour and keeps each batch', () => {
    const outputs = deriveOutputs('SLICE', [
      line(1, 'BOARD', board('PU'), 'MB1', 10),
      line(2, 'BOARD', board('GY'), 'MB2', 5),
      line(3, 'BOARD', board('PU'), 'MB3', 2),
    ]);
    expect(outputs).toHaveLength(2);
    expect(outputs[0]!.attrs).toMatchObject({ color: 'PU', thickness: 0.3 });
    expect(outputs[0]!.attrs.length).toBeUndefined();
    expect(outputs[0]!.batchNo).toBe('MB1/MB3');
    expect(outputs[1]!.batchNo).toBe('MB2');
  });

  it('builds a laminated sheet from the front and back sides', () => {
    const outputs = deriveOutputs('LAMINATE', [
      line(
        1,
        'SHEET',
        { ...board('GY'), length: 185, width: 63 },
        'B2',
        10,
        'BACK',
      ),
      line(
        2,
        'SHEET',
        { ...board('PU'), length: 185, width: 63 },
        'B1',
        10,
        'FRONT',
      ),
    ]);
    expect(outputs).toHaveLength(1);
    expect(outputs[0]!.attrs).toMatchObject({
      backColor: 'GY',
      frontColor: 'PU',
      length: 185,
      thickness: 0.6,
      width: 63,
    });
    expect(outputs[0]!.batchNo).toBe('B1/B2');
  });

  it('treats a single-layer sheet as same colour on both sides when lamination is skipped', () => {
    const outputs = deriveOutputs('PUNCH', [
      line(1, 'SHEET', { ...board('PU'), length: 185, width: 63 }, 'B1', 3),
    ]);
    expect(outputs[0]!.attrs).toMatchObject({
      backColor: 'PU',
      color: null,
      frontColor: 'PU',
    });
    expect(normalizeForStage('PUNCHED', outputs[0]!.attrs)).not.toHaveProperty(
      'recipeCode',
    );
  });

  it('leaves textures and pattern for the operator to choose', () => {
    const laminated = {
      backColor: 'GY',
      frontColor: 'PU',
      length: 185,
      material: 'TPE',
      thickness: 0.6,
      width: 63,
    };
    expect(
      deriveOutputs('EMBOSS', [line(1, 'LAMINATED', laminated, 'B', 1)])[0]!
        .attrs.textureFront,
    ).toBeNull();
    const punched = { ...laminated, textureBack: 'AS', textureFront: 'SH' };
    const engraved = deriveOutputs('ENGRAVE', [
      line(1, 'PUNCHED', punched, 'B', 1),
    ])[0]!;
    expect(engraved.attrs).toMatchObject({ pattern: null, textureFront: 'SH' });
  });

  it('starts a mixing job with an empty batch so the server generates it', () => {
    const outputs = deriveOutputs('MIX', [
      line(1, 'RAW', { rawMaterialCode: 'MAT-TPE' }, 'RM1', 600),
    ]);
    expect(outputs[0]!.batchNo).toBe('');
    expect(outputs[0]!.attrs.material).toBe('TPE');
  });
});

describe('batches and labels', () => {
  it('re-picks the batch when the slicing colour changes', () => {
    const inputs = [
      line(1, 'BOARD', board('PU'), 'MB1', 1),
      line(2, 'BOARD', board('GY'), 'MB2', 1),
    ];
    const [out] = deriveOutputs('SLICE', inputs.slice(0, 1));
    out!.attrs.color = 'GY';
    expect(lineBatch('SLICE', out!, inputs)).toBe('MB2');
  });

  it('joins batches without duplicates even when they are already joined', () => {
    expect(joinBatches(['A/B', 'B', ' C ', null])).toBe('A/B/C');
  });

  it('summarises attributes with dictionary labels', () => {
    const labels = makeLabels(options);
    const attrs = {
      backColor: 'GY',
      frontColor: 'PU',
      length: 185,
      material: 'TPE',
      textureBack: 'AS',
      textureFront: 'SH',
      thickness: 0.6,
      width: 63,
    };
    expect(attrSummary('EMBOSSED', attrs, labels)).toBe(
      'TPE · 紫色/灰色 · 185×63×0.6 · 贝壳纹/防滑纹',
    );
    expect(
      attrSummary('EMBOSSED', attrs, labels, ['textureFront', 'textureBack']),
    ).toBe('TPE · 紫色/灰色 · 185×63×0.6');
    expect(attrSummary('BOARD', board('PU'), labels)).toContain(
      '常规款（密度110）',
    );
  });

  it('shows layered colours and textures only from the stages that have them', () => {
    expect(stageColumns('SHEET')).toEqual(['material', 'color', 'size']);
    expect(stageColumns('ENGRAVED')).toContain('pattern');
    expect(stageColumns('LAMINATED')).not.toContain('textureFront');
  });

  it('adds decimal quantities without floating point noise', () => {
    expect(sumQty([0.1, 0.2, '1.005'])).toBe(1.305);
  });
});

describe('validateOutputs', () => {
  it('asks for missing quantities, sizes, colours and textures', () => {
    const [out] = deriveOutputs('EMBOSS', [
      line(
        1,
        'LAMINATED',
        {
          backColor: 'GY',
          frontColor: 'PU',
          length: 185,
          material: 'TPE',
          thickness: 0.6,
          width: 63,
        },
        'B',
        1,
      ),
    ]);
    expect(validateOutputs('EMBOSS', 'EMBOSSED', [out!])).toEqual([
      '请填写产出的良品或残次品数量。',
    ]);
    out!.goodQuantity = 5;
    expect(validateOutputs('EMBOSS', 'EMBOSSED', [out!])).toEqual([
      '第 1 行请选择正面或反面纹路。',
    ]);
    out!.attrs.textureBack = 'AS';
    expect(validateOutputs('EMBOSS', 'EMBOSSED', [out!])).toEqual([]);
  });

  it('requires a recipe and size when mixing', () => {
    const [out] = deriveOutputs('MIX', [
      line(1, 'RAW', { rawMaterialCode: 'MAT-TPE' }, 'RM1', 600),
    ]);
    out!.goodQuantity = 10;
    expect(validateOutputs('MIX', 'BOARD', [out!])).toEqual([
      '第 1 行请填完整的长、宽、厚。',
      '第 1 行请选择配方版本。',
      '第 1 行请选择颜色。',
    ]);
  });
});

describe('receiving helpers', () => {
  it('splits contract size text into length, width and thickness', () => {
    expect(parseSizeText('183x61x0.6')).toEqual({ length: 183, thickness: 0.6, width: 61 });
    expect(parseSizeText(' 183 × 61 × 0.6 cm ')).toEqual({ length: 183, thickness: 0.6, width: 61 });
    expect(parseSizeText('183*61*0.6CM')).toEqual({ length: 183, thickness: 0.6, width: 61 });
    expect(parseSizeText('6mm')).toEqual({});
    expect(parseSizeText(null)).toEqual({});
  });

  it('prefills packed attributes from the contract product and leaves unknown values empty', () => {
    const options = {
      colors: [
        { label: '丁香紫', value: 'DX' },
        { label: '灰色', value: 'HS' },
      ],
      materials: [{ label: 'TPE', value: 'TPE' }],
    };
    expect(
      guessPackedAttrs({ color: '丁香紫/hs', material: 'tpe', size: '183x61x0.6' }, options),
    ).toEqual({ backColor: 'HS', frontColor: 'DX', length: 183, material: 'TPE', thickness: 0.6, width: 61 });
    expect(
      guessPackedAttrs({ color: '丁香紫', material: 'PVC', size: '大号', specification: '183×61×0.8cm' }, options),
    ).toEqual({ backColor: 'DX', frontColor: 'DX', length: 183, material: 'TPE', thickness: 0.8, width: 61 });
    expect(guessPackedAttrs({ color: '彩虹' }, options)).toEqual({
      backColor: undefined,
      frontColor: undefined,
      material: 'TPE',
    });
  });

  it('checks bought-goods quantities the same way procurement arrivals did', () => {
    const base = { remaining: '200' };
    expect(validateTradeReceipt({ ...base, accepted: 200, quantity: 200 })).toEqual([]);
    expect(validateTradeReceipt({ ...base, accepted: 0, quantity: 3, reason: '整批不良' })).toEqual([]);
    expect(validateTradeReceipt({ ...base, accepted: 190, quantity: 200, reason: ' ' })).toEqual([
      '可入库数量少于实收数量，请填写异常原因。',
    ]);
    expect(validateTradeReceipt({ ...base, accepted: 210, quantity: 201 })).toEqual([
      '实收数量超过这行采购待到货的 200。',
      '可入库数量不能超过实收数量。',
    ]);
    expect(validateTradeReceipt({ ...base, accepted: undefined, quantity: 0 })).toEqual([
      '请填写大于 0 的实收数量。',
      '请填写可入库数量（良品），全部不良时填 0。',
    ]);
  });
});

describe('cross cutting', () => {
  it('keeps the single colour sheet and its batch so length and width can be cut', () => {
    const [line] = deriveOutputs('CUT', [
      {
        quantity: 10,
        stock: {
          batchNo: 'MB1',
          id: 1,
          item: { color: 'PU', length: 185, material: 'TPE', thickness: 0.6, width: 63 },
          itemCode: 'PC-TPE-PU-185X63X0.6',
          location: '片材区',
          quantity: 20,
          stage: 'SHEET',
        },
      },
    ]);
    expect(line!.attrs).toMatchObject({ color: 'PU', length: 185, thickness: 0.6, width: 63 });
    expect(line!.attrs.frontColor).toBeUndefined();
    expect(line!.batchNo).toBe('MB1');
    expect(EDITABLE_FIELDS.CUT).toEqual(['length', 'width']);
    expect(stageColumns('CUT')).toEqual(['material', 'color', 'size']);
  });
});

describe('recipe issuing', () => {
  const plan: Api.RecipePlan = {
    batches: 2,
    batchWeight: 15.5,
    lines: [
      {
        available: 45,
        issued: 0,
        perBatch: 10,
        picks: [
          { available: 15, batchNo: 'T1', itemCode: 'YL-TPE', location: '原料仓', quantity: 15, stockId: 1 },
          { available: 30, batchNo: 'T2', itemCode: 'YL-TPE', location: '原料仓', quantity: '5.000', stockId: 2 },
        ],
        rawMaterialCode: 'MAT-TPE',
        rawMaterialName: 'TPE',
        remaining: 20,
        required: 20,
        shortage: 0,
      },
      {
        available: 0,
        issued: 0.4,
        perBatch: 0.5,
        picks: [],
        rawMaterialCode: 'MAT-CM',
        rawMaterialName: '紫色母',
        remaining: 0.6,
        required: 1,
        shortage: 0.6,
      },
      {
        available: 8,
        issued: 2,
        perBatch: null,
        picks: [],
        rawMaterialCode: 'MAT-PE',
        rawMaterialName: 'PE',
        remaining: 0,
        required: null,
        shortage: 0,
      },
    ],
    recipeCode: 'REC-001',
    recipeEnabled: true,
    recipeName: '常规款',
    requiredTotal: 21,
    shortage: true,
  };

  it('turns the plan into issue lines, first in first out', () => {
    const picks = recipePicks(plan);
    expect(picks.map((p) => [p.stock.id, p.quantity])).toEqual([
      [1, 15],
      [2, 5],
    ]);
    expect(picks[0]!.stock.item?.rawMaterialCode).toBe('MAT-TPE');
    expect(picks[0]!.stock.stage).toBe('RAW');
  });

  it('compares what is filled with what the recipe asks for', () => {
    const raw = (id: number, code: string, qty: number) =>
      line(id, 'RAW', { rawMaterialCode: code, rawMaterialName: code }, `B${id}`, qty);
    const inputs = [raw(1, 'MAT-TPE', 15), raw(2, 'MAT-TPE', 4), raw(9, 'MAT-LLPE', 3)];
    expect(recipeCheck(plan, inputs)).toEqual([
      { code: 'MAT-TPE', filled: 19, name: 'TPE', target: 20 },
      { code: 'MAT-CM', filled: 0, name: '紫色母', target: 1 },
      { code: 'MAT-LLPE', filled: 3, name: 'MAT-LLPE', target: null },
    ]);
    // 补领对照「还要领」
    expect(recipeCheck(plan, [], true).map((c) => c.target)).toEqual([20, 0.6]);
    expect(recipeCheck(undefined, inputs)).toEqual([]);
  });

  it('defaults the board recipe to the order recipe for mixing', () => {
    const raw = [line(1, 'RAW', { rawMaterialCode: 'MAT-TPE' }, 'T1', 10)];
    expect(deriveOutputs('MIX', raw, 'TPE', 'REC-001')[0]!.attrs).toEqual({ material: 'TPE', recipeCode: 'REC-001' });
    expect(deriveOutputs('MIX', raw, 'TPE')[0]!.attrs).toEqual({ material: 'TPE' });
  });

  it('labels supplementary issue lines', () => {
    expect(issueSeqLabel(0)).toBe('');
    expect(issueSeqLabel(null)).toBe('');
    expect(issueSeqLabel(2)).toBe('第 2 次补领');
  });
});

describe('stage stock catalog', () => {
  const stages = [
    'RAW', 'BOARD', 'SHEET', 'CUT', 'LAMINATED', 'EMBOSSED', 'PUNCHED', 'ENGRAVED', 'FOLDED', 'PACKED', 'NEW',
  ].map((code) => ({ code, defaultLocation: '', label: code, unit: '片' }));
  const options = {
    colors: [{ label: '紫色', value: 'PU' }, { label: '灰色', value: 'GR' }],
    materials: [{ label: 'TPE', value: 'TPE' }],
    patterns: [],
    processes: [
      { allowedSources: ['RAW'], code: 'MIX', label: '密炼', outputStage: 'BOARD', sources: ['RAW'] },
      { allowedSources: ['BOARD'], code: 'SLICE', label: '开片', outputStage: 'SHEET', sources: ['BOARD'] },
      { allowedSources: ['SHEET'], code: 'CUT', label: '立切', outputStage: 'CUT', sources: ['SHEET'] },
      { allowedSources: ['SHEET', 'CUT'], code: 'LAMINATE', label: '贴合', outputStage: 'LAMINATED', sources: ['CUT', 'SHEET'] },
      { allowedSources: ['FOLDED'], code: 'PACK', label: '包装', outputStage: 'PACKED', sources: ['FOLDED'] },
    ],
    rawMaterials: [],
    recipes: [{ code: 'REC-001', enabled: true, name: '密度110' }],
    stages,
    textures: [],
  } as Api.Options;
  const labels = makeLabels(options);

  it('groups stages by catalog and keeps unknown stages under 其他', () => {
    expect(groupStages(stages).map((g) => [g.label, g.stages.map((s) => s.code)])).toEqual([
      ['原料与板材', ['RAW', 'BOARD']],
      ['半成品', ['SHEET', 'CUT', 'LAMINATED', 'EMBOSSED']],
      ['成品', ['PUNCHED', 'ENGRAVED', 'FOLDED', 'PACKED']],
      ['其他', ['NEW']],
    ]);
    expect(groupStages(stages.slice(0, 2)).map((g) => g.label)).toEqual(['原料与板材']);
  });

  it('builds the flow from the configured processes, including skip-stage sources', () => {
    expect(stageFlow('SHEET', options)).toEqual({ current: '当前SHEET', from: '开片产出', to: '立切、贴合领料' });
    expect(stageFlow('RAW', options)).toEqual({ current: '当前RAW', from: '采购到货', to: '密炼领料' });
    expect(stageFlow('PACKED', options)).toEqual({ current: '当前PACKED', from: '包装产出', to: '生产入库进仓库' });
  });

  it('names a stock row by material, colour and stage, and keeps the rest as spec', () => {
    const sheet = { color: 'PU', length: 180, material: 'TPE', thickness: 0.1, width: 100 };
    expect(stockTitle('SHEET', '片材', sheet, labels, 'C1')).toBe('TPE 紫色片材');
    expect(stockSpec('SHEET', sheet, labels)).toBe('180×100×0.1');
    const board = { ...sheet, recipeCode: 'REC-001' };
    expect(stockSpec('BOARD', board, labels)).toBe('180×100×0.1 · 密度110');
    const layered = { backColor: 'GR', frontColor: 'PU', material: 'TPE' };
    expect(stockTitle('LAMINATED', '已贴合片材', layered, labels, 'C2')).toBe('TPE 紫色/灰色已贴合片材');
    const single = { backColor: 'PU', frontColor: 'PU', material: 'TPE' };
    expect(stockTitle('LAMINATED', '已贴合片材', single, labels, 'C3')).toBe('TPE 紫色已贴合片材');
    expect(stockSpec('LAMINATED', single, labels)).toBe('单层');
    expect(stockTitle('RAW', '原材料', { rawCategory: 'MAIN', rawMaterialName: 'TPE粒子' }, labels, 'R1')).toBe('TPE粒子');
    expect(stockSpec('RAW', { rawCategory: 'MAIN' }, labels)).toBe('主材料');
    expect(stockTitle('SHEET', '片材', {}, labels, 'C4')).toBe('C4');
    expect(stockTitle('SHEET', '片材', null, labels, 'C5')).toBe('C5');
  });
});

describe('material gap', () => {
  it('shows input minus returned, good and defect only for finished one-to-one processes', () => {
    const base = { defectQuantity: 2, goodQuantity: 90, inputQuantity: 100, returnedQuantity: 3 };
    expect(materialGap({ ...base, process: 'PACK', status: 'COMPLETED' })).toBe(5);
    expect(materialGap({ ...base, process: 'PACK', status: 'IN_PROGRESS' })).toBeUndefined();
    // 开片、贴合、冲裁的领料和产出不是一比一，不算差额
    expect(materialGap({ ...base, process: 'SLICE', status: 'COMPLETED' })).toBeUndefined();
    expect(materialGap({ ...base, process: 'LAMINATE', status: 'COMPLETED' })).toBeUndefined();
  });
});


describe('辅料', () => {
  it('suggests per-unit usage for this order, capped by what is still needed', () => {
    expect(suggestAuxQuantity({ issuedQuantity: 0, orderQuantity: null, perUnit: 2 }, 15)).toBe(30);
    expect(suggestAuxQuantity({ issuedQuantity: 150, orderQuantity: 100, perUnit: 2 }, 40)).toBe(50);
    expect(suggestAuxQuantity({ issuedQuantity: 200, orderQuantity: 100, perUnit: 2 }, 40)).toBe(0);
    expect(suggestAuxQuantity({ issuedQuantity: 0, orderQuantity: 10, perUnit: 0.333 }, 3)).toBe(0.999);
  });

  it('splits the suggestion over stock rows first in first out', () => {
    expect(pickAuxStocks([{ id: 1, quantity: 20 }, { id: 2, quantity: 50 }, { id: 3, quantity: 9 }], 45)).toEqual([
      { quantity: 20, stockId: 1 },
      { quantity: 25, stockId: 2 },
    ]);
    expect(pickAuxStocks([{ id: 1, quantity: 5 }], 0)).toEqual([]);
  });

  it('shows aux stock by product with its own unit and contract', () => {
    const aux = { contractCode: 'HT-1', productCode: 'FL1', productName: '彩盒', unit: '个' };
    expect(stockTitle('AUX', '辅料', aux, makeLabels({} as Api.Options), 'FL-FL1-HT1')).toBe('彩盒');
    expect(stockSpec('AUX', aux, makeLabels({} as Api.Options))).toBe('FL1 · 定制 · HT-1');
    expect(stockSpec('AUX', { productCode: 'FL2' }, makeLabels({} as Api.Options))).toBe('FL2 · 通用');
    expect(stockUnit('AUX', aux, null)).toBe('个');
    expect(stockUnit('RAW', aux, 'kg')).toBe('kg');
    expect(isLayered('AUX')).toBe(false);
  });
});

describe('开片按板材规格算片数', () => {
  const board = { color: 'PU', length: 190, material: 'TPE', thickness: 4.5, width: 130 };
  const sheet = { color: 'PU', length: 183, thickness: 0.6, width: 61 };

  it('multiplies how many fit along length, width and thickness, trying both orientations', () => {
    expect(slicePerBoard(board, sheet)).toBe(1 * 2 * 7);
    // 长宽对调摆：190/61×130/183=0，换个方向 190/183×130/61=2，取多的；厚 4.5/0.9=5 层
    expect(slicePerBoard(board, { length: 61, thickness: 0.9, width: 183 })).toBe(2 * 5);
    expect(slicePerBoard(board, { length: 200, thickness: 0.6, width: 61 })).toBe(0);
    expect(slicePerBoard(board, { length: 183, width: 61 })).toBeUndefined();
  });

  it('fills good quantity from boards issued until the worker changes it', () => {
    const inputs = [line(1, 'BOARD', board, 'B1', 10)];
    const outputs = deriveOutputs('SLICE', inputs);
    Object.assign(outputs[0]!.attrs, { length: 183, thickness: 0.6, width: 61 });
    applySliceYield(inputs, outputs);
    expect(outputs[0]!.goodQuantity).toBe(140);
    expect(sliceHint(inputs, outputs, outputs[0]!)).toBe('每张开 14 片 × 10 张 = 140 片（不算锯缝损耗）');

    outputs[0]!.attrs.thickness = 0.9;
    applySliceYield(inputs, outputs);
    expect(outputs[0]!.goodQuantity).toBe(100);

    outputs[0]!.goodQuantity = 95;
    outputs[0]!.attrs.thickness = 0.6;
    applySliceYield(inputs, outputs);
    expect(outputs[0]!.goodQuantity).toBe(95);
  });

  it('leaves it to the worker when one color is cut into several sizes', () => {
    const inputs = [line(1, 'BOARD', board, 'B1', 10)];
    const outputs = [...deriveOutputs('SLICE', inputs), ...deriveOutputs('SLICE', inputs)];
    for (const o of outputs) Object.assign(o.attrs, { length: 183, thickness: 0.6, width: 61 });
    applySliceYield(inputs, outputs);
    expect(outputs[0]!.goodQuantity).toBeUndefined();
    expect(sliceHint(inputs, outputs, outputs[0]!)).toContain('请手填良品');
  });
});
