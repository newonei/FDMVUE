import type { Contract } from '#/api/fdmplatform';
import type { BusinessDocument } from '#/api/fdmplatform/business-documents';

import { describe, expect, it } from 'vitest';

import {
  businessDocumentActionDefinition,
  businessDocumentLines,
  importedOrderRemaining,
  requireBusinessDocumentKind,
} from './business-document-model';
const doc = {
  id: 'po',
  type: 'PURCHASE_ORDER',
  version: 0,
  record: {
    id: 'po',
    lines: [
      {
        id: 'l1',
        skuName: '产品',
        quantity: '0.3',
        arrivedQuantity: '0.2',
        returnedQuantity: '0.05',
        cancelledQuantity: '0.01',
      },
    ],
  },
  allowedActions: ['MATCH_SOURCE', 'CANCEL_ORDER', 'SAVE_DETAILS'],
} as BusinessDocument;
describe('standalone native business documents', () => {
  it('does not offer replacement of a known zero amount while still allowing company zero to be completed', () => {
    const invoice = {
      ...doc,
      type: 'PURCHASE_INVOICE',
      companyId: 0,
      record: { id: 'invoice', amount: 0, currency: 'CNY' },
      allowedActions: ['CONFIRM_INVOICE', 'SAVE_DETAILS'],
    };
    expect(
      businessDocumentActionDefinition(invoice, 'CONFIRM_INVOICE')!.fields.some(
        (field) => field.key === 'amount',
      ),
    ).toBe(false);
    expect(
      businessDocumentActionDefinition(invoice, 'SAVE_DETAILS')!.fields.some(
        (field) => field.key === 'companyId',
      ),
    ).toBe(true);
  });
  it('reads imported SKU and specification from the actual frozen snapshot', () => {
    expect(
      businessDocumentLines({
        ...doc,
        record: {
          id: 'po',
          lines: [
            {
              id: 'l1',
              quantity: 3,
              specificationSnapshot: {
                skuId: 'sku',
                unit: '张',
                specification: '瑜伽垫',
              },
            },
          ],
        },
      }),
    ).toMatchObject([
      {
        id: 'l1',
        quantity: 3,
        skuId: 'sku',
        unit: '张',
        specification: '瑜伽垫',
      },
    ]);
  });
  it('keeps known payment facts out of completion input and requires a positive human verification', () => {
    const definition = businessDocumentActionDefinition(
      {
        ...doc,
        type: 'PURCHASE_PAYMENT',
        record: { id: 'p', amount: '3637.31', currency: 'USD' },
        allowedActions: ['CONFIRM_PAYMENT_SOURCE'],
      },
      'CONFIRM_PAYMENT_SOURCE',
    )!;
    expect(definition.fields.some((field) => field.key === 'amount')).toBe(
      false,
    );
    expect(definition.fields.some((field) => field.key === 'currency')).toBe(
      false,
    );
    expect(
      definition.fields.find((field) => field.key === 'confirmExecuted')
        ?.required,
    ).toBe(true);
    expect(
      definition.fields.find((field) => field.key === 'evidenceRef')?.required,
    ).toBe(true);
  });
  it('requires a real contract for source refund verification and excludes unconfirmed receipts', () => {
    const source = {
      ...doc,
      type: 'REFUND',
      allowedActions: ['CONFIRM_REFUND_SOURCE'],
    };
    expect(
      businessDocumentActionDefinition(source, 'CONFIRM_REFUND_SOURCE'),
    ).toBeUndefined();
    const contract = {
      id: 'c',
      items: [],
      finance: {
        receipts: [
          {
            id: 'confirmed',
            kind: 'PAYMENT',
            status: 'CONFIRMED',
            amount: 20,
            currency: 'USD',
          },
          { id: 'pending', kind: 'PAYMENT', status: 'PENDING', amount: 20 },
        ],
      },
    } as unknown as Contract;
    expect(
      businessDocumentActionDefinition(
        source,
        'CONFIRM_REFUND_SOURCE',
        undefined,
        contract,
      )!.fields[0]?.options?.map((row) => row.value),
    ).toEqual(['confirmed']);
  });
  it('does not use a fabricated parent contract to identify a standalone order', () => {
    expect(requireBusinessDocumentKind(doc, 'orders')).toBe(doc);
    expect(() => requireBusinessDocumentKind(doc, 'receipts')).toThrow(
      '不属于当前菜单',
    );
  });
  it('uses exact net quantities including returns and only eligible lines for cancellation', () => {
    const action = businessDocumentActionDefinition(doc, 'CANCEL_ORDER')!;
    expect(
      importedOrderRemaining((doc.record.lines as { id: string }[])[0]!),
    ).toBe('0.14');
    expect(action.fields[0]?.options?.[0]?.fill?.quantity).toBe('0.14');
  });
  it('binds actual source line ids and the selected real contract without fabricating a plan', () => {
    const action = businessDocumentActionDefinition(
      doc,
      'MATCH_SOURCE',
      undefined,
      {
        id: 'c2',
        items: [{ id: 'ci', skuName: '产品', quantity: 1, unit: '张' }],
      } as Contract,
    )!;
    expect(action.initialValues).toEqual({
      contractId: 'c2',
      itemMappings: [{ lineId: 'l1', contractItemId: 'ci' }],
    });
    expect(action.fields.some((field) => field.key === 'planId')).toBe(false);
  });
  it('does not expose an action denied by the latest server state', () => {
    expect(
      businessDocumentActionDefinition(doc, 'RECORD_ARRIVAL'),
    ).toBeUndefined();
  });
});
