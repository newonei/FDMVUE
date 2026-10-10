import type { InputLine } from './model';

import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { describe, expect, it } from 'vitest';

import {
  attrSummary,
  deriveOutputs,
  EDITABLE_FIELDS,
  guessPackedAttrs,
  joinBatches,
  lineBatch,
  makeLabels,
  normalizeForStage,
  parseSizeText,
  stageColumns,
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
