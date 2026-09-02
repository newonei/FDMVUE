import { describe, expect, it } from 'vitest';

import { createTradePrototypeSeed } from './domain/mock-data';
import { findPageRow, rowsForPage } from './page-adapter';

describe('foreign trade prototype page adapters', () => {
  const state = createTradePrototypeSeed();

  it.each([
    ['customer', undefined],
    ['contract-order', undefined],
    ['demand-analysis', undefined],
    ['supplier', undefined],
    ['requisition', undefined],
    ['purchase-order', undefined],
    ['follow-up-customs', undefined],
    ['supply-execution', 'factory'],
    ['supply-execution', 'inbound'],
    ['shipment-outbound', 'shipment'],
    ['shipment-outbound', 'outbound'],
    ['receipt-writeoff', 'receipt'],
    ['receipt-writeoff', 'writeoff'],
    ['payable-expense', 'payment'],
    ['payable-expense', 'invoice'],
    ['payable-expense', 'expense'],
  ] as const)('provides realistic rows for %s/%s', (pageKey, tab) => {
    const rows = rowsForPage(state, pageKey, tab);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.id && row.primary && row.statusLabel)).toBe(
      true,
    );
  });

  it('finds records from non-default tabs for route-synced details', () => {
    const outbound = state.outboundDocuments[0]!;
    expect(findPageRow(state, 'shipment-outbound', outbound.id)?.rawType).toBe(
      'OUTBOUND_DOCUMENT',
    );

    const invoice = state.supplierInvoices[0]!;
    expect(findPageRow(state, 'payable-expense', invoice.id)?.rawType).toBe(
      'SUPPLIER_INVOICE',
    );
  });

  it('keeps amount currency explicit instead of combining currencies', () => {
    const rows = rowsForPage(state, 'payable-expense', 'payment');
    expect(rows.every((row) => !row.amount || row.currency)).toBe(true);
  });
});
