import type { InputLine } from './model';

import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { describe, expect, it } from 'vitest';

import {
  attrSummary,
  deriveOutputs,
  joinBatches,
  lineBatch,
  makeLabels,
  normalizeForStage,
  stageColumns,
  sumQty,
  validateOutputs,
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
