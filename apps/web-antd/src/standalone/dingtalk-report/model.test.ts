import { describe, expect, it } from 'vitest';

import {
  bestWage,
  blockReason,
  buildPayload,
  createDraft,
  parseReportQuery,
  reportErrors,
  workbenchUrl,
} from './model';

const slice = {
  code: 'SLICE',
  label: '开片',
  outputLabel: '片材',
  outputStage: 'SHEET',
  outputUnit: '片',
  sources: ['BOARD'],
};

function prepare(overrides: Record<string, unknown> = {}): any {
  return {
    aux: [],
    picks: [
      {
        quantity: '5',
        stock: {
          batchNo: 'B1',
          id: 11,
          item: {
            color: 'PU',
            length: 190,
            material: 'TPE',
            thickness: 4.8,
            width: 130,
          },
          itemCode: 'BC-1',
          itemId: 1,
          location: '板材区',
          quantity: '20',
          stage: 'BOARD',
        },
      },
    ],
    sourceStage: 'BOARD',
    targetAttrs: { thickness: 0.6 },
    task: { id: 7, process: 'SLICE', quantity: '40', unit: '片' },
    ...overrides,
  };
}

describe('parseReportQuery', () => {
  it('keeps the factory and task in the full-workbench handoff', () => {
    expect(workbenchUrl(parseReportQuery('?taskId=7&factoryId=2'))).toBe(
      '/gongchang/workbench?factoryId=2&taskId=7',
    );
  });
  it('reads the task and factory from the card link', () => {
    expect(parseReportQuery('?taskId=7&factoryId=2')).toEqual({
      factoryId: 2,
      taskId: 7,
    });
  });

  it('rejects a broken link instead of reporting the wrong task', () => {
    for (const search of [
      '',
      '?taskId=7',
      '?taskId=abc&factoryId=2',
      '?taskId=0&factoryId=2',
    ]) {
      expect(() => parseReportQuery(search)).toThrow('报工链接无效');
    }
  });
});

describe('createDraft', () => {
  it('keeps the board length and width and uses the planned slicing thickness', () => {
    const { draft } = createDraft(prepare(), slice as any, 'TPE');
    expect(draft?.inputs[0]?.quantity).toBe(5);
    expect(draft?.output.attrs).toMatchObject({
      length: 190,
      thickness: 0.6,
      width: 130,
    });
  });

  it('uses this cutting task output instead of the finished-product dimensions', () => {
    const { draft } = createDraft(
      prepare({ outputAttrs: { length: 185, width: 65, thickness: 4.8 } }),
      { ...slice, code: 'CUT', outputStage: 'CUT' } as any,
    );
    expect(draft?.output.attrs).toMatchObject({
      length: 185,
      width: 65,
      thickness: 4.8,
    });
  });

  it('prices auxiliary material by the task quantity and skips ones without stock', () => {
    const { draft } = createDraft(
      prepare({
        aux: [
          {
            perUnit: '0.5',
            productName: '纸箱',
            stocks: [{ id: 21 }],
            unit: '个',
          },
          { perUnit: '1', productName: '没货的', stocks: [], unit: '个' },
        ],
      }),
      slice as any,
    );
    expect(draft?.aux).toEqual([
      { name: '纸箱', qty: 20, stockId: 21, unit: '个' },
    ]);
  });
});

describe('blockReason', () => {
  it('sends tasks without suggested material to the full workbench with the reason', () => {
    const task = prepare({ hint: '贴合请选正面、反面两种片材', picks: [] });
    const process = { ...slice, code: 'LAMINATE' };
    const { outputs } = createDraft(task, process as any);
    expect(blockReason(task, process as any, outputs)).toBe(
      '贴合请选正面、反面两种片材',
    );
  });

  it('sends incomplete specs to the full workbench', () => {
    const task = prepare({ targetAttrs: null });
    const process = { ...slice, code: 'EMBOSS', outputStage: 'EMBOSSED' };
    const { outputs } = createDraft(task, process as any);
    expect(blockReason(task, process as any, outputs)).toContain(
      '规格要自己选',
    );
  });

  it('routes even a single-spec slicing task to volume-based workbench reporting', () => {
    const task = prepare();
    const { outputs } = createDraft(task, slice as any);
    expect(blockReason(task, slice as any, outputs)).toContain('本次良品体积');
  });

  it('routes an already-issued non-slicing task to its existing order', () => {
    const task = prepare({ inProgressOrderId: 91 });
    const process = { ...slice, code: 'CUT', outputStage: 'CUT' };
    const { outputs } = createDraft(task, process as any);
    expect(blockReason(task, process as any, outputs)).toContain(
      '继续原工序单报工',
    );
  });
});

describe('reportErrors', () => {
  it('requires a quantity and the issue sheet photo', () => {
    const { draft } = createDraft(prepare(), slice as any);
    expect(reportErrors(draft!, [])).toEqual([
      '请填好的或坏的数量',
      '请拍领料单',
    ]);
    draft!.output.goodQuantity = 30;
    expect(reportErrors(draft!, [])).toEqual(['请拍领料单']);
    expect(reportErrors(draft!, ['u'])).toEqual([]);
  });

  it('accepts all defects but not zero material', () => {
    const { draft } = createDraft(prepare(), slice as any);
    draft!.output.defectQuantity = 2;
    expect(reportErrors(draft!, ['u'])).toEqual([]);
    draft!.inputs[0]!.quantity = 0;
    expect(reportErrors(draft!, ['u'])).toEqual(['请填用了多少料']);
  });
});

describe('buildPayload', () => {
  it('reports actual material, quantities, the photo and piecework for the reporter', () => {
    const { draft } = createDraft(
      prepare({
        aux: [
          {
            perUnit: '0.5',
            productName: '纸箱',
            stocks: [{ id: 21 }],
            unit: '个',
          },
        ],
      }),
      slice as any,
    );
    draft!.inputs[0]!.quantity = 4;
    draft!.output.goodQuantity = 30;
    draft!.output.defectQuantity = 1;
    const wage = bestWage([
      { itemId: 8, matched: false, name: '备选', score: 0, unit: '片' },
      { itemId: 9, matched: true, name: '开片', score: 1, unit: '片' },
    ]);
    const payload = buildPayload(7, 'BOARD', draft!, ['u'], wage, 164);
    expect(payload).toMatchObject({
      auxInputs: [{ quantity: 20, stockId: 21 }],
      inputs: [{ quantity: 4, stockId: 11 }],
      issueSheetUrls: ['u'],
      pieceworks: [{ itemId: 9, quantity: 30, userId: 164 }],
      sourceStage: 'BOARD',
      taskId: 7,
    });
    expect(payload.outputs[0]).toMatchObject({
      defectQuantity: 1,
      goodQuantity: 30,
    });
  });

  it('leaves piecework to the team lead without a wage item or good quantity', () => {
    const { draft } = createDraft(prepare(), slice as any);
    draft!.output.goodQuantity = 30;
    expect(
      buildPayload(7, 'BOARD', draft!, ['u'], undefined, 164).pieceworks,
    ).toEqual([]);
    draft!.output.goodQuantity = 0;
    draft!.output.defectQuantity = 3;
    const wage = {
      itemId: 9,
      matched: true,
      name: '开片',
      score: 1,
      unit: '片',
    };
    expect(
      buildPayload(7, 'BOARD', draft!, ['u'], wage, 164).pieceworks,
    ).toEqual([]);
  });
});
