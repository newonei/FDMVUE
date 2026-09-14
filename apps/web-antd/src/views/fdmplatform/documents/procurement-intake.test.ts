import type { ActionDefinition, Field } from '../data';
import type { DocumentKind } from './model';

import type { BusinessRecord, Contract } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import {
  availableOptions,
  documentActionDefinition,
  documentDefinitions,
  pendingRequestItems,
  procurementDocumentDefinition,
  procurementDocumentKind,
} from './model';

function fixture(): Contract {
  return {
    id: 'contract-a',
    code: 'HT-20260907-000001',
    name: '采购接单回归合同',
    companyId: 8,
    departmentId: 0,
    ownerUserId: 22,
    customerId: 'customer-a',
    customerName: '客户甲',
    businessType: 'FOREIGN',
    currency: 'CNY',
    status: 'EXECUTING',
    version: 17,
    businessVersion: 2,
    allowedActions: ['ASSIGN_FULFILLMENT'],
    items: [
      {
        id: 'product-line',
        skuId: 'product-a',
        skuName: '同款产品',
        specification: '标准规格',
        specVersion: 'spec-1',
        quantity: '100',
        unit: '件',
        unitPrice: '1',
      },
    ],
    requests: [
      {
        id: 'request-a',
        name: '申请甲',
        status: 'ACTIVE',
        items: [
          {
            id: 'request-line-a1',
            contractItemId: 'product-line',
            quantity: '0.3',
          },
          {
            id: 'request-line-a2',
            contractItemId: 'product-line',
            quantity: '2',
          },
        ],
      },
      {
        id: 'request-b',
        name: '申请乙',
        status: 'ACTIVE',
        items: [
          {
            id: 'request-line-b',
            contractItemId: 'product-line',
            quantity: '1',
          },
        ],
      },
      {
        id: 'request-full',
        name: '已分完申请',
        status: 'ACTIVE',
        items: [
          {
            id: 'request-line-full',
            contractItemId: 'product-line',
            quantity: '2',
          },
        ],
      },
      {
        id: 'request-cancelled',
        name: '已取消申请',
        status: 'CANCELLED',
        items: [
          {
            id: 'request-line-cancelled',
            contractItemId: 'product-line',
            quantity: '99',
          },
        ],
      },
    ],
    assignments: [
      {
        id: 'assignment-a1',
        requestId: 'request-a',
        requestItemId: 'request-line-a1',
        quantity: '0.1',
        method: 'BUY',
        status: 'ASSIGNED',
      },
      {
        id: 'assignment-a1-done',
        requestId: 'request-a',
        requestItemId: 'request-line-a1',
        quantity: '0.1',
        method: 'MAKE',
        status: 'COMPLETED',
      },
      {
        id: 'assignment-a1-cancelled',
        requestId: 'request-a',
        requestItemId: 'request-line-a1',
        quantity: '0.4',
        method: 'STOCK',
        status: 'CANCELLED',
      },
      {
        id: 'assignment-a2',
        requestId: 'request-a',
        requestItemId: 'request-line-a2',
        quantity: '0.5',
        method: 'MAKE',
        status: 'IN_PROGRESS',
      },
      {
        id: 'assignment-b',
        requestId: 'request-b',
        requestItemId: 'request-line-b',
        quantity: '0.4',
        method: 'BUY',
        status: 'ASSIGNED',
      },
      {
        id: 'assignment-full-buy',
        requestId: 'request-full',
        requestItemId: 'request-line-full',
        quantity: '1.5',
        method: 'BUY',
        status: 'ASSIGNED',
      },
      {
        id: 'assignment-full-stock',
        requestId: 'request-full',
        requestItemId: 'request-line-full',
        quantity: '0.5',
        method: 'STOCK',
        status: 'ASSIGNED',
      },
    ],
  };
}

function request(contract: Contract, id: string): BusinessRecord {
  const result = contract.requests?.find((entry) => entry.id === id);
  if (!result) throw new Error(`Missing request fixture ${id}`);
  return result;
}

function actionField(definition: ActionDefinition, key: string): Field {
  const result = definition.fields.find((entry) => entry.key === key);
  if (!result) throw new Error(`Missing action field ${key}`);
  return result;
}

describe('procurement intake navigation', () => {
  it('uses real unassigned purchase requests as the tasks intake resource', () => {
    expect(procurementDocumentKind('tasks', 'intake')).toBe('requests');
    const config = procurementDocumentDefinition('tasks', 'intake');
    expect(config.resource).toBe('purchase-intake');
    expect(config.fields).toContain('name|申请名称');
    expect(config.actions).toContain('ASSIGN_FULFILLMENT');
    expect(config.fields).not.toContain('method|履约方式');
  });

  it('keeps existing assignment records in the second queue', () => {
    expect(procurementDocumentKind('tasks', 'tasks')).toBe('tasks');
    expect(procurementDocumentDefinition('tasks', 'tasks').resource).toBe(
      'assignments',
    );
    expect(procurementDocumentDefinition('tasks', 'tasks').fields).toContain(
      'method|履约方式',
    );
  });

  it('does not reclassify other menus when a procurement queue is selected', () => {
    for (const kind of Object.keys(documentDefinitions) as DocumentKind[]) {
      if (kind === 'tasks') continue;
      for (const queue of ['intake', 'tasks'] as const) {
        expect(procurementDocumentKind(kind, queue)).toBe(kind);
        expect(procurementDocumentDefinition(kind, queue)).toEqual(
          documentDefinitions[kind],
        );
      }
    }
    expect(documentDefinitions.requests.resource).toBe('purchase-requests');
  });
});

describe('pending purchase request quantities', () => {
  it('deducts verified opening assigned quantities before new assignments without precision loss', () => {
    const contract = fixture();
    const item = (contract.requests![0]!.items as BusinessRecord[])[0]!;
    item.openingAssignedQuantity = '0.04';
    expect(
      pendingRequestItems(contract).find((row) => row.item.id === item.id)
        ?.remainingQuantity,
    ).toBe('0.06');
    item.openingAssignedQuantity = '0.1';
    expect(
      pendingRequestItems(contract).some((row) => row.item.id === item.id),
    ).toBe(false);
  });
  it('deducts all active fulfillment methods by request item and ignores cancelled assignments', () => {
    const contract = fixture();
    const before = structuredClone(contract);
    expect(
      pendingRequestItems(contract).map((entry) => [
        entry.requestId,
        entry.item.id,
        entry.remainingQuantity,
      ]),
    ).toEqual([
      ['request-a', 'request-line-a1', '0.1'],
      ['request-a', 'request-line-a2', '1.5'],
      ['request-b', 'request-line-b', '0.6'],
    ]);
    expect(contract).toEqual(before);
  });

  it('scopes to the selected request without mixing another request or repeated product lines', () => {
    const contract = fixture();
    expect(
      pendingRequestItems(contract, request(contract, 'request-b')).map(
        (entry) => [entry.requestId, entry.item.id, entry.remainingQuantity],
      ),
    ).toEqual([['request-b', 'request-line-b', '0.6']]);
    expect(
      pendingRequestItems(contract, request(contract, 'request-a')).map(
        (entry) => entry.item.id,
      ),
    ).toEqual(['request-line-a1', 'request-line-a2']);
  });

  it('excludes fully assigned, cancelled, empty and non-active requests', () => {
    const contract = fixture();
    expect(
      pendingRequestItems(contract, request(contract, 'request-full')),
    ).toEqual([]);
    expect(
      pendingRequestItems(contract, request(contract, 'request-cancelled')),
    ).toEqual([]);
    contract.requests = [
      { id: 'empty', status: 'ACTIVE', items: [] },
      {
        id: 'draft',
        status: 'DRAFT',
        items: [{ id: 'draft-line', quantity: '3' }],
      },
    ];
    expect(pendingRequestItems(contract)).toEqual([]);
    expect(
      pendingRequestItems({
        ...contract,
        requests: undefined,
        assignments: undefined,
      }),
    ).toEqual([]);
  });

  it('does not return zero or negative remaining quantities after an over-assignment', () => {
    const contract = fixture();
    contract.assignments?.push({
      id: 'over-assigned',
      requestId: 'request-b',
      requestItemId: 'request-line-b',
      quantity: '1',
      status: 'ASSIGNED',
    });
    expect(
      pendingRequestItems(contract, request(contract, 'request-b')),
    ).toEqual([]);
  });

  it('keeps decimal precision beyond IEEE-754 integer limits', () => {
    const contract = fixture();
    contract.requests = [
      {
        id: 'precise',
        status: 'ACTIVE',
        items: [
          {
            id: 'precise-line',
            contractItemId: 'product-line',
            quantity: '9007199254740993.3',
          },
        ],
      },
    ];
    contract.assignments = [
      {
        id: 'decimal-one',
        requestId: 'precise',
        requestItemId: 'precise-line',
        quantity: '0.1',
        status: 'ASSIGNED',
      },
      {
        id: 'decimal-two',
        requestId: 'precise',
        requestItemId: 'precise-line',
        quantity: '0.2',
        status: 'ASSIGNED',
      },
    ];
    expect(pendingRequestItems(contract)[0]?.remainingQuantity).toBe(
      '9007199254740993',
    );
  });
});

describe('request-row assignment form', () => {
  it('locks the selected request and offers only its unassigned items', () => {
    const contract = fixture();
    const definition = documentActionDefinition(
      contract,
      'requests',
      'ASSIGN_FULFILLMENT',
      [],
      [],
      request(contract, 'request-a'),
    );
    expect(definition.initialValues?.requestId).toBe('request-a');
    expect(actionField(definition, 'requestId').disabled).toBe(true);
    const children = availableOptions(
      actionField(definition, 'requestItemId'),
      definition.initialValues ?? {},
    );
    expect(children.map((entry) => entry.value)).toEqual([
      'request-line-a1',
      'request-line-a2',
    ]);
    expect(children.map((entry) => entry.value)).not.toContain(
      'request-line-b',
    );
    expect(actionField(definition, 'quantity').disabled).not.toBe(true);
  });

  it('preselects the only remaining item and exact quantity without preventing partial assignment', () => {
    const contract = fixture();
    const definition = documentActionDefinition(
      contract,
      'requests',
      'ASSIGN_FULFILLMENT',
      [],
      [],
      request(contract, 'request-b'),
    );
    expect(definition.initialValues?.requestId).toBe('request-b');
    expect(definition.initialValues?.requestItemId).toBe('request-line-b');
    expect(definition.initialValues?.quantity).toBe('0.6');
    expect(actionField(definition, 'requestId').disabled).toBe(true);
    expect(actionField(definition, 'quantity').disabled).not.toBe(true);
  });

  it('rejects an outdated entry for a cancelled or completely assigned request', () => {
    const contract = fixture();
    for (const id of ['request-full', 'request-cancelled']) {
      expect(() =>
        documentActionDefinition(
          contract,
          'requests',
          'ASSIGN_FULFILLMENT',
          [],
          [],
          request(contract, id),
        ),
      ).toThrow('此申请已取消或已全部分派，请刷新采购待办');
    }
  });

  it('excludes completed rows while keeping an unassigned sibling selectable', () => {
    const contract = fixture();
    contract.assignments?.push({
      id: 'finish-first',
      requestId: 'request-a',
      requestItemId: 'request-line-a1',
      quantity: '0.1',
      status: 'ASSIGNED',
    });
    const definition = documentActionDefinition(
      contract,
      'requests',
      'ASSIGN_FULFILLMENT',
      [],
      [],
      request(contract, 'request-a'),
    );
    const children = availableOptions(
      actionField(definition, 'requestItemId'),
      definition.initialValues ?? {},
    );
    expect(children.map((entry) => entry.value)).toEqual(['request-line-a2']);
    expect(definition.initialValues?.requestItemId).toBe('request-line-a2');
    expect(definition.initialValues?.quantity).toBe('1.5');
  });
});
