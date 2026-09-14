import type { CustomsBatch, CustomsSource } from '#/api/fdmplatform/customs';

import { describe, expect, it } from 'vitest';

import {
  canSelectCustomsShipment,
  customsSourceSelection,
  validateCustomsMeasurements,
  validateCustomsSelection,
} from './customsEditorModel';

function source(contractId = 'contract-a'): CustomsSource {
  return {
    contractId,
    contractCode: contractId,
    contractVersion: 2,
    companyId: 1,
    items: [
      {
        contractItemId: 'item-a',
        specVersion: 'v1',
        skuName: '产品甲',
        quantity: '10',
      },
      {
        contractItemId: 'item-b',
        specVersion: 'v2',
        skuName: '产品乙',
        quantity: '5',
      },
    ],
    purchaseOrders: [
      { id: 'po-a', lines: [{ contractItemId: 'item-a', specVersion: 'v1' }] },
    ],
    shipments: [
      {
        eventId: 'out-a',
        contractItemId: 'item-a',
        specVersion: 'v1',
        quantity: '4',
        availableQuantity: '2',
      },
      {
        eventId: 'out-b',
        contractItemId: 'item-b',
        specVersion: 'v2',
        quantity: '3',
        availableQuantity: '0',
      },
    ],
  };
}
function batch(): CustomsBatch {
  return {
    id: 'batch-a',
    contractId: 'contract-a',
    contractCode: 'contract-a',
    contractVersion: 2,
    companyId: 1,
    name: '已有批次',
    required: true,
    version: 8,
    status: 'PROCESSING',
    documentStatus: 'MISSING',
    allowedActions: ['UPDATE'],
    purchaseOrderIds: ['po-a'],
    lines: [{ contractItemId: 'item-a', quantity: '4' }],
    shipments: [{ eventId: 'out-a', quantity: '2' }],
  };
}
function selection(input = source()) {
  return { required: true, ...customsSourceSelection(input, batch()) };
}

describe('customs editor contract sources and quantities', () => {
  it('clears every previous selection on another contract, even if source IDs happen to match', () => {
    const selected = customsSourceSelection(source('contract-b'), batch());
    expect(selected.purchaseOrderIds).toEqual([]);
    expect(selected.lines.every((line) => !line.selected)).toBe(true);
    expect(selected.shipments.every((shipment) => !shipment.selected)).toBe(
      true,
    );
    expect(selected.lines[0]?.quantity).toBe('1');
  });

  it('preserves an edited batch and can reuse its own quantity returned by source(batchId)', () => {
    const input = source();
    const selected = selection(input);
    expect(selected.purchaseOrderIds).toEqual(['po-a']);
    expect(selected.lines[0]?.quantity).toBe('4');
    expect(selected.shipments[0]?.quantity).toBe('2');
    expect(validateCustomsSelection(selected, input)).toBe('');
    selected.shipments[0]!.quantity = '2.00000001';
    expect(validateCustomsSelection(selected, input)).toContain(
      '不能超过本次可关联数量 2',
    );
  });

  it('disables exhausted or wrong-product shipments and permits selecting available matching shipments', () => {
    const input = source();
    const selected = selection(input);
    expect(canSelectCustomsShipment(input.shipments[0]!, selected.lines)).toBe(
      true,
    );
    expect(canSelectCustomsShipment(input.shipments[1]!, selected.lines)).toBe(
      false,
    );
    selected.lines[0]!.selected = false;
    expect(canSelectCustomsShipment(input.shipments[0]!, selected.lines)).toBe(
      false,
    );
    selected.lines[0]!.selected = true;
    selected.lines[0]!.specVersion = 'old';
    expect(canSelectCustomsShipment(input.shipments[0]!, selected.lines)).toBe(
      false,
    );
  });

  it.each(['0', '-1', 'NaN', 'Infinity', '', '  '])(
    'rejects invalid product and shipment quantity %j',
    (value) => {
      const input = source();
      const selected = selection(input);
      selected.lines[0]!.quantity = value;
      expect(validateCustomsSelection(selected, input)).toContain(
        '本批数量须为有效正数',
      );
      selected.lines[0]!.quantity = '4';
      selected.shipments[0]!.quantity = value;
      expect(validateCustomsSelection(selected, input)).toContain(
        '发货分配数量须为有效正数',
      );
    },
  );

  it('compares decimal strings exactly and rejects plan quantities above the contract', () => {
    const input = source();
    input.shipments[0]!.availableQuantity = '0.30000000000000000001';
    const selected = selection(input);
    selected.shipments[0]!.quantity = '0.30000000000000000001';
    expect(validateCustomsSelection(selected, input)).toBe('');
    selected.shipments[0]!.quantity = '0.30000000000000000002';
    expect(validateCustomsSelection(selected, input)).toContain(
      '不能超过本次可关联数量',
    );
    selected.shipments[0]!.quantity = '0.3';
    selected.lines[0]!.quantity = '10.00000001';
    expect(validateCustomsSelection(selected, input)).toContain(
      '不能超过合同数量',
    );
  });

  it('rejects stale purchase orders, orders of unselected products, and missing shipment sources', () => {
    const input = source();
    const selected = selection(input);
    selected.purchaseOrderIds = ['other-contract-po'];
    expect(validateCustomsSelection(selected, input)).toContain(
      '不属于当前合同',
    );
    selected.purchaseOrderIds = ['po-a'];
    selected.lines[0]!.selected = false;
    selected.lines[1]!.selected = true;
    expect(validateCustomsSelection(selected, input)).toContain(
      '采购单必须包含本批已选产品',
    );
    selected.lines[0]!.selected = true;
    selected.shipments[0]!.eventId = 'other-contract-event';
    expect(validateCustomsSelection(selected, input)).toContain(
      '发货来源已变化',
    );
  });

  it('keeps stale selected shipment visible for correction while refusing exhausted stock or an unselected product', () => {
    const input = source();
    input.shipments[0]!.availableQuantity = '0';
    const selected = selection(input);
    expect(selected.shipments[0]!.selected).toBe(true);
    expect(validateCustomsSelection(selected, input)).toContain('无可关联余量');
    input.shipments[0]!.availableQuantity = '2';
    selected.purchaseOrderIds = [];
    selected.lines[0]!.selected = false;
    selected.lines[1]!.selected = true;
    expect(validateCustomsSelection(selected, input)).toContain(
      '未选择对应的合同产品',
    );
  });

  it('allows draft logistics to remain empty but never silently drops a selected shipment for a not-required batch', () => {
    const input = source();
    const selected = selection(input);
    selected.shipments[0]!.selected = false;
    expect(validateCustomsSelection(selected, input)).toBe('');
    selected.required = false;
    selected.shipments[0]!.selected = true;
    expect(validateCustomsSelection(selected, input)).toContain('不需报关');
    expect(
      validateCustomsMeasurements({
        packageCount: '',
        grossWeight: '',
        netWeight: '',
        volume: '',
      }),
    ).toBe('');
  });

  it('rejects invalid measurements before Number serialization can turn them into null', () => {
    const values = {
      packageCount: '0',
      grossWeight: '1.2',
      netWeight: '1.1',
      volume: '0.05',
    };
    expect(validateCustomsMeasurements(values)).toBe('');
    for (const packageCount of [
      'bad',
      'NaN',
      'Infinity',
      '1.5',
      '-1',
      '2147483648',
    ])
      expect(
        validateCustomsMeasurements({ ...values, packageCount }),
      ).toContain('箱数');
    expect(
      validateCustomsMeasurements({ ...values, grossWeight: 'bad' }),
    ).toContain('毛重');
    expect(
      validateCustomsMeasurements({ ...values, netWeight: '-1' }),
    ).toContain('净重');
    expect(
      validateCustomsMeasurements({ ...values, volume: 'Infinity' }),
    ).toContain('体积');
    expect(
      validateCustomsMeasurements({ ...values, netWeight: '1.3' }),
    ).toContain('毛重不能小于净重');
  });
});
