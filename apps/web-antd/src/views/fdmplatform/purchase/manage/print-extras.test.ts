import { describe, expect, it } from 'vitest';

import { orderDetailsPayload } from './model';
import {
  accessoryRows,
  additionalLineAmount,
  applyProductionExtras,
  boxCount,
  copyPrintExtras,
  printExtrasFrom,
  printExtrasImageIds,
  printExtrasPayload,
  productionExtrasFrom,
} from './print-extras';

describe('采购单附加资料', () => {
  it('订单备注兼容旧单、独立于内部备注，并在提交和历史复制时保留清空意图', () => {
    const details = {
      clauseIds: [],
      status: 'DRAFT' as const,
      version: 1,
      remark: '仅内部可见',
    };
    const old = printExtrasFrom(details);
    expect(old.orderRemark).toBe('');
    expect(printExtrasPayload(old).orderRemark).toBe('');
    expect(orderDetailsPayload(printExtrasPayload(old)).orderRemark).toBe('');
    const source = printExtrasFrom({
      ...details,
      orderRemark: '  第一批优先发货\n第二批另行通知  ',
    });
    expect(printExtrasPayload(source).orderRemark).toBe(
      '第一批优先发货\n第二批另行通知',
    );
    expect(orderDetailsPayload(printExtrasPayload(source)).orderRemark).toBe(
      '第一批优先发货\n第二批另行通知',
    );
    expect(details.remark).toBe('仅内部可见');
    expect(copyPrintExtras(old, source, [], [], {}).value.orderRemark).toBe(
      source.orderRemark,
    );
    expect(
      printExtrasPayload(copyPrintExtras(source, old, [], [], {}).value)
        .orderRemark,
    ).toBe('');
    source.orderRemark = '  \n  ';
    expect(printExtrasPayload(source).orderRemark).toBe('');
  });

  it('辅料清单保留已存的勾选与备注，清单新增项补在后面', () => {
    expect(
      accessoryRows(
        [
          { name: '定制网包', checked: true, remark: '72X25cm' },
          { name: 'OPP透明膜', checked: false },
        ],
        ['OPP透明膜', '定制网包', '吊牌'],
      ),
    ).toEqual([
      { name: '定制网包', checked: true, remark: '72X25cm' },
      { name: 'OPP透明膜', checked: false },
      { name: '吊牌', checked: false },
    ]);
  });

  it('箱数按数量除以装箱数向上取整', () => {
    expect(boxCount('250', 10)).toBe('25');
    expect(boxCount(251, 10)).toBe('26');
    expect(boxCount(250, undefined)).toBe('');
    expect(boxCount(0, 10)).toBe('');
  });

  it('提交时去掉空值；一项辅料都没勾就不提交清单', () => {
    const value = printExtrasFrom(
      {
        clauseIds: [],
        status: 'DRAFT',
        version: 1,
        lineExtras: {
          l1: { customerColor: ' Ocean Blue ', weight: '', packQty: 10 },
          l2: { weight: '  ' },
        },
        sharedColumns: [
          { title: '纹路', text: '贝壳纹', imageIds: [] },
          { title: '', text: '', imageIds: [] },
        ],
        packagingSteps: [{ title: '', text: '先包卡纸', imageIds: [] }],
      },
      ['吊牌'],
    );
    expect(printExtrasPayload(value)).toEqual({
      orderRemark: '',
      detailColumns: [],
      additionalLines: [],
      lineExtras: {
        l1: { customerColor: 'Ocean Blue', weight: '', packQty: 10 },
        l2: { weight: '' },
      },
      sharedColumns: [{ title: '纹路', text: '贝壳纹', imageIds: [] }],
      accessories: [],
      // 有内容没标题的步骤留给后端提示补标题
      packagingSteps: [{ title: '', text: '先包卡纸', imageIds: [] }],
    });
    value.accessories[0]!.checked = true;
    value.accessories[0]!.remark = ' 每条一个 ';
    expect(printExtrasPayload(value).accessories).toEqual([
      { name: '吊牌', checked: true, remark: '每条一个' },
    ]);
  });

  it('每行优先沿用已保存生产要求，缺项从本单快照回填，清空不回落旧值', () => {
    const snapshot = {
      colorMode: 'SINGLE',
      colorCode: 'BLUE',
      textureFront: 'WAVE',
      weight: '800g',
      model: '正反面都是红色',
    };
    expect(productionExtrasFrom({}, snapshot)).toEqual({
      colorMode: 'SINGLE',
      frontColor: 'BLUE',
      backColor: 'BLUE',
      textureFront: 'WAVE',
      weight: '800g',
    });
    const value = productionExtrasFrom(
      { textureFront: '', weight: '' },
      snapshot,
    );
    expect(value).toMatchObject({
      textureFront: '',
      weight: '',
      frontColor: 'BLUE',
    });
    const extras = printExtrasFrom({
      clauseIds: [],
      status: 'DRAFT',
      version: 1,
      lineExtras: { row: value },
    });
    expect(printExtrasPayload(extras).lineExtras.row).toEqual(value);
    expect(productionExtrasFrom({}, { model: '正面红反面蓝' })).toEqual({});
    expect(
      productionExtrasFrom({}, { colorMode: 'UNKNOWN', colorCode: 'BLUE' }),
    ).toEqual({ colorMode: 'UNKNOWN', frontColor: 'BLUE', backColor: 'BLUE' });
    expect(
      productionExtrasFrom({ frontColor: '' }, { colorCode: 'BLUE' }),
    ).toEqual({
      frontColor: '',
      backColor: 'BLUE',
    });
  });

  it('批量只修改选中的行和字段，可仅填空值，单色正反面始终同色', () => {
    const rows = {
      a: {
        colorMode: 'DUAL' as const,
        frontColor: 'RED',
        backColor: 'BLUE',
        textureFront: 'WAVE',
        weight: '',
      },
      b: { colorMode: 'UNKNOWN' as const, frontColor: '', model: '原型号' },
      c: { weight: '900g' },
    };
    applyProductionExtras(
      rows,
      ['a', 'b'],
      { colorMode: 'SINGLE', frontColor: 'GREEN', weight: '800g' },
      ['colorMode', 'frontColor', 'weight'],
      true,
    );
    expect(rows.a).toMatchObject({
      colorMode: 'DUAL',
      frontColor: 'RED',
      backColor: 'BLUE',
      textureFront: 'WAVE',
      weight: '800g',
    });
    expect(rows.b).toEqual({
      colorMode: 'SINGLE',
      frontColor: 'GREEN',
      backColor: 'GREEN',
      weight: '800g',
      model: '原型号',
    });
    expect(rows.c).toEqual({ weight: '900g' });
    applyProductionExtras(
      rows,
      ['a'],
      { colorMode: 'SINGLE', frontColor: 'GREEN', textureFront: '' },
      ['colorMode', 'frontColor', 'textureFront'],
    );
    expect(rows.a).toMatchObject({
      colorMode: 'SINGLE',
      frontColor: 'GREEN',
      backColor: 'GREEN',
      textureFront: '',
      weight: '800g',
    });
  });

  it('额外费用保留零单价并使用十进制计算金额，提交时不信任旧金额', () => {
    const value = printExtrasFrom({
      clauseIds: [],
      status: 'DRAFT',
      version: 1,
      additionalLines: [
        {
          id: 'fee',
          name: ' 加工费 ',
          quantity: 3,
          unitPrice: 0.1,
          unit: ' 次 ',
          amount: '999',
          imageIds: [],
        },
        {
          id: 'free',
          name: '免费打样',
          quantity: 1,
          unitPrice: 0,
          imageIds: [],
        },
      ],
    });
    expect(additionalLineAmount(value.additionalLines[0]!)).toBe('0.30');
    expect(additionalLineAmount(value.additionalLines[1]!)).toBe('0.00');
    expect(
      additionalLineAmount({ quantity: 1, unitPrice: 1.2345 }, 'BHD'),
    ).toBe('1.235');
    expect(additionalLineAmount({ quantity: 1, unitPrice: 1.5 }, 'JPY')).toBe(
      '2',
    );
    expect(printExtrasPayload(value).additionalLines).toMatchObject([
      { name: '加工费', quantity: 3, unitPrice: 0.1, unit: '次' },
      { name: '免费打样', quantity: 1, unitPrice: 0 },
    ]);
    expect(printExtrasPayload(value).additionalLines[0]).not.toHaveProperty(
      'amount',
    );
  });

  it('完整复制自定义列、色卡、附件及费用并替换所有图片，编辑副本不污染来源', () => {
    const details = {
      clauseIds: [],
      status: 'DRAFT' as const,
      version: 1,
      detailColumns: [{ id: 'color', title: '色卡', type: 'IMAGE' as const }],
      lineExtras: {
        s1: {
          remark: ' 印花对位 ',
          imageIds: ['attach'],
          customCells: { color: { imageIds: ['card'] } },
        },
      },
      additionalLines: [
        {
          id: 'free',
          name: '免费样品',
          quantity: 1,
          unitPrice: 0,
          imageIds: ['sample'],
          customCells: { color: { imageIds: ['card'] } },
        },
      ],
    };
    const source = printExtrasFrom(details);
    expect(new Set(printExtrasImageIds(source))).toEqual(
      new Set(['attach', 'card', 'sample']),
    );
    const result = copyPrintExtras(
      printExtrasFrom({ clauseIds: [], status: 'DRAFT', version: 1 }),
      source,
      [{ id: 's1', skuId: 'sku' }],
      [{ id: 't1', skuId: 'sku' }],
      { attach: 'new-attach', card: 'new-card', sample: 'new-sample' },
    );
    expect(result.value.lineExtras.t1).toMatchObject({
      remark: ' 印花对位 ',
      imageIds: ['new-attach'],
      customCells: { color: { imageIds: ['new-card'] } },
    });
    expect(result.value.additionalLines[0]).toMatchObject({
      unitPrice: 0,
      imageIds: ['new-sample'],
      customCells: { color: { imageIds: ['new-card'] } },
    });
    result.value.additionalLines[0]!.customCells!.color!.imageIds.push(
      'another',
    );
    expect(details.additionalLines[0]!.customCells.color.imageIds).toEqual([
      'card',
    ]);
    const payload = printExtrasPayload(result.value);
    expect(payload.lineExtras.t1!.remark).toBe('印花对位');
    result.value.detailColumns = [];
    expect(printExtrasPayload(result.value).lineExtras.t1).not.toHaveProperty(
      'customCells',
    );
  });

  it('从历史单复制：明细按产品对上，图片换成本单的新编号，对不上的行保留', () => {
    const source = printExtrasFrom({
      clauseIds: [],
      status: 'CONFIRMED',
      version: 3,
      lineExtras: {
        s1: {
          customerColor: 'Ocean Blue',
          packQty: 10,
          imageId: 'old-a',
          colorImageId: 'old-color',
        },
        s2: { weight: '1300g' },
      },
      sharedColumns: [{ title: '纹路', imageIds: ['old-b', 'gone'] }],
      accessories: [{ name: 'OPP透明膜', checked: true }],
      packagingSteps: [{ title: '1.包卡纸', imageIds: ['old-b'] }],
    });
    expect(printExtrasImageIds(source)).toEqual([
      'old-a',
      'old-color',
      'old-b',
      'gone',
    ]);
    const current = printExtrasFrom({
      clauseIds: [],
      status: 'DRAFT',
      version: 1,
      lineExtras: { t9: { weight: '保留' } },
    });
    const result = copyPrintExtras(
      current,
      source,
      [
        { id: 's1', skuId: 'sku-1' },
        { id: 's2', specificationSnapshot: { skuCode: 'DZ2' } },
      ],
      [
        { id: 't1', skuId: 'sku-1' },
        { id: 't2', specificationSnapshot: { skuCode: 'DZ2' } },
        { id: 't9', skuId: 'other' },
      ],
      { 'old-a': 'new-a', 'old-b': 'new-b', 'old-color': 'new-color' },
      ['OPP透明膜', '吊牌'],
    );
    expect(result.matched).toBe(2);
    expect(result.value.lineExtras).toEqual({
      t1: {
        customerColor: 'Ocean Blue',
        packQty: 10,
        imageId: 'new-a',
        colorImageId: 'new-color',
      },
      t2: { weight: '1300g' },
      t9: { weight: '保留' },
    });
    expect(result.value.sharedColumns[0]!.imageIds).toEqual(['new-b']);
    expect(result.value.packagingSteps[0]!.imageIds).toEqual(['new-b']);
    expect(printExtrasPayload(result.value).lineExtras.t1!.colorImageId).toBe(
      'new-color',
    );
    const withoutImages = copyPrintExtras(
      current,
      source,
      [{ id: 's1', skuId: 'sku-1' }],
      [{ id: 't1', skuId: 'sku-1' }],
      {},
    );
    expect(withoutImages.value.lineExtras.t1).not.toHaveProperty(
      'colorImageId',
    );
    expect(result.value.accessories).toEqual([
      { name: 'OPP透明膜', checked: true },
      { name: '吊牌', checked: false },
    ]);
  });
});
